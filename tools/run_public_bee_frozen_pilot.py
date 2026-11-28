#!/usr/bin/env python3
"""Frozen RF-DETR bee detector: same weights and threshold, paired ROI tiling
and tracking comparison on authorized public Mendeley v6 video.
No fitting, user media, count-direction truth or product admission."""
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
from torchvision.ops import nms
from safetensors import safe_open
from transformers import AutoImageProcessor
import run_public_bee_native_pilot as native
import run_public_bee_full_cycle as full
import run_public_bee_transfer_pilot as transfer
import run_public_bee_roi_pilot as roi
import run_public_bee_query_head_pilot as base
import verify_public_bee_pilot_inputs as sources

DELTA_SHA="200367277181fbb29dbb530bb7df5f0eff97684ed25eee3b86520d08fa1ca999"
DELTA_BYTES=6422772
THRESHOLD=.8
MARGIN=32
B_FRAME_COUNT=48
A_FRAME_COUNT=24

def axis_cover(size,tile,lo,hi,margin=MARGIN):
    if not 0<=lo<=hi<=size or not 0<tile<=size or margin<0:
        raise ValueError("invalid ROI extent")
    start=min(max(0,math.floor(lo)-margin),size-tile)
    stop=min(max(0,math.ceil(hi)+margin-tile),size-tile)
    stop=max(start,stop)
    result=list(range(start,stop+1,tile))
    if result[-1]!=stop:result.append(stop)
    return result

def roi_tiles(image,poly):
    if poly is None:raise ValueError("ROI required")
    if image.width<full.W or image.height<full.H:raise ValueError("video too small")
    x=axis_cover(image.width,full.W,poly[:,0].min()*image.width,poly[:,0].max()*image.width)
    y=axis_cover(image.height,full.H,poly[:,1].min()*image.height,poly[:,1].max()*image.height)
    for yy in y:
        for xx in x:
            yield xx,yy,full.W,full.H,image.crop((xx,yy,xx+full.W,yy+full.H))

def load_frozen(md,delta):
    if delta.stat().st_size!=DELTA_BYTES or hashlib.sha256(delta.read_bytes()).hexdigest()!=DELTA_SHA:
        raise ValueError("frozen delta digest/size mismatch")
    model,params,info=native.model_load(md)
    with safe_open(str(delta),framework="pt",device="cpu") as f:
        meta=f.metadata() or {}
        if meta.get("base_sha256")!=base.MODEL_SHA or meta.get("threshold")!=str(THRESHOLD) or meta.get("scope")!="research-only":
            raise ValueError("frozen delta metadata mismatch")
        if set(f.keys())!=set(params):raise ValueError("delta keyset mismatch")
        with torch.no_grad():
            for n,p in params.items():
                t=f.get_tensor(n)
                if t.shape!=p.shape or t.dtype!=p.dtype or not torch.isfinite(t).all():
                    raise ValueError("invalid delta tensor "+n)
                p.copy_(t)
    for p in model.parameters():p.requires_grad_(False)
    model.eval()
    return model,{**info,"deltaSha256":DELTA_SHA,"deltaBytes":DELTA_BYTES,"loadedTensors":len(params),"threshold":THRESHOLD}

def reduced_predictions(model,processor,samples):
    rows=[];total=0;elapsed=0
    for image,gt,ev,poly in samples:
        start=time.monotonic();items=list(roi_tiles(image,poly));bb=[];ss=[]
        for i in range(0,len(items),2):
            batch=items[i:i+2]
            data=processor(images=[v[4] for v in batch],return_tensors="pt",size={"height":384,"width":384})
            with torch.inference_mode():out=model(**data)
            if out.logits.shape[-1]!=1:raise ValueError("unexpected class dimension")
            boxes=native.xyxy(out.pred_boxes).numpy();scores=out.logits[...,0].sigmoid().numpy()
            if not np.isfinite(boxes).all() or not np.isfinite(scores).all():raise ValueError("nonfinite predictions")
            for (x,y,cw,ch,_),b,s in zip(batch,boxes,scores):
                center=(b[:,:2]+b[:,2:])/2
                valid=(center[:,0]>=0)&(center[:,0]*full.W<cw)&(center[:,1]>=0)&(center[:,1]*full.H<ch)
                b[:,[0,2]]=(b[:,[0,2]]*full.W+x)/image.width;b[:,[1,3]]=(b[:,[1,3]]*full.H+y)/image.height
                b=b.clip(0,1);valid&=(b[:,2]>b[:,0])&(b[:,3]>b[:,1])&roi.inside(b,poly)
                bb.extend(b[valid]);ss.extend(s[valid])
        b=np.asarray(bb,dtype=np.float32).reshape(-1,4);s=np.asarray(ss,dtype=np.float32)
        keep=nms(torch.from_numpy(b),torch.from_numpy(s),.5).numpy()
        rows.append((gt,b[keep],s[keep],{"tiles":len(items),"ortMs":0,"pipelineMs":(time.monotonic()-start)*1000}))
        total+=len(items);elapsed+=time.monotonic()-start
    return rows,{"tiles":total,"elapsedSec":elapsed}

def track_result(rows,samples,refs):
    pred={};truth={}
    for (gt,b,s,_),(_,_,ev,poly) in zip(rows,samples):
        f=ev["frame"];pred[f]=b[s>=THRESHOLD]
        truth[f]={k:v for k,v in refs[f].items() if roi.inside([v],poly)[0]}
        if list(truth[f].values())!=gt:raise ValueError("ROI reference mismatch")
    return {"baseline":full.track(truth,pred,False),"motionMemory":full.track(truth,pred,True)}

def b_frames(refs):
    ids=roi.consecutive(refs,12)
    start=ids[0];result=list(range(start,start+B_FRAME_COUNT))
    if not all(i in refs for i in result):raise ValueError("48-frame extension unavailable")
    return result

def verify_catalog_pair(catalog,name,video,tracks):
    pairs=[p for p in catalog["pairs"] if p["recording"]==name]
    if len(pairs)!=1:raise ValueError("missing/ambiguous pinned recording")
    for kind,pin in (("video",video),("labels",tracks)):
        r=pairs[0][kind]
        if (r["uuid"],r["bytes"],r["sha256"])!=pin:
            raise ValueError("publisher catalog differs from pinned "+kind)
    return pairs[0]

def acquire_checked(root,name,kind,pin,cap,suffix,report):
    uid,size,sha=pin
    path=root/(name+suffix)
    row={"uuid":uid,"expectedBytes":size,"expectedSha256":sha,"state":"REQUESTED"}
    report["sourceAttempts"][kind]=row
    try:
        evidence=sources.download(sources.source_url(uid),path,cap,sha,size)
    except Exception as exc:
        row["state"]="REJECTED"
        row["errorType"]=type(exc).__name__
        row["error"]=str(exc)[:160]
        if path.is_file():
            row["observedBytes"]=path.stat().st_size
            if row["observedBytes"]<=cap:
                digest=hashlib.sha256()
                with path.open("rb") as stream:
                    for part in iter(lambda:stream.read(1024*1024),b""):digest.update(part)
                row["observedSha256"]=digest.hexdigest()
        raise ValueError("pinned "+kind+" rejected; see sourceAttempts") from exc
    row.update(evidence);row["state"]="VERIFIED"
    return path

def acquire_a(root,report):
    name=roi.DEVELOPMENT
    report["publisherPair"]=verify_catalog_pair(sources.tracking_catalog(),name,base.VIDEO,base.TRACKS)
    zones=roi.zone_catalog()
    v=acquire_checked(root,name,"video",base.VIDEO,sources.MAX_VIDEO,".mp4",report)
    t=acquire_checked(root,name,"tracks",base.TRACKS,sources.MAX_LABELS,".txt",report)
    z=acquire_checked(root,name,"zone",zones[name],65536,".zone",report)
    refs=roi.load_ids(t);poly=roi.parse_zone(z.read_text(encoding="ascii"))
    ids=roi.consecutive(refs,A_FRAME_COUNT);pixels=base.decode(v,ids);samples=[];seen=set()
    for f,px in zip(ids,pixels):
        digest=hashlib.sha256(px.tobytes()).hexdigest()
        if digest in seen:raise ValueError("duplicate video sample")
        seen.add(digest)
        gt=[box for box in refs[f].values() if roi.inside([box],poly)[0]]
        samples.append((Image.fromarray(px),gt,{"source":name,"frame":f,"decodedSha256":digest},poly))
    if len(samples)!=A_FRAME_COUNT:raise ValueError("incomplete frame decode")
    return samples,refs

def run(out,delta):
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.set_num_interop_threads(1);torch.manual_seed(base.SEED)
    out.mkdir(parents=True,exist_ok=True);start=time.monotonic()
    report={"scope":"frozen RF-DETR paired ROI coverage and actual prediction tracking",
      "sourceRun":46117679978,"sourceCodeSha":"1ea3f34558b89e4e2321ab94de9bf858b436d28f",
      "sourceModelSha256":base.MODEL_SHA,"sourceAttempts":{},"phases":{},"comparisons":{},
      "priorJulyBRun":46121293618,"priorJulyBCodeSha":"cc16fc1a79c17aec6e416b6cf6eee200030d6203","priorJulyBRepeated":False,
      "training":False,"directionCountingEvaluated":False,"productRecognitionAuthorized":False,
      "cleanupAuthorized":False,"androidVerified":False,"physicalHiveIndependenceVerified":False}
    def checkpoint():
        (out/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")
        print("RF_FROZEN_CHECKPOINT",json.dumps(report["phases"]),flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix="paseka-frozen-") as directory:
            root=Path(directory)
            samples,refs=acquire_a(root,report)
            report["phases"]["julyASource"]="PINNED_BYTES_VERIFIED";checkpoint()
            md=root/"model";md.mkdir()
            sources.download(base.MODEL_URL,md/"model.safetensors",base.MAX_MODEL,base.MODEL_SHA,121926336)
            for name,(sha,size,rev) in roi.CONFIGS.items():
                sources.download(f"https://huggingface.co/Roboflow/rf-detr-nano/resolve/{rev}/{name}",md/name,65536,sha,size)
            model,report["frozenModel"]=load_frozen(md,delta)
            processor=AutoImageProcessor.from_pretrained(md,local_files_only=True,trust_remote_code=False)
            report["phases"]["weights"]="EXACT_DELTA_RESTORED_NO_TRAINING";checkpoint()
            name=roi.DEVELOPMENT
            plain,pperf=native.collect_predictions(model,processor,samples)
            reduced,rperf=reduced_predictions(model,processor,samples)
            a=native.metric(plain,THRESHOLD);b=native.metric(reduced,THRESHOLD)
            report["comparisons"][name]={"frames":[x[2]["frame"] for x in samples],
              "pixelsSha256":[x[2]["decodedSha256"] for x in samples],
              "baseline":{"metrics":a,"perf":pperf,"tracking":track_result(plain,samples,refs)},
              "reduced":{"metrics":b,"perf":rperf,"tracking":track_result(reduced,samples,refs)},
              "tilesSaved":a["tiles"]-b["tiles"],"referenceScope":"publisher entrance ROI",
              "speedup":a["pipelineMsPerImage"]/b["pipelineMsPerImage"]}
            report["phases"][name]="COMPLETED_PAIRED_COMPARISON";checkpoint()
            report["julyAReducedCriterionMet"]=(b["f1"]>=a["f1"]-.02
              and b["recall"]>=a["recall"]-.02
              and report["comparisons"][name]["speedup"]>1.15)
            report["status"]="FROZEN_RESEARCH_COMPLETED"
    except Exception as exc:
        report["status"]="STOP_WITHOUT_ACCEPTANCE";report["errorType"]=type(exc).__name__;report["detail"]=str(exc)[:280]
    report["elapsedSec"]=time.monotonic()-start;checkpoint()
    return report

if __name__=="__main__":
    import sys
    r=run(Path(sys.argv[1]),Path(sys.argv[2]));print("PUBLIC_BEE_FROZEN_REPORT",json.dumps(r,sort_keys=True,allow_nan=False),flush=True)
    raise SystemExit(0 if r["status"]=="FROZEN_RESEARCH_COMPLETED" else 1)
