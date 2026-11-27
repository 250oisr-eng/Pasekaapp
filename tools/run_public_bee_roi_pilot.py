#!/usr/bin/env python3
"""Public bee candidate refinement, ROI evaluation and actual-prediction tracking.
No user media, deployment, full detector fine-tuning or IN/OUT event truth.
Dataset: Tomyslav Sledevic, Mendeley Data v6, CC BY 4.0, DOI 10.17632/8gb9r2yhfc.6.
RF-DETR Nano: Roboflow, Apache-2.0; exact model/config hashes below.
"""
import csv
import hashlib
import json
import math
import os
import re
import tempfile
import time
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.optimize import linear_sum_assignment
import torch
from torchvision.ops import nms
from transformers import AutoImageProcessor, RfDetrForObjectDetection
import run_public_bee_query_head_pilot as base
import verify_public_bee_pilot_inputs as sources

TRAIN = "20230609b-def"
DEVELOPMENT = "20230711a-fan"  # already observed in stage 2, not a fresh holdout
CONTROL = "20230711b-fan"  # not used for fit, calibration or model selection
CONTROL_VIDEO = ("68ae2024-d1bf-44ad-aba5-1e5c156af054",205331307,"5568b635d084260dabc97b7ad055c902b6c7dc4faeb06fcad9141b5514ccab16")
CONTROL_TRACKS = ("8bc27552-3f7d-4e0c-933a-d813b594801a",2791367,"e6f48d2885f48d81ac40aa2287eded5bac646ac8d7e5f5bfbf0385059e18bed7")
CONFIGS = {"config.json": ("bee6f42c3ab26f9c11064a72080d87c6298d7b7fa0b49c0403ddb4db22020071",5771,base.REVISION),
           "preprocessor_config.json": ("d7a4562ce4ebbbba4904e82edcb415f3f7637c0b9e98752d2cbc6a06bdf25740",442,base.PROCESSOR_REVISION)}
THRESHOLDS = (0.25,0.5,0.65,0.8,0.9,0.95,0.98,0.99)
W,H = base.WIDTH,base.HEIGHT

def parse_zone(text):
    match = re.fullmatch(r"\s*polygon\s*=\s*np\.array\((.*)\)\s*",text,re.S)
    if not match:
        raise ValueError("unexpected publisher polygon syntax")
    p=np.asarray(json.loads(match.group(1)),dtype=float)
    if p.shape!=(4,2) or not np.isfinite(p).all() or np.any(p<0) or np.any(p>[W,H]):
        raise ValueError("invalid zone bounds")
    e=np.roll(p,-1,axis=0)-p
    f=np.roll(e,-1,axis=0)
    cross=e[:,0]*f[:,1]-e[:,1]*f[:,0]
    if not (np.all(cross>0) or np.all(cross<0)):
        raise ValueError("nonconvex or degenerate zone")
    return p/np.array([W,H])

def inside(boxes,poly):
    boxes=np.asarray(boxes,dtype=float).reshape(-1,4)
    center=(boxes[:,:2]+boxes[:,2:])/2
    edges=np.roll(poly,-1,axis=0)-poly
    d=center[:,None,:]-poly[None,:,:]
    cross=edges[None,:,0]*d[:,:,1]-edges[None,:,1]*d[:,:,0]
    return np.all(cross>=-1e-10,axis=1)|np.all(cross<=1e-10,axis=1)

def zone_catalog():
    folders=sources.fetch_json(sources.DATASET+"/folders/6")
    roots={f["id"] for f in folders if f.get("name")=="tracking_and_behavior"}
    if len(roots)!=1: raise ValueError("missing tracking root")
    for _ in range(30):
        expanded=roots|{f["id"] for f in folders if f.get("parent_id") in roots}
        if expanded==roots: break
        roots=expanded
        if len(roots)>30: raise ValueError("too many tracking folders")
    wanted={"entrance_zone_"+n+".txt":n for n in (TRAIN,DEVELOPMENT,CONTROL)}
    result={}
    for folder in sorted(roots):
        if not sources.UUID.fullmatch(folder): raise ValueError("bad folder UUID")
        listing=sources.fetch_json(sources.DATASET+f"/files?folder_id={folder}&version=6&$start=0&$limit=1000")
        if len(listing)>=1000: raise ValueError("catalog truncated")
        for item in listing:
            name=item.get("filename")
            if name not in wanted: continue
            d=item.get("content_details",{}); uid=item.get("id",""); sha=d.get("sha256_hash",""); size=d.get("size")
            if wanted[name] in result or not sources.UUID.fullmatch(uid) or not sources.SHA.fullmatch(sha) or type(size)!=int or not 0<size<=65536 or item.get("size")!=size or item.get("folder_id")!=folder or item.get("status")!="COMPLETED":
                raise ValueError("invalid zone source")
            result[wanted[name]]=(uid,size,sha)
    if set(result)!=set(wanted.values()): raise ValueError("missing publisher entrance zone")
    if result[DEVELOPMENT]!=("7fa8a906-4f75-4559-bd60-9b557ec2c8a8",70,"23a339cef571975e18fdaafbb01c988c0e3ec4668bac7a491c8effe54ad50580"):
        raise ValueError("July A zone changed")
    return result

def load_ids(path):
    out={}
    with path.open(encoding="ascii",newline="") as stream:
        for record in csv.reader(stream):
            if len(record)!=6: raise ValueError("bad track columns")
            frame,track=map(int,record[:2]); x,y,w,h=map(float,record[2:])
            if frame<1 or frame>100000 or track<0 or not all(map(math.isfinite,(x,y,w,h))) or not (0<=x<x+w<=1 and 0<=y<y+h<=1):
                raise ValueError("invalid reference")
            row=out.setdefault(frame,{})
            if track in row: raise ValueError("duplicate track")
            row[track]=(x,y,x+w,y+h)
    if not out: raise ValueError("empty reference")
    return out

def full_boxes(boxes,tile):
    r,c=tile
    b=np.asarray(boxes,dtype=np.float32).reshape(-1,4).copy()
    b[:,[0,2]]=(b[:,[0,2]]+c)/base.COLS
    b[:,[1,3]]=(b[:,[1,3]]+r)/base.ROWS
    return b

def patch_features(image,boxes):
    """16px RGB appearance; crop only model proposals, not reference boxes."""
    w,h=image.size
    out=[]
    for x,y,r,b in boxes:
        dx=(r-x)*0.15; dy=(b-y)*0.15
        rect=(max(0,int(math.floor((x-dx)*w))),max(0,int(math.floor((y-dy)*h))),
              min(w,int(math.ceil((r+dx)*w))),min(h,int(math.ceil((b+dy)*h))))
        patch=np.asarray(image.crop(rect).resize((16,16),Image.Resampling.BILINEAR),dtype=np.float32)/255
        out.append(patch.reshape(-1))
    return np.asarray(out,dtype=np.float32).reshape(-1,768)

def rows_for(model,processor,video,ids,refs,poly,seen_hashes):
    pixels=base.decode(video,ids)
    hashes={hashlib.sha256(f.tobytes()).hexdigest() for f in pixels}
    if len(hashes)!=len(ids) or seen_hashes&hashes: raise ValueError("duplicate sampled pixels")
    seen_hashes.update(hashes)
    in_zone={f:{k:b for k,b in refs[f].items() if inside([b],poly)[0]} for f in ids}
    items=base.tiles(pixels,ids,{f:list(v.values()) for f,v in in_zone.items()})
    raw=base.extract_queries(model,processor,items)
    rows=[]
    for item,row in zip(items,raw):
        full=full_boxes(row["boxes"],row["tile"])
        keep=inside(full,poly)
        boxes=row["boxes"][keep]
        q=row["features"][keep]
        patches=patch_features(item[3],boxes)
        rows.append({"frame":row["frame"],"boxes":full[keep],"q":q,
                     "qa":np.concatenate([q,patches],axis=1)})
    return rows,in_zone,sum(len(refs[f])-len(in_zone[f]) for f in ids)

def fit(rows,refs,key):
    xx=[]; yy=[]
    for row in rows:
        gt=list(refs[row["frame"]].values())
        matrix=base.iou_matrix(row["boxes"],gt)
        best=matrix.max(axis=1) if matrix.shape[1] else np.zeros(len(row["boxes"]))
        mask=(best>=0.5)|(best<=0.1)
        xx.append(row[key][mask]); yy.append(best[mask]>=0.5)
    x=torch.from_numpy(np.concatenate(xx).astype(np.float32)); y=torch.from_numpy(np.concatenate(yy).astype(np.float32))
    pos=torch.where(y==1)[0]; neg=torch.where(y==0)[0]
    if len(pos)<10 or len(neg)<10: raise ValueError("insufficient real proposals")
    mean=x.mean(0); std=x.std(0).clamp(min=1e-4); x=(x-mean)/std
    torch.manual_seed(base.SEED)
    gen=torch.Generator().manual_seed(base.SEED)
    model=torch.nn.Sequential(torch.nn.Linear(x.shape[1],64),torch.nn.ReLU(),torch.nn.Linear(64,1))
    opt=torch.optim.AdamW(model.parameters(),lr=0.002,weight_decay=0.01)
    # Fixed 1:4 sample balance; avoid the original 100x positive weight.
    for _ in range(240):
        sel=torch.cat([pos[torch.randint(len(pos),(64,),generator=gen)],neg[torch.randint(len(neg),(256,),generator=gen)]])
        opt.zero_grad(); loss=torch.nn.functional.binary_cross_entropy_with_logits(model(x[sel]).flatten(),y[sel])
        if not torch.isfinite(loss): raise ValueError("nonfinite training")
        loss.backward(); opt.step()
    model.eval()
    return (model,mean,std,key),{"positive":len(pos),"negative":len(neg),"loss":float(loss.detach())}

def scored(rows,fit):
    model,mean,std,key=fit; out={}
    for row in rows:
        with torch.inference_mode(): s=model((torch.from_numpy(row[key])-mean)/std).flatten().sigmoid().numpy()
        out.setdefault(row["frame"],[]).append((row["boxes"],s))
    return {f:(np.concatenate([b for b,_ in r]),np.concatenate([s for _,s in r])) for f,r in out.items()}

def predicted(scores,threshold):
    result={}
    for f,(b,s) in scores.items():
        valid=s>=threshold; b=b[valid]; s=s[valid]
        order=nms(torch.from_numpy(b),torch.from_numpy(s),0.5).numpy()
        result[f]=b[order]
    return result

def pairs(a,b,threshold):
    m=base.iou_matrix(a,b)
    if not m.size:return []
    ok=m>=threshold
    rows,cols=linear_sum_assignment(np.where(ok,min(m.shape)+1+m,0),maximize=True)
    return [(int(i),int(j)) for i,j in zip(rows,cols) if ok[i,j]]

def measure(refs,pred):
    tp=fp=fn=0
    for f,gt in refs.items():
        p=pred[f]; n=len(pairs(list(gt.values()),p,0.5))
        tp+=n; fp+=len(p)-n; fn+=len(gt)-n
    return {"tp":tp,"fp":fp,"fn":fn,"precision":tp/(tp+fp) if tp+fp else None,
            "recall":tp/(tp+fn) if tp+fn else None,"f1":2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0}

def calibrate(scores,refs):
    candidates=[{"threshold":t,**measure(refs,predicted(scores,t))} for t in THRESHOLDS]
    return max(candidates,key=lambda x:(x["f1"],x["precision"] or 0,x["threshold"])),candidates

def track_metrics(refs,pred):
    """IoU-only association on actual detector output, never input GT identities."""
    next_id=0; prev=[]; prev_ids=[]; last_truth={}; prev_frame=None
    switches=compared=0; unique=set()
    for f in sorted(pred):
        boxes=pred[f]; ids=[None]*len(boxes)
        if prev_frame is not None and f==prev_frame+1:
            for i,j in pairs(prev,boxes,0.30): ids[j]=prev_ids[i]
        else:last_truth={}
        for j in range(len(ids)):
            if ids[j] is None: ids[j]=next_id; next_id+=1
        unique.update(ids)
        gt=refs[f]; keys=list(gt)
        matched={keys[i]:ids[j] for i,j in pairs(list(gt.values()),boxes,0.5)}
        for k in last_truth.keys()&matched.keys():
            compared+=1; switches+=last_truth[k]!=matched[k]
        prev,prev_ids,last_truth,prev_frame=boxes,ids,matched,f
    return {"frames":len(pred),"predictedTrackIds":len(unique),"adjacentMatchedTransitions":compared,
            "adjacentIdSwitches":switches,"switchFraction":switches/compared if compared else None,
            "directionCountingEvaluated":False}

def consecutive(refs,count):
    keys=set(refs); mid=sorted(keys)[len(keys)//2]
    choices=[i for i in keys if all(i+j in keys for j in range(count))]
    if not choices:raise ValueError("no consecutive annotated segment")
    start=min(choices,key=lambda i:(abs(i-mid),i))
    return list(range(start,start+count))

def save_report(report,out):
    out.mkdir(parents=True,exist_ok=True)
    (out/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")

def run(out):
    from safetensors.torch import save_file
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.set_num_interop_threads(1)
    start=time.monotonic(); report={"dataset":"Tomyslav Sledevic, Mendeley Data v6, DOI 10.17632/8gb9r2yhfc.6, CC BY 4.0",
      "model":"Roboflow/rf-detr-nano Apache-2.0","scope":"ROI full-frame public research only",
      "physicalHiveIndependenceVerified":False,"directionCountingEvaluated":False,"productRecognitionAuthorized":False,"cleanupAuthorized":False,
      "stage2DevelopmentF1At50":0.06455542021924482,"stage2DevelopmentF1At80":0.1381294964028777,
      "sources":{}}
    with tempfile.TemporaryDirectory(prefix="paseka-roi-") as d:
        root=Path(d); md=root/"model";md.mkdir()
        sources.download(base.MODEL_URL,md/"model.safetensors",base.MAX_MODEL,base.MODEL_SHA,121926336)
        for n,(sha,size,rev) in CONFIGS.items():
            sources.download(f"https://huggingface.co/Roboflow/rf-detr-nano/resolve/{rev}/{n}",md/n,65536,sha,size)
        model=RfDetrForObjectDetection.from_pretrained(md,local_files_only=True,use_safetensors=True,trust_remote_code=False).eval()
        base.validate_pretrained_labels(model.config.id2label)
        processor=AutoImageProcessor.from_pretrained(md,local_files_only=True,trust_remote_code=False)
        zones=zone_catalog(); hashes=set()
        def acquire(name,v,t):
            vp=root/(name+".mp4");tp=root/(name+".txt");zp=root/(name+".zone")
            zone=zones[name]
            report["sources"][name]={"video":sources.download(sources.source_url(v[0]),vp,sources.MAX_VIDEO,v[2],v[1]),
              "tracks":sources.download(sources.source_url(t[0]),tp,sources.MAX_LABELS,t[2],t[1]),
              "zone":sources.download(sources.source_url(zone[0]),zp,65536,zone[2],zone[1])}
            return vp,load_ids(tp),parse_zone(zp.read_text(encoding="ascii"))
        v,refs,poly=acquire(TRAIN,base.TRAIN_VIDEO,base.TRAIN_TRACKS)
        ids=base.choose_frames(refs,24)
        rows,gt,outside=rows_for(model,processor,v,ids,refs,poly,hashes)
        train=set(ids[:18]);val=set(ids[18:]); tr=[r for r in rows if r["frame"] in train]; va=[r for r in rows if r["frame"] in val]
        train_gt={f:gt[f] for f in ids[:18]};val_gt={f:gt[f] for f in ids[18:]}
        report["trainFrameIds"]=ids[:18];report["calibrationFrameIds"]=ids[18:]
        report["juneExcludedOutsideZone"]=outside
        fits={};report["calibration"]={}
        for key in ("q","qa"):
            fits[key],counts=fit(tr,train_gt,key)
            best,curve=calibrate(scored(va,fits[key]),val_gt)
            report["calibration"][key]={"training":counts,"selected":best,"curve":curve}
        key=max(fits,key=lambda k:(report["calibration"][k]["selected"]["f1"],k=="q"))
        threshold=report["calibration"][key]["selected"]["threshold"]
        report["selectedFeatures"]=key;report["selectedThreshold"]=threshold
        # Freeze the selected model and threshold before viewing either July result.
        chosen,mean,std,_=fits[key]
        out.mkdir(parents=True,exist_ok=True)
        head=out/"experimental_head.safetensors"
        save_file({"mean":mean.contiguous(),"std":std.contiguous(),**{k:v.detach().contiguous() for k,v in chosen.state_dict().items()}},str(head),
          metadata={"scope":"research-only","features":key,"threshold":str(threshold),"base_sha256":base.MODEL_SHA,"dataset":"10.17632/8gb9r2yhfc.6"})
        report["headSha256"]=hashlib.sha256(head.read_bytes()).hexdigest()
        del rows,tr,va
        report["evaluations"]={}
        for name,video,tracks in ((DEVELOPMENT,base.VIDEO,base.TRACKS),(CONTROL,CONTROL_VIDEO,CONTROL_TRACKS)):
            try:
                v,refs,poly=acquire(name,video,tracks)
                ids=base.choose_frames(refs,3) if name==DEVELOPMENT else consecutive(refs,12)
                rows,gt,outside=rows_for(model,processor,v,ids,refs,poly,hashes)
                result={"frameIds":ids,"excludedOutsideZone":outside,"models":{}}
                for k,head_fit in fits.items():
                    t=report["calibration"][k]["selected"]["threshold"]
                    preds=predicted(scored(rows,head_fit),t)
                    result["models"][k]={"threshold":t,**measure(gt,preds)}
                    if name==CONTROL and k==key:result["tracking"]=track_metrics(gt,preds)
                report["evaluations"][name]=result
            except Exception as exc:
                report["evaluations"][name]={"errorType":type(exc).__name__,"detail":str(exc)[:180] if isinstance(exc,ValueError) else None}
        report["elapsedSec"]=round(time.monotonic()-start,3)
    save_report(report,out)
    return report

if __name__=="__main__":
    import sys
    report=run(Path(sys.argv[1]))
    print("PUBLIC_BEE_ROI_REPORT",json.dumps(report,sort_keys=True,allow_nan=False),flush=True)
    raise SystemExit(1 if any("errorType" in v for v in report["evaluations"].values()) else 0)
