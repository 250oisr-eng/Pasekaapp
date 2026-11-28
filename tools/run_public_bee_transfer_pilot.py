#!/usr/bin/env python3
"""Research-only RF-DETR query classifier plus supervised box refinement.
Use pretrained features, not another scratch CNN. No user media or counting.
Mendeley v6 / Zenodo 14929560 CC BY 4.0; LILA Boxes on Bees and Pollen
CDLA-Permissive-1.0; RF-DETR Nano Apache-2.0 pinned exact safetensors.
"""
import hashlib
import json
import math
import os
import tempfile
import time
import zipfile
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.nn import functional as F
from torchvision.ops import nms
from transformers import AutoImageProcessor, RfDetrForObjectDetection
import run_public_bee_full_cycle as full
import run_public_bee_roi_pilot as roi
import run_public_bee_query_head_pilot as base
import probe_public_bee_external as ext
import verify_public_bee_pilot_inputs as sources

CAL_PREFIX="Chueried_HempBox"
TEST_PREFIXES=("Erlen_Erlen_Hive_11","Frohheimstrasse_14_united_queens")
THRESHOLDS=(.25,.5,.65,.8,.9,.95,.98,.99)
POS=.35
NEG=.10
STEPS=400

def box_deltas(boxes,target):
    boxes=np.asarray(boxes,dtype=np.float32).reshape(-1,4)
    target=np.asarray(target,dtype=np.float32).reshape(-1,4)
    size=boxes[:,2:]-boxes[:,:2]; ts=target[:,2:]-target[:,:2]
    if np.any(size<=0) or np.any(ts<=0):raise ValueError("degenerate box")
    center=(boxes[:,2:]+boxes[:,:2])/2; tc=(target[:,2:]+target[:,:2])/2
    return np.concatenate(((tc-center)/size,np.log(ts/size)),axis=1)

def apply_deltas(boxes,delta):
    boxes=np.asarray(boxes,dtype=np.float32).reshape(-1,4)
    delta=np.asarray(delta,dtype=np.float32).reshape(-1,4)
    if boxes.shape!=delta.shape or not np.isfinite(delta).all():raise ValueError("invalid box deltas")
    size=boxes[:,2:]-boxes[:,:2]; center=(boxes[:,2:]+boxes[:,:2])/2
    center=center+np.clip(delta[:,:2],-.75,.75)*size
    size=size*np.exp(np.clip(delta[:,2:],-1.1,1.1))
    return np.concatenate((center-size/2,center+size/2),axis=1).clip(0,1)

def extra_external(report,seen):
    initial,archive=ext.open_archive()
    if archive["etag"]!="0x8DC6292D953F766" or archive["bytes"]!=2076021293:raise ValueError("external archive changed")
    reader=full.BoundedReader(initial.url,initial.size,initial.opener,48*1024*1024,128)
    cal=[];test=[]
    with zipfile.ZipFile(reader) as z:
        imgs,xmls,_,_=ext.index(z)
        for group in (CAL_PREFIX,*TEST_PREFIXES):
            keys=[k for k in imgs.keys()&xmls.keys() if k.startswith(group+"_")]
            if not keys:raise ValueError("missing external group "+group)
            for name in full.choose(keys,min(4,len(keys))):
                try:
                    row=full.read_external(z,imgs,xmls,name,seen)
                    (cal if group==CAL_PREFIX else test).append(row)
                except Exception as exc:
                    report["sampleErrors"].append({"name":name,"partition":"extra external "+group,"error":str(exc)[:180]})
    report["extraExternalRange"]={"bytes":reader.received,"requests":reader.requests}
    if not cal or not test:raise ValueError("no valid external calibration/evaluation sample")
    return cal,test

def samples_video(root,name,video,tracks,zone,ids,seen,report):
    v=root/(name+".mp4");t=root/(name+".txt");p=root/(name+".zone")
    report["videoSources"][name]={"video":sources.download(sources.source_url(video[0]),v,sources.MAX_VIDEO,video[2],video[1]),
        "tracks":sources.download(sources.source_url(tracks[0]),t,sources.MAX_LABELS,tracks[2],tracks[1]),
        "zone":sources.download(sources.source_url(zone[0]),p,65536,zone[2],zone[1])}
    refs=roi.load_ids(t);poly=roi.parse_zone(p.read_text(encoding="ascii"))
    ids=ids(refs)
    pixels=base.decode(v,ids);rows=[]
    for f,px in zip(ids,pixels):
        sha=hashlib.sha256(px.tobytes()).hexdigest()
        if sha in seen:raise ValueError("duplicate video sample")
        seen.add(sha)
        gt=[box for box in refs[f].values() if roi.inside([box],poly)[0]]
        rows.append((Image.fromarray(px),gt,{"source":name,"frame":f,"decodedSha256":sha},poly))
    return rows

def wrap(rows):return [(im,gt,ev,None) for im,gt,ev in rows]

def features(model,processor,samples):
    """Model sees pixels only. ROI comes from publisher for video; no GT-fed proposals."""
    frames=[];elapsed=0;total_tiles=0
    for im,gt,ev,poly in samples:
        start=time.monotonic();items=[];locations=[]
        for x,y,cw,ch,px in full.image_tiles(im,True):
            # Skip tiles that cannot contain the documented author ROI;
            # bbox of polygon is only conservative screening, not truth.
            if poly is not None and (x+cw<poly[:,0].min()*im.width or x>poly[:,0].max()*im.width
                    or y+ch<poly[:,1].min()*im.height or y>poly[:,1].max()*im.height):continue
            items.append((0,0,0,Image.fromarray(px),[]));locations.append((x,y,cw,ch))
        raw=base.extract_queries(model,processor,items)
        xs=[];bs=[]
        for item,row,(x,y,cw,ch) in zip(items,raw,locations):
            local=row["boxes"].copy()
            cx=(local[:,0]+local[:,2])*full.W/2;cy=(local[:,1]+local[:,3])*full.H/2
            keep=(cx<cw)&(cy<ch)
            b=local.copy();b[:,[0,2]]=(b[:,[0,2]]*full.W+x)/im.width;b[:,[1,3]]=(b[:,[1,3]]*full.H+y)/im.height
            b=b.clip(0,1);keep&=(b[:,2]>b[:,0])&(b[:,3]>b[:,1])
            if poly is not None:keep&=roi.inside(b,poly)
            local=local[keep];b=b[keep];q=row["features"][keep]
            # Appearance and proposal dimensions are available at inference.
            patches=[]
            for a,c,r,d in local:
                rect=(max(0,int(a*full.W)),max(0,int(c*full.H)),
                      min(full.W,max(int(a*full.W)+1,math.ceil(r*full.W))),
                      min(full.H,max(int(c*full.H)+1,math.ceil(d*full.H))))
                patches.append(np.asarray(item[3].crop(rect).resize((8,8),Image.Resampling.BILINEAR),np.float32).reshape(-1)/255)
            patch=np.asarray(patches,np.float32).reshape(-1,192)
            shape=np.log(np.maximum(local[:,2:]-local[:,:2],1e-5))
            xs.append(np.concatenate((q,patch,shape),axis=1));bs.append(b)
        if not xs:raise ValueError("no proposal tiles")
        x=np.concatenate(xs);b=np.concatenate(bs)
        if not np.isfinite(x).all():raise ValueError("invalid proposal features")
        frames.append({"x":x,"boxes":b,"gt":gt,"evidence":ev,"poly":poly})
        elapsed+=time.monotonic()-start;total_tiles+=len(items)
    return frames,{"tiles":total_tiles,"elapsedSec":elapsed,"proposalCount":sum(len(r["boxes"]) for r in frames)}

class Head(nn.Module):
    def __init__(self,n):
        super().__init__()
        self.body=nn.Sequential(nn.Linear(n,128),nn.ReLU(),nn.Linear(128,64),nn.ReLU())
        self.classifier=nn.Linear(64,1);self.geometry=nn.Linear(64,4)
        nn.init.zeros_(self.geometry.weight);nn.init.zeros_(self.geometry.bias)
    def forward(self,x):
        z=self.body(x);return self.classifier(z).flatten(),self.geometry(z)

def training_arrays(rows):
    x=[];y=[];d=[]
    for row in rows:
        matrix=base.iou_matrix(row["boxes"],row["gt"])
        best=matrix.max(axis=1) if matrix.shape[1] else np.zeros(len(row["boxes"]))
        mask=(best>=POS)|(best<=NEG); positive=best[mask]>=POS
        boxes=row["boxes"][mask];delta=np.zeros((len(boxes),4),np.float32)
        if positive.any():
            targets=np.asarray(row["gt"],np.float32)[matrix[mask][positive].argmax(axis=1)]
            delta[positive]=box_deltas(boxes[positive],targets)
        x.append(row["x"][mask]);y.append(positive);d.append(delta)
    return tuple(np.concatenate(v) for v in (x,y,d))

def fit(rows):
    x,y,d=training_arrays(rows)
    x=torch.from_numpy(x.astype(np.float32));y=torch.from_numpy(y.astype(np.float32));d=torch.from_numpy(d.astype(np.float32))
    pos=torch.where(y==1)[0];neg=torch.where(y==0)[0]
    if len(pos)<30 or len(neg)<100:raise ValueError("insufficient real proposal diversity")
    mean=x.mean(0);std=x.std(0).clamp(min=1e-4);x=(x-mean)/std
    torch.manual_seed(base.SEED);gen=torch.Generator().manual_seed(base.SEED)
    head=Head(x.shape[1]);opt=torch.optim.AdamW(head.parameters(),lr=.002,weight_decay=.01)
    head.train()
    for _ in range(STEPS):
        sel=torch.cat((pos[torch.randint(len(pos),(96,),generator=gen)],neg[torch.randint(len(neg),(384,),generator=gen)]))
        logits,delta=head(x[sel]);classification=F.binary_cross_entropy_with_logits(logits,y[sel])
        geometry=F.smooth_l1_loss(delta[:96],d[sel[:96]])
        loss=classification+2*geometry
        if not torch.isfinite(loss):raise ValueError("nonfinite training")
        opt.zero_grad();loss.backward();opt.step()
    head.eval()
    return head,mean,std,{"positive":len(pos),"negative":len(neg),"steps":STEPS,"loss":float(loss.detach())}

def scored(rows,head,mean,std):
    results=[]
    for row in rows:
        with torch.inference_mode():
            logits,d=head((torch.from_numpy(row["x"])-mean)/std)
        score=logits.sigmoid().numpy()
        results.append((row,score,apply_deltas(row["boxes"],d.numpy())))
    return results

def evaluate(scored_rows,threshold,refine):
    tp=fp=fn=0;ious=[];upper=0
    for row,s,refined in scored_rows:
        b=refined if refine else row["boxes"]
        valid=(b[:,2]>b[:,0])&(b[:,3]>b[:,1])
        if row["poly"] is not None:valid&=roi.inside(b,row["poly"])
        upper+=base.match_count(row["gt"],b[valid],.5)
        mask=valid&(s>=threshold);b=b[mask];ss=s[mask]
        keep=nms(torch.from_numpy(b),torch.from_numpy(ss),.5).numpy()
        m=full.match(row["gt"],b[keep],.5)
        tp+=len(m);fp+=len(keep)-len(m);fn+=len(row["gt"])-len(m);ious.extend(v for _,_,v in m)
    return {"tp":tp,"fp":fp,"fn":fn,"precision":tp/(tp+fp) if tp+fp else None,
            "recall":tp/(tp+fn) if tp+fn else None,"f1":2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0,
            "matchedMeanIoU":float(np.mean(ious)) if ious else None,
            "unfilteredProposalMatched":upper,"unfilteredProposalRecall":upper/(tp+fn) if tp+fn else None}

def calibrate(june,external):
    curve=[]
    for refine in (False,True):
        for t in THRESHOLDS:
            a=evaluate(june,t,refine);b=evaluate(external,t,refine)
            curve.append({"refine":refine,"threshold":t,"june":a,"external":b,"macroF1":(a["f1"]+b["f1"])/2})
    # Two distinct calibration sets. Never select by test outcomes.
    return max(curve,key=lambda m:(m["macroF1"],m["threshold"],not m["refine"])),curve

def run(out):
    from safetensors.torch import save_file
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.set_num_interop_threads(1)
    start=time.monotonic();out.mkdir(parents=True,exist_ok=True)
    report={"scope":"RF-DETR frozen features + classification and box regression; public research only",
        "model":"Roboflow/rf-detr-nano Apache-2.0","datasetZenodo":"10.5281/zenodo.14929560 CC BY 4.0",
        "datasetMendeley":"10.17632/8gb9r2yhfc.6 CC BY 4.0","datasetLila":"Boxes on Bees and Pollen CDLA-Permissive-1.0",
        "sampleErrors":[],"videoSources":{},"phases":{},"physicalHiveIndependenceVerified":False,
        "productRecognitionAuthorized":False,"directionCountingEvaluated":False,"cleanupAuthorized":False,
        "archiveFullChecksumVerified":False}
    def checkpoint():
        (out/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")
        print("RF_BEE_CHECKPOINT",json.dumps(report["phases"]),flush=True)
    try:
        seen=set();train,june_cal,external=full.collect(report,seen)
        ext_cal,fresh=extra_external(report,seen)
        with tempfile.TemporaryDirectory(prefix="paseka-transfer-") as directory:
            root=Path(directory);md=root/"model";md.mkdir()
            sources.download(base.MODEL_URL,md/"model.safetensors",base.MAX_MODEL,base.MODEL_SHA,121926336)
            for name,(sha,size,rev) in roi.CONFIGS.items():
                sources.download(f"https://huggingface.co/Roboflow/rf-detr-nano/resolve/{rev}/{name}",md/name,65536,sha,size)
            model=RfDetrForObjectDetection.from_pretrained(md,local_files_only=True,use_safetensors=True,trust_remote_code=False).eval()
            base.validate_pretrained_labels(model.config.id2label)
            processor=AutoImageProcessor.from_pretrained(md,local_files_only=True,trust_remote_code=False)
            zones=roi.zone_catalog()
            video_train=samples_video(root,roi.TRAIN,base.TRAIN_VIDEO,base.TRAIN_TRACKS,zones[roi.TRAIN],
                lambda refs:base.choose_frames(refs,12)[:8],seen,report)
            fit_samples=wrap(train)+video_train
            report["partitions"]={"fit":[x[2] for x in fit_samples],"juneCalibration":[x[2] for x in june_cal],
                "externalCalibration":[x[2] for x in ext_cal],"externalFixed":[x[2] for x in external],"externalFreshPrefixes":[x[2] for x in fresh]}
            report["phases"]["inputs"]="VERIFIED_BOUNDED_SAMPLES";checkpoint()
            tr,report["fitExtraction"]=features(model,processor,fit_samples)
            head,mean,std,report["training"]=fit(tr);del tr
            a,report["juneCalibrationExtraction"]=features(model,processor,wrap(june_cal))
            b,report["externalCalibrationExtraction"]=features(model,processor,wrap(ext_cal))
            ac=scored(a,head,mean,std);bc=scored(b,head,mean,std)
            best,curve=calibrate(ac,bc);report["calibration"]={"selected":best,"curve":curve}
            t=best["threshold"];refine=best["refine"]
            artifact=out/"experimental_transfer_head.safetensors"
            save_file({"mean":mean.contiguous(),"std":std.contiguous(),**{k:v.detach().contiguous() for k,v in head.state_dict().items()}},str(artifact),
                metadata={"scope":"research-only","base_sha256":base.MODEL_SHA,"threshold":str(t),"refine":str(refine)})
            report["headSha256"]=hashlib.sha256(artifact.read_bytes()).hexdigest()
            report["phases"]["fitCalibration"]="COMPLETED_FROZEN";checkpoint()
            # Fresh named groups are only *filename* held-outs, not verified hives.
            old=full.collect_2018(report,seen)
            july=samples_video(root,roi.CONTROL,roi.CONTROL_VIDEO,roi.CONTROL_TRACKS,zones[roi.CONTROL],
                lambda refs:roi.consecutive(refs,12),seen,report)
            report["comparisons"]={}
            for name,rows in (("externalFixed",wrap(external)),("externalFreshPrefixes",wrap(fresh)),
                              ("oldDate",wrap(old)),("julyBPublisherROI",july)):
                if not rows:report["comparisons"][name]={"status":"NO_VALID_SAMPLE"};continue
                fs,perf=features(model,processor,rows);ss=scored(fs,head,mean,std)
                report["comparisons"][name]={"sampleCount":len(rows),"extraction":perf,
                    "plain":evaluate(ss,t,False),"refined":evaluate(ss,t,True),
                    "selected":evaluate(ss,t,refine),"referenceScope":"publisher ROI" if "ROI" in name else "author labels"}
                if name=="oldDate":report["partitions"]["oldDate"]=[x[2] for x in rows]
            report["phases"]["evaluation"]="COMPLETED_WITH_RECORDED_EXCLUSIONS"
            report["status"]="TRANSFER_RESEARCH_COMPLETED"
    except Exception as exc:
        report["status"]="STOP_WITHOUT_ACCEPTANCE";report["errorType"]=type(exc).__name__;report["detail"]=str(exc)[:240]
    report["elapsedSec"]=time.monotonic()-start;checkpoint()
    return report

if __name__=="__main__":
    import sys
    r=run(Path(sys.argv[1]));print("PUBLIC_BEE_TRANSFER_REPORT",json.dumps(r,sort_keys=True,allow_nan=False),flush=True)
    raise SystemExit(0 if r["status"]=="TRANSFER_RESEARCH_COMPLETED" else 1)
