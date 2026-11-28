#!/usr/bin/env python3
"""Event-enriched diagnostic, not unbiased physical IN/OUT evaluation.
Frozen RF-DETR; compare plain IoU to high/low confidence continuation;
GT identity diagnostic is evaluation only, never a predictor."""
import hashlib
import json
import math
import os
import tempfile
import time
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from transformers import AutoImageProcessor
import run_public_bee_crossing_pilot as cross
import run_public_bee_frozen_pilot as frozen
import run_public_bee_native_pilot as native
import run_public_bee_full_cycle as full
import run_public_bee_roi_pilot as roi
import run_public_bee_query_head_pilot as base
import verify_public_bee_pilot_inputs as sources

LOW=.5
HIGH=.8
WINDOW=32
PER_DIRECTION=3
DIRECTIONS=("negative_to_positive","positive_to_negative")
B_ZONE=("11d3b343-3d9b-4aad-99cd-8211d9abe2a2",70,cross.B_ZONE_SHA)
EXCLUDED={roi.DEVELOPMENT:[(3001,3024)],
          roi.CONTROL:[(1557,1588),(3039,3086),(4521,4552)]}

def select_windows(refs,line,excluded):
    events=cross.trajectory_events(refs,line);used=set();chosen_tracks=set();out=[]
    for direction in DIRECTIONS:
        candidates=sorted((e for e in events if e["direction"]==direction),key=lambda e:(e["frame"],e["track"],e["alongPx"]))
        if len(candidates)<PER_DIRECTION:raise ValueError("insufficient "+direction+" reference events")
        for q in (.2,.5,.8):
            target=candidates[int(q*(len(candidates)-1))]["frame"]
            selected=None
            for event in sorted(candidates,key=lambda e:(abs(e["frame"]-target),e["frame"],e["track"])):
                start=math.floor(event["frame"])-15;ids=list(range(start,start+WINDOW))
                if event["track"] in chosen_tracks or any(f in used or f not in refs for f in ids):continue
                if any(start<=hi and ids[-1]>=lo for lo,hi in excluded):continue
                local=cross.trajectory_events({f:refs[f] for f in ids},line)
                if not any(x["track"]==event["track"] and x["direction"]==direction and abs(x["frame"]-event["frame"])<=2 for x in local):continue
                selected={"frames":ids,"anchorEvent":event,"targetQuantile":q};break
            if selected is None:raise ValueError("no nonoverlapping stable event window "+direction)
            out.append(selected);used.update(selected["frames"]);chosen_tracks.add(selected["anchorEvent"]["track"])
    return sorted(out,key=lambda x:x["frames"][0])

def continued_tracks(rows,samples):
    tracks={};active={};next_id=0;last=None;rescues=0;high_total=0
    for (_,boxes,scores,_),(_,_,ev,_) in zip(rows,samples):
        f=ev["frame"]
        if last is None or f!=last+1:active={}
        high=boxes[scores>=HIGH];low=boxes[(scores>=LOW)&(scores<HIGH)]
        ids=list(active);assigned={};used=set()
        for i,j,_ in full.match([active[k] for k in ids],high,.30):
            assigned[j]=ids[i];used.add(ids[i])
        current={}
        for j,b in enumerate(high):
            if j not in assigned:assigned[j]=next_id;next_id+=1
            current[assigned[j]]=b
        high_total+=len(high)
        remaining=[k for k in ids if k not in used]
        for i,j,_ in full.match([active[k] for k in remaining],low,.50):
            current[remaining[i]]=low[j];rescues+=1
        tracks[f]=current;active=current;last=f
    return tracks,{"lowConfidenceContinuations":rescues,"highObservations":high_total,
        "newTracksOnlyHigh":True,"lowThreshold":LOW,"highThreshold":HIGH,"lowMatchIoU":.5}

def identity_diagnostic(rows,samples,refs):
    tracks={}
    for (_,boxes,scores,_),(_,_,ev,_) in zip(rows,samples):
        f=ev["frame"];b=boxes[scores>=HIGH];truth=refs[f];keys=list(truth)
        tracks[f]={keys[i]:b[j] for i,j,_ in full.match(list(truth.values()),b,.5)}
    return tracks

def by_direction(ref,pred):
    return {d:cross.match_events([x for x in ref if x["direction"]==d],
                                [x for x in pred if x["direction"]==d]) for d in DIRECTIONS}

def aggregate(windows,key):
    result={}
    for d in ("all",*DIRECTIONS):
        vals=[w[key]["all"] if d=="all" else w[key]["byDirection"][d] for w in windows]
        tp=sum(x["tp"] for x in vals);fp=sum(x["fp"] for x in vals);fn=sum(x["fn"] for x in vals)
        result[d]={"tp":tp,"fp":fp,"fn":fn,"precision":tp/(tp+fp) if tp+fp else None,
            "recall":tp/(tp+fn) if tp+fn else None,"f1":2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None}
    return result

def score(ref,pred):
    return {"all":cross.match_events(ref,pred),"byDirection":by_direction(ref,pred)}

def run(out,delta):
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.set_num_interop_threads(1);torch.manual_seed(base.SEED)
    out.mkdir(parents=True,exist_ok=True);start=time.monotonic()
    report={"scope":"event-enriched crossing proxy diagnostic; not physical entrance counts",
      "sourceRun":46117679978,"deltaSha256":frozen.DELTA_SHA,"sourceAttempts":{},"phases":{},
      "selection":{},"comparisons":{},"training":False,"directionCountingEvaluated":False,
      "physicalEntranceGroundTruth":False,"productRecognitionAuthorized":False,"cleanupAuthorized":False,
      "androidVerified":False,"representativeEventSample":False}
    def checkpoint():
        (out/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")
        print("RF_EVENT_CHECKPOINT",json.dumps(report["phases"]),flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix="paseka-event-") as directory:
            root=Path(directory);prepared={}
            for name,video,tracks,zone in ((roi.DEVELOPMENT,base.VIDEO,base.TRACKS,cross.A_ZONE),
                    (roi.CONTROL,roi.CONTROL_VIDEO,roi.CONTROL_TRACKS,B_ZONE)):
                t=frozen.acquire_checked(root,name,name+" tracks",tracks,sources.MAX_LABELS,".txt",report)
                z=frozen.acquire_checked(root,name,name+" zone",zone,65536,".zone",report)
                poly=roi.parse_zone(z.read_text(encoding="ascii"));refs=cross.roi_references(roi.load_ids(t),poly);line=cross.line_for(poly)
                windows=select_windows(refs,line,EXCLUDED[name])
                report["selection"][name]=windows
                prepared[name]=(video,refs,poly,line,windows)
            report["phases"]["selection"]="PREDECLARED_EVENT_ENRICHED_WINDOWS_FIXED";checkpoint()
            md=root/"model";md.mkdir()
            sources.download(base.MODEL_URL,md/"model.safetensors",base.MAX_MODEL,base.MODEL_SHA,121926336)
            for filename,(sha,size,rev) in roi.CONFIGS.items():
                sources.download(f"https://huggingface.co/Roboflow/rf-detr-nano/resolve/{rev}/{filename}",md/filename,65536,sha,size)
            model,report["frozenModel"]=frozen.load_frozen(md,delta)
            processor=AutoImageProcessor.from_pretrained(md,local_files_only=True,trust_remote_code=False)
            report["phases"]["model"]="EXACT_DELTA_RESTORED";checkpoint()
            for name,(video,refs,poly,line,windows) in prepared.items():
                path=frozen.acquire_checked(root,name,name+" video",video,sources.MAX_VIDEO,".mp4",report)
                result=[];report["comparisons"][name]={"windows":result};seen=set()
                for selected in windows:
                    ids=selected["frames"];samples=[]
                    for f,px in zip(ids,base.decode(path,ids)):
                        digest=hashlib.sha256(px.tobytes()).hexdigest()
                        if digest in seen:raise ValueError("duplicate decoded frame")
                        seen.add(digest);samples.append((Image.fromarray(px),list(refs[f].values()),{"frame":f,"decodedSha256":digest},poly))
                    if len(samples)!=WINDOW:raise ValueError("incomplete frame decode")
                    rows,perf=frozen.reduced_predictions(model,processor,samples)
                    ref={f:refs[f] for f in ids};events=cross.trajectory_events(ref,line)
                    baseline=cross.predicted_tracks(rows,samples)
                    continued,rescues=continued_tracks(rows,samples)
                    oracle=identity_diagnostic(rows,samples,ref)
                    result.append({"frames":ids,"anchorDirection":selected["anchorEvent"]["direction"],
                        "detection":native.metric(rows,HIGH),"perf":perf,
                        "plain":score(events,cross.trajectory_events(baseline,line)),
                        "continuation":score(events,cross.trajectory_events(continued,line)),
                        "identityDiagnostic":score(events,cross.trajectory_events(oracle,line)),
                        "continuations":rescues})
                    report["phases"][name+" window "+str(ids[0])]="MEASURED";checkpoint()
                for key in ("plain","continuation","identityDiagnostic"):
                    report["comparisons"][name][key]=aggregate(result,key)
                report["phases"][name]="COMPLETE";checkpoint()
            report["continuationResearchCandidate"]=all(
                v["continuation"]["all"]["fn"]<v["plain"]["all"]["fn"] and
                v["continuation"]["all"]["fp"]<=v["plain"]["all"]["fp"] and
                all(v["continuation"][d]["fn"]<=v["plain"][d]["fn"] for d in DIRECTIONS)
                for v in report["comparisons"].values())
            report["status"]="EVENT_PROXY_RESEARCH_COMPLETED"
    except Exception as exc:
        report["status"]="STOP_WITHOUT_ACCEPTANCE";report["errorType"]=type(exc).__name__;report["detail"]=str(exc)[:280]
    report["elapsedSec"]=time.monotonic()-start;checkpoint()
    return report

if __name__=="__main__":
    import sys
    r=run(Path(sys.argv[1]),Path(sys.argv[2]));print("PUBLIC_BEE_EVENT_REPORT",json.dumps(r,sort_keys=True,allow_nan=False),flush=True)
    raise SystemExit(0 if r["status"]=="EVENT_PROXY_RESEARCH_COMPLETED" else 1)
