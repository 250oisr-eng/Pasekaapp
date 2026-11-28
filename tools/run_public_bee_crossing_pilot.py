#!/usr/bin/env python3
"""Independent crossing proxy benchmark. A publisher ROI bisector is NOT
the physical hive entrance. No claims of arrival/departure ground truth.
Use exact frozen detector, fixed time windows, plain adjacent IoU tracker."""
import hashlib
import json
import os
import tempfile
import time
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.optimize import linear_sum_assignment
import torch
from transformers import AutoImageProcessor
import run_public_bee_frozen_pilot as frozen
import run_public_bee_native_pilot as native
import run_public_bee_full_cycle as full
import run_public_bee_roi_pilot as roi
import run_public_bee_query_head_pilot as base
import verify_public_bee_pilot_inputs as sources

A_ZONE=("7fa8a906-4f75-4559-bd60-9b557ec2c8a8",70,"23a339cef571975e18fdaafbb01c988c0e3ec4668bac7a491c8effe54ad50580")
B_ZONE_SHA="217f7c1ce4c03fff116069327c0d6d20cc7dd54768507b532c4b6960786eaf33"
DEADBAND=12.
DWELL=2
WINDOW=32
PIXELS=np.array([base.WIDTH,base.HEIGHT],dtype=float)

def line_for(poly):
    poly=np.asarray(poly,dtype=float)*PIXELS
    if poly.shape!=(4,2) or not np.isfinite(poly).all():raise ValueError("invalid polygon")
    a=(poly[0]+poly[3])/2;b=(poly[1]+poly[2])/2
    v=b-a;length=np.linalg.norm(v)
    if length<=2*DEADBAND:raise ValueError("line too short")
    return a,v/length,float(length)

def trajectory_events(frames,line,stride=1):
    """Only contiguous observations, confirmed stable sides, no gap bridging.
    Count repeat crossings as separate geometric events (not unique bees)."""
    a,u,length=line
    normal=np.array([-u[1],u[0]])
    state={};events=[]
    for f in sorted(frames):
        for k,box in frames[f].items():
            b=np.asarray(box,dtype=float)
            if b.shape!=(4,) or not np.isfinite(b).all():raise ValueError("invalid box")
            p=(b[:2]+b[2:])*PIXELS/2
            d=float((p-a)@normal);side=1 if d>=DEADBAND else -1 if d<=-DEADBAND else 0
            s=state.get(k)
            if s is None or f-s["frame"]!=stride:
                s={"frame":f,"stable":0,"pending":0,"n":0,"lastStable":None,"firstOpposite":None}
            s["frame"]=f
            if side==0:
                s["pending"]=0;s["n"]=0;s["firstOpposite"]=None
            elif side==s["stable"]:
                s["lastStable"]=(f,p,d);s["pending"]=0;s["n"]=0;s["firstOpposite"]=None
            else:
                if side!=s["pending"]:
                    s["pending"]=side;s["n"]=1;s["firstOpposite"]=(f,p,d)
                else:s["n"]+=1
                if s["n"]>=DWELL:
                    prev=s["lastStable"];first=s["firstOpposite"]
                    if s["stable"] and prev is not None and first is not None:
                        f0,p0,d0=prev;f1,p1,d1=first
                        weight=-d0/(d1-d0)
                        point=p0+weight*(p1-p0);along=float((point-a)@u)
                        if 0<=along<=length:
                            events.append({"track":int(k),"frame":float(f0+weight*(f1-f0)),
                                "alongPx":along,"direction":"negative_to_positive" if side==1 else "positive_to_negative"})
                    s["stable"]=side;s["lastStable"]=(f,p,d);s["pending"]=0;s["n"]=0;s["firstOpposite"]=None
            state[k]=s
        # Drop absent tracks; no identity/gap interpolation across missed detections.
        state={k:v for k,v in state.items() if k in frames[f]}
    return events

def directions(events):
    return {d:sum(e["direction"]==d for e in events) for d in ("negative_to_positive","positive_to_negative")}

def match_events(reference,predicted,frame_tolerance=5.,px_tolerance=30.):
    if not reference or not predicted:
        count=0
    else:
        costs=np.zeros((len(reference),len(predicted)),dtype=float)
        ok=np.zeros_like(costs,dtype=bool)
        for i,a in enumerate(reference):
            for j,b in enumerate(predicted):
                dt=abs(a["frame"]-b["frame"]);dp=abs(a["alongPx"]-b["alongPx"])
                ok[i,j]=a["direction"]==b["direction"] and dt<=frame_tolerance and dp<=px_tolerance
                costs[i,j]=dt/frame_tolerance+dp/px_tolerance
        # Cardinality-first, then smallest normalized spatiotemporal error.
        r,c=linear_sum_assignment(np.where(ok,costs-(2*min(costs.shape)+3),0))
        count=int(ok[r,c].sum())
    fp=len(predicted)-count;fn=len(reference)-count
    return {"tp":count,"fp":fp,"fn":fn,"precision":count/(count+fp) if count+fp else None,
      "recall":count/(count+fn) if count+fn else None,
      "f1":2*count/(2*count+fp+fn) if 2*count+fp+fn else None,
      "reference":directions(reference),"predicted":directions(predicted),
      "frameTolerance":frame_tolerance,"positionTolerancePx":px_tolerance}

def roi_references(refs,poly):
    return {f:{k:b for (k,b),valid in zip(row.items(),roi.inside(list(row.values()),poly)) if valid} for f,row in refs.items()}

def predicted_tracks(rows,samples):
    tracks={};active={};next_id=0;last=None
    for (_,b,s,_),(_,_,ev,_) in zip(rows,samples):
        f=ev["frame"];b=b[s>=frozen.THRESHOLD]
        if last is None or f!=last+1:active={}
        old=list(active);assigned={}
        for i,j,_ in full.match([active[k] for k in old],b,.30):assigned[j]=old[i]
        current={}
        for j,box in enumerate(b):
            if j not in assigned:assigned[j]=next_id;next_id+=1
            current[assigned[j]]=box
        tracks[f]=current;active=current;last=f
    return tracks

def windows(refs):
    keys=sorted(refs);available=set(keys);result=[]
    for q in (.25,.75):
        target=keys[int(q*(len(keys)-1))]
        candidates=[f for f in keys if all(f+i in available for i in range(WINDOW))]
        if not candidates:raise ValueError("no consecutive fixed window")
        start=min(candidates,key=lambda f:(abs(f-target),f))
        ids=list(range(start,start+WINDOW))
        if any(set(ids)&set(other) for other in result):raise ValueError("overlapping windows")
        result.append(ids)
    return result

def census(refs,poly):
    line=line_for(poly);result={};events0=trajectory_events(refs,line)
    origin=min(refs)
    result["full"]={"events":directions(events0),"frames":len(refs),"referenceObservations":sum(map(len,refs.values()))}
    for stride in (2,5,10):
        sub={f:v for f,v in refs.items() if (f-origin)%stride==0}
        events=trajectory_events(sub,line,stride)
        result[str(stride)]={"frames":len(sub),"comparisonToDenseReference":match_events(events0,events,max(5.,2.*stride))}
    return result

def run(out,delta):
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.set_num_interop_threads(1);torch.manual_seed(base.SEED)
    out.mkdir(parents=True,exist_ok=True);start=time.monotonic()
    report={"scope":"geometric ROI bisector crossing proxy, not hive IN/OUT", "sourceRun":46117679978,
      "deltaSha256":frozen.DELTA_SHA,"sourceAttempts":{},"phases":{},"referenceCensus":{},"windows":[],
      "training":False,"directionCountingEvaluated":False,"physicalEntranceGroundTruth":False,
      "productRecognitionAuthorized":False,"cleanupAuthorized":False,"androidVerified":False}
    def checkpoint():
        (out/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")
        print("RF_CROSSING_CHECKPOINT",json.dumps(report["phases"]),flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix="paseka-crossing-") as directory:
            root=Path(directory);zones=roi.zone_catalog()
            if zones[roi.DEVELOPMENT]!=A_ZONE or zones[roi.CONTROL][1:]!=(70,B_ZONE_SHA):
                raise ValueError("publisher zone pin mismatch")
            all_refs={};polys={}
            for name,tracks,zone in ((roi.DEVELOPMENT,base.TRACKS,A_ZONE),(roi.CONTROL,roi.CONTROL_TRACKS,zones[roi.CONTROL])):
                t=frozen.acquire_checked(root,name,name+" tracks",tracks,sources.MAX_LABELS,".txt",report)
                z=frozen.acquire_checked(root,name,name+" zone",zone,65536,".zone",report)
                poly=roi.parse_zone(z.read_text(encoding="ascii"));refs=roi_references(roi.load_ids(t),poly)
                all_refs[name]=refs;polys[name]=poly
                report["referenceCensus"][name]=census(refs,poly)
                report["phases"][name+" reference"]="GEOMETRIC_PROXY_CENSUS";checkpoint()
            name=roi.CONTROL;refs=all_refs[name];poly=polys[name];line=line_for(poly)
            ids_list=windows(refs)
            report["fixedWindows"]=ids_list
            report["phases"]["windows"]="FIXED_QUARTILE_WINDOWS";checkpoint()
            v=frozen.acquire_checked(root,name,name+" video",roi.CONTROL_VIDEO,sources.MAX_VIDEO,".mp4",report)
            md=root/"model";md.mkdir()
            sources.download(base.MODEL_URL,md/"model.safetensors",base.MAX_MODEL,base.MODEL_SHA,121926336)
            for filename,(sha,size,rev) in roi.CONFIGS.items():
                sources.download(f"https://huggingface.co/Roboflow/rf-detr-nano/resolve/{rev}/{filename}",md/filename,65536,sha,size)
            model,report["frozenModel"]=frozen.load_frozen(md,delta)
            processor=AutoImageProcessor.from_pretrained(md,local_files_only=True,trust_remote_code=False)
            report["phases"]["model"]="EXACT_DELTA_RESTORED";checkpoint()
            seen=set()
            for ids in ids_list:
                samples=[]
                for f,px in zip(ids,base.decode(v,ids)):
                    digest=hashlib.sha256(px.tobytes()).hexdigest()
                    if digest in seen:raise ValueError("duplicate decoded frame")
                    seen.add(digest);samples.append((Image.fromarray(px),list(refs[f].values()),{"frame":f,"decodedSha256":digest},poly))
                if len(samples)!=len(ids):raise ValueError("missing decoded frames")
                rows,perf=frozen.reduced_predictions(model,processor,samples)
                pred=predicted_tracks(rows,samples)
                reference={f:refs[f] for f in ids}
                gt_events=trajectory_events(reference,line);pred_events=trajectory_events(pred,line)
                report["windows"].append({"frames":ids,"detection":native.metric(rows,frozen.THRESHOLD),
                    "tracking":full.track(reference,{f:b[s>=frozen.THRESHOLD] for f,(_,b,s,_) in zip(ids,rows)},False),
                    "crossingProxy":match_events(gt_events,pred_events),
                    "referenceEvents":gt_events,"predictedEvents":pred_events,"perf":perf})
                report["phases"]["window"+str(ids[0])]="ACTUAL_PREDICTIONS_MEASURED";checkpoint()
            total=sum(w["crossingProxy"]["tp"]+w["crossingProxy"]["fn"] for w in report["windows"])
            report["proxyEvidenceSufficient"]=total>=10
            report["status"]="CROSSING_PROXY_RESEARCH_COMPLETED"
    except Exception as exc:
        report["status"]="STOP_WITHOUT_ACCEPTANCE";report["errorType"]=type(exc).__name__;report["detail"]=str(exc)[:280]
    report["elapsedSec"]=time.monotonic()-start;checkpoint()
    return report

if __name__=="__main__":
    import sys
    r=run(Path(sys.argv[1]),Path(sys.argv[2]));print("PUBLIC_BEE_CROSSING_REPORT",json.dumps(r,sort_keys=True,allow_nan=False),flush=True)
    raise SystemExit(0 if r["status"]=="CROSSING_PROXY_RESEARCH_COMPLETED" else 1)
