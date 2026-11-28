#!/usr/bin/env python3
"""Bounded RF-DETR detector adaptation (not merely frozen-query classification).
Public research only. Fine-tune detector heads and final decoder layer with
single-group inference-mode forward and explicit one-to-one matching loss.
No raw user data, product authorization, or pretrained class assumptions.
"""
import hashlib
import json
import os
import re
import tempfile
import time
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.optimize import linear_sum_assignment
import torch
from torch.nn import functional as F
from torchvision.ops import generalized_box_iou,nms
from transformers import AutoImageProcessor,RfDetrForObjectDetection
import run_public_bee_full_cycle as full
import run_public_bee_transfer_pilot as transfer
import run_public_bee_roi_pilot as roi
import run_public_bee_query_head_pilot as base
import verify_public_bee_pilot_inputs as sources

STEPS=96
THRESHOLDS=(.05,.10,.20,.35,.50,.65,.80,.90,.95)
CLASS_KEYS=("class_embed","class_labels_classifier","class_head","class_predictor","enc_out_class_embed","enc_output_class_embed","encoder_class_head")
BOX_KEYS=("bbox_embed","bbox_head","bbox_predictor","enc_out_bbox_embed","enc_output_bbox_embed","encoder_bbox_head")

def key_kind(name,last):
    parts=name.split(".")
    if "backbone" in parts or "projector" in parts:return None
    if any(p in CLASS_KEYS for p in parts):return "class"
    if any(p in BOX_KEYS for p in parts):return "box"
    if re.search(r"(?:^|\.)decoder\.(?:layers|layer)\."+str(last)+r"\.",name):return "decoder"
    return None

def xyxy(x):
    return torch.cat((x[...,:2]-x[...,2:]/2,x[...,:2]+x[...,2:]/2),-1)

def cxcywh(x):
    return torch.cat(((x[...,:2]+x[...,2:])/2,x[...,2:]-x[...,:2]),-1)

def matched_loss(logits,boxes,truth):
    if logits.ndim!=3 or logits.shape[-1]!=1 or boxes.shape!=(*logits.shape[:2],4):
        raise ValueError("unexpected one-class detector output")
    if not torch.isfinite(logits).all() or not torch.isfinite(boxes).all() or (boxes[...,2:]<=0).any():
        raise ValueError("invalid native prediction")
    scores=logits[...,0]
    target=torch.zeros_like(scores);bbox=boxes.sum()*0;giou=boxes.sum()*0;count=0
    for i,gt in enumerate(truth):
        g=torch.as_tensor(np.asarray(gt,dtype=np.float32).reshape(-1,4),device=boxes.device)
        if not len(g):continue
        if not torch.isfinite(g).all() or (g[:,2:]<=g[:,:2]).any() or (g<0).any() or (g>1).any():
            raise ValueError("invalid normalized targets")
        t=cxcywh(g);pred=boxes[i]
        with torch.no_grad():
            cost=5*torch.cdist(pred,t,p=1)-2*generalized_box_iou(xyxy(pred),g)-2*scores[i].sigmoid()[:,None]
            a,b=linear_sum_assignment(cost.detach().cpu().numpy())
        a=torch.as_tensor(a,device=boxes.device);b=torch.as_tensor(b,device=boxes.device)
        target[i,a]=1;count+=len(a)
        bbox+=F.l1_loss(pred[a],t[b],reduction="sum")
        giou+=(1-generalized_box_iou(xyxy(pred[a]),g[b]).diag()).sum()
    p=scores.sigmoid()
    ce=F.binary_cross_entropy_with_logits(scores,target,reduction="none")
    focal=torch.where(target>0,.25*(1-p).square(),.75*p.square())
    denom=max(1,count)
    cls=(ce*focal).sum()/denom
    return cls+5*bbox/denom+2*giou/denom,{"matched":count,"classification":float(cls.detach()),"bbox":float((bbox/denom).detach()),"giou":float((giou/denom).detach())}

def model_load(md):
    model,info=RfDetrForObjectDetection.from_pretrained(md,local_files_only=True,use_safetensors=True,
      trust_remote_code=False,num_labels=1,id2label={0:"bee"},label2id={"bee":0},
      ignore_mismatched_sizes=True,output_loading_info=True)
    last=int(model.config.decoder_layers)-1
    # Size mismatch must be confined to reinitialized one-class heads.
    def key(item):return item if isinstance(item,str) else item[0]
    mismatch=[key(x) for x in info.get("mismatched_keys",[])]
    missing=list(info.get("missing_keys",[]));unexpected=list(info.get("unexpected_keys",[]))
    if any(key_kind(x,last)!="class" for x in mismatch+missing+unexpected):
        raise ValueError("unexpected checkpoint mismatch: "+str((mismatch,missing,unexpected))[:180])
    if model.config.num_labels!=1 or model.config.id2label.get(0)!="bee":raise ValueError("one-class config failed")
    names={};counts={}
    for name,p in model.named_parameters():
        kind=key_kind(name,last);p.requires_grad_(kind is not None)
        if kind:names[name]=p;counts[kind]=counts.get(kind,0)+p.numel()
    if set(counts)!={"class","box","decoder"}:raise ValueError("required trainable groups missing: "+str(counts))
    total=sum(p.numel() for p in model.parameters())
    if sum(counts.values())>=total/2:raise ValueError("trainable parameter cap exceeded")
    model.eval() # single inference query group, gradients remain enabled.
    return model,names,{"totalParameters":total,"trainableParameters":sum(counts.values()),"groups":counts,
      "mismatchedKeys":mismatch,"missingKeys":missing,"unexpectedKeys":unexpected,
      "trainMode":"eval forward with gradients, final Hungarian loss, no dropout/group-DETR auxiliary loss"}

def train(model,processor,names,rows):
    rng=np.random.default_rng(base.SEED)
    pos=np.array([i for i,(_,b) in enumerate(rows) if b]);neg=np.array([i for i,(_,b) in enumerate(rows) if not b])
    if len(pos)<10 or len(neg)<10:raise ValueError("insufficient labelled tile diversity")
    before={n:hashlib.sha256(p.detach().numpy().tobytes()).hexdigest() for n,p in model.named_parameters()}
    opt=torch.optim.AdamW(list(names.values()),lr=3e-5,weight_decay=.01)
    first=None;history=[]
    for step in range(STEPS):
        inds=[int(rng.choice(pos)),int(rng.choice(neg))]
        batch=[rows[i] for i in inds]
        data=processor(images=[Image.fromarray(px) for px,_ in batch],return_tensors="pt",size={"height":384,"width":384})
        out=model(**data)
        loss,stats=matched_loss(out.logits,out.pred_boxes,[b for _,b in batch])
        if not torch.isfinite(loss):raise ValueError("nonfinite training loss")
        opt.zero_grad();loss.backward()
        if step==0:
            first={n:bool(p.grad is not None and torch.isfinite(p.grad).all() and p.grad.abs().max()>0) for n,p in names.items()}
            if not any(first.values()):raise ValueError("no actual detector gradients")
        torch.nn.utils.clip_grad_norm_(list(names.values()),1.0,error_if_nonfinite=True);opt.step()
        if step in (0,15,31,47,63,79,95):
            history.append({"step":step+1,"loss":float(loss.detach()),**stats})
            print("RF_NATIVE_STEP",json.dumps(history[-1]),flush=True)
    changed=[n for n,p in model.named_parameters() if hashlib.sha256(p.detach().numpy().tobytes()).hexdigest()!=before[n]]
    if any(n not in names for n in changed):raise ValueError("frozen parameter changed")
    changed_groups={key_kind(n,int(model.config.decoder_layers)-1) for n in changed}
    if not {"class","box","decoder"}<=changed_groups:raise ValueError("detector groups did not all update: "+str(changed_groups))
    return {"steps":STEPS,"positiveTiles":len(pos),"negativeTiles":len(neg),"history":history,
      "changedParameterTensors":len(changed),"changedGroups":sorted(changed_groups),"frozenParametersUnchanged":True,
      "nonzeroGradientTensorsFirstStep":sum(first.values())}

def collect_predictions(model,processor,samples):
    rows=[];total_tiles=0;elapsed=0
    for image,gt,ev,poly in samples:
        start=time.monotonic();items=[]
        for x,y,cw,ch,px in full.image_tiles(image,True):
            if poly is not None and (x+cw<poly[:,0].min()*image.width or x>poly[:,0].max()*image.width
             or y+ch<poly[:,1].min()*image.height or y>poly[:,1].max()*image.height):continue
            items.append((x,y,cw,ch,Image.fromarray(px)))
        bb=[];ss=[]
        for i in range(0,len(items),2):
            batch=items[i:i+2]
            data=processor(images=[r[4] for r in batch],return_tensors="pt",size={"height":384,"width":384})
            with torch.inference_mode():out=model(**data)
            if out.logits.shape[-1]!=1:raise ValueError("unexpected class dimension")
            boxes=xyxy(out.pred_boxes).numpy();scores=out.logits[...,0].sigmoid().numpy()
            if not np.isfinite(boxes).all() or not np.isfinite(scores).all():raise ValueError("nonfinite native outputs")
            for (x,y,cw,ch,_),b,s in zip(batch,boxes,scores):
                center=(b[:,:2]+b[:,2:])/2
                valid=(center[:,0]>=0)&(center[:,0]*full.W<cw)&(center[:,1]>=0)&(center[:,1]*full.H<ch)
                b[:,[0,2]]=(b[:,[0,2]]*full.W+x)/image.width;b[:,[1,3]]=(b[:,[1,3]]*full.H+y)/image.height
                b=b.clip(0,1);valid&=(b[:,2]>b[:,0])&(b[:,3]>b[:,1])
                if poly is not None:valid&=roi.inside(b,poly)
                bb.extend(b[valid]);ss.extend(s[valid])
        b=np.asarray(bb,dtype=np.float32).reshape(-1,4);s=np.asarray(ss,dtype=np.float32)
        keep=nms(torch.from_numpy(b),torch.from_numpy(s),.5).numpy()
        rows.append((gt,b[keep],s[keep],{"tiles":len(items),"ortMs":0,"pipelineMs":(time.monotonic()-start)*1000}))
        total_tiles+=len(items);elapsed+=time.monotonic()-start
    return rows,{"tiles":total_tiles,"elapsedSec":elapsed}

def metric(rows,t):
    result=full.score_rows(rows,t)
    result.pop("ortMs",None) # PyTorch inference, no ORT claim.
    return result

def run(out):
    from safetensors.torch import save_file
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.set_num_interop_threads(1);torch.manual_seed(base.SEED)
    out.mkdir(parents=True,exist_ok=True);start=time.monotonic()
    report={"scope":"native RF-DETR partial detector fine-tuning, public exploratory CPU only",
      "sourceModelSha256":base.MODEL_SHA,"sampleErrors":[],"videoSources":{},"phases":{},
      "productRecognitionAuthorized":False,"cleanupAuthorized":False,"directionCountingEvaluated":False,
      "physicalHiveIndependenceVerified":False,"archiveFullChecksumVerified":False,"androidVerified":False}
    def checkpoint():
        (out/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")
        print("RF_NATIVE_CHECKPOINT",json.dumps(report["phases"]),flush=True)
    try:
        seen=set();train_rows,june_cal,external=full.collect(report,seen)
        ext_cal,fresh=transfer.extra_external(report,seen)
        report["partitions"]={"fit":[r[2] for r in train_rows],"juneCalibration":[r[2] for r in june_cal],
           "externalCalibration":[r[2] for r in ext_cal],"externalFixed":[r[2] for r in external],
           "externalNamedComparison":[r[2] for r in fresh]}
        with tempfile.TemporaryDirectory(prefix="paseka-native-") as directory:
            root=Path(directory);md=root/"model";md.mkdir()
            sources.download(base.MODEL_URL,md/"model.safetensors",base.MAX_MODEL,base.MODEL_SHA,121926336)
            for name,(sha,size,rev) in roi.CONFIGS.items():
                sources.download(f"https://huggingface.co/Roboflow/rf-detr-nano/resolve/{rev}/{name}",md/name,65536,sha,size)
            model,names,report["modelLoading"]=model_load(md)
            processor=AutoImageProcessor.from_pretrained(md,local_files_only=True,trust_remote_code=False)
            tiles=[tile for im,gt,_ in train_rows for tile in full.training_tiles(im,gt)]
            report["phases"]["input"]="VERIFIED_BOUNDED_SAMPLES_AND_ONE_CLASS_MODEL";checkpoint()
            report["training"]=train(model,processor,names,tiles);del tiles
            report["phases"]["training"]="ACTUAL_DECODER_AND_HEAD_UPDATES";checkpoint()
            a,report["juneCalibrationExtraction"]=collect_predictions(model,processor,transfer.wrap(june_cal))
            b,report["externalCalibrationExtraction"]=collect_predictions(model,processor,transfer.wrap(ext_cal))
            curve=[{"threshold":t,"june":metric(a,t),"external":metric(b,t)} for t in THRESHOLDS]
            for x in curve:x["macroF1"]=(x["june"]["f1"]+x["external"]["f1"])/2
            best=max(curve,key=lambda m:(m["macroF1"],m["threshold"]))
            report["calibration"]={"selected":best,"curve":curve};t=best["threshold"]
            path=out/"experimental_native_delta.safetensors"
            save_file({n:p.detach().contiguous().clone() for n,p in names.items()},str(path),
              metadata={"scope":"research-only","base_sha256":base.MODEL_SHA,"threshold":str(t),
                "class":"bee","transformers":"5.11.0","method":"single-group final Hungarian loss"})
            report["delta"]={"bytes":path.stat().st_size,"sha256":hashlib.sha256(path.read_bytes()).hexdigest()}
            report["phases"]["calibration"]="FROZEN";checkpoint()
            old=full.collect_2018(report,seen)
            zones=roi.zone_catalog()
            july=transfer.samples_video(root,roi.CONTROL,roi.CONTROL_VIDEO,roi.CONTROL_TRACKS,zones[roi.CONTROL],
                lambda refs:roi.consecutive(refs,12),seen,report)
            report["comparisons"]={}
            for name,rows in (("externalFixed",transfer.wrap(external)),("externalNamedComparison",transfer.wrap(fresh)),
                               ("oldDate",transfer.wrap(old)),("julyBPublisherROI",july)):
                if not rows:report["comparisons"][name]={"status":"NO_VALID_SAMPLE"};continue
                preds,perf=collect_predictions(model,processor,rows)
                report["comparisons"][name]={"samples":len(rows),"extraction":perf,"metrics":metric(preds,t)}
            report["phases"]["evaluation"]="COMPLETED_WITH_RECORDED_EXCLUSIONS"
            report["status"]="NATIVE_RESEARCH_COMPLETED"
    except Exception as exc:
        report["status"]="STOP_WITHOUT_ACCEPTANCE";report["errorType"]=type(exc).__name__;report["detail"]=str(exc)[:280]
    report["elapsedSec"]=time.monotonic()-start;checkpoint()
    return report

if __name__=="__main__":
    import sys
    r=run(Path(sys.argv[1]));print("PUBLIC_BEE_NATIVE_REPORT",json.dumps(r,sort_keys=True,allow_nan=False),flush=True)
    raise SystemExit(0 if r["status"]=="NATIVE_RESEARCH_COMPLETED" else 1)
