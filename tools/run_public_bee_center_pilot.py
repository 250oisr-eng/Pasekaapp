#!/usr/bin/env python3
"""Independent, compact bee-only CNN trained from scratch on pinned public video.
No proprietary/pretrained weights, no user media, no product authorization.
Dataset: Tomyslav Sledevic, Mendeley Data v6, CC BY 4.0, DOI 10.17632/8gb9r2yhfc.6.
All full-frame scores are agreement with author labels; unlabelled outside-zone
detections may be counted as extra. July A/B are comparison recordings, not
guaranteed independent physical hives or fresh unseen tests for all experiments.
"""
import hashlib
import json
import math
import os
import tempfile
import time
from pathlib import Path
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
import run_public_bee_query_head_pilot as base
import verify_public_bee_pilot_inputs as sources

W,H=384,360
STRIDE=4
GH,GW=H//STRIDE,W//STRIDE
CONTROL_VIDEO=("68ae2024-d1bf-44ad-aba5-1e5c156af054",205331307,"5568b635d084260dabc97b7ad055c902b6c7dc4faeb06fcad9141b5514ccab16")
CONTROL_TRACKS=("8bc27552-3f7d-4e0c-933a-d813b594801a",2791367,"e6f48d2885f48d81ac40aa2287eded5bac646ac8d7e5f5bfbf0385059e18bed7")
THRESHOLDS=(.05,.10,.20,.35,.50,.65,.80,.90)
STEPS=320

class BeeCenter(nn.Module):
    def __init__(self):
        super().__init__()
        self.body=nn.Sequential(nn.Conv2d(3,16,3,2,1),nn.ReLU(),
            nn.Conv2d(16,24,3,2,1),nn.ReLU(),
            nn.Conv2d(24,32,3,1,1),nn.ReLU(),
            nn.Conv2d(32,32,3,1,2,dilation=2),nn.ReLU(),
            nn.Conv2d(32,32,3,1,4,dilation=4),nn.ReLU(),
            nn.Conv2d(32,32,3,1,1),nn.ReLU())
        self.center=nn.Conv2d(32,1,1)
        self.geometry=nn.Conv2d(32,4,1)
        nn.init.constant_(self.center.bias,-2.19)
        with torch.no_grad():self.geometry.bias[2:]=2
    def forward(self,pixels):
        x=self.body(pixels)
        return torch.cat((self.center(x),self.geometry(x)),dim=1)

def targets(boxes):
    heat=np.zeros((GH,GW),np.float32)
    geom=np.zeros((4,GH,GW),np.float32)
    mask=np.zeros((GH,GW),bool); collisions=0
    for x,y,r,b in boxes:
        cx=(x+r)*GW/2;cy=(y+b)*GH/2
        ix,iy=min(GW-1,int(cx)),min(GH-1,int(cy))
        if mask[iy,ix]:collisions+=1;continue
        mask[iy,ix]=True
        geom[:,iy,ix]=[cx-ix,cy-iy,math.log(max((r-x)*GW,.25)),math.log(max((b-y)*GH,.25))]
        for yy in range(max(0,iy-2),min(GH,iy+3)):
            for xx in range(max(0,ix-2),min(GW,ix+3)):
                heat[yy,xx]=max(heat[yy,xx],math.exp(-((xx-ix)**2+(yy-iy)**2)/2))
    return heat,geom,mask,collisions

def dataset(video,ids,refs,seen):
    px=base.decode(video,ids)
    hashes={hashlib.sha256(frame.tobytes()).hexdigest() for frame in px}
    if len(hashes)!=len(ids) or seen&hashes:raise ValueError("duplicate sampled pixels")
    seen.update(hashes)
    return [(f,r,c,np.array(img,dtype=np.uint8),boxes) for f,r,c,img,boxes in base.tiles(px,ids,refs)]

def train(model,items):
    rng=np.random.default_rng(base.SEED)
    pos=np.array([i for i,x in enumerate(items) if x[4]])
    neg=np.array([i for i,x in enumerate(items) if not x[4]])
    if len(pos)<10 or len(neg)<10:raise ValueError("insufficient labelled tile diversity")
    labels=[targets(x[4]) for x in items]
    opt=torch.optim.AdamW(model.parameters(),lr=.002,weight_decay=.0001)
    model.train()
    for step in range(STEPS):
        sel=np.concatenate((rng.choice(pos,6),rng.choice(neg,2)))
        x=torch.from_numpy(np.stack([items[i][3] for i in sel])).permute(0,3,1,2).float()/255
        h=torch.from_numpy(np.stack([labels[i][0] for i in sel]))
        g=torch.from_numpy(np.stack([labels[i][1] for i in sel]))
        m=torch.from_numpy(np.stack([labels[i][2] for i in sel]))
        out=model(x); logits=out[:,0]; p=logits.sigmoid()
        ce=F.binary_cross_entropy_with_logits(logits,(h==1).float(),reduction="none")
        focal=torch.where(h==1,(1-p).square(),p.square()*(1-h).pow(4))
        heatloss=(ce*focal).sum()/m.sum().clamp(min=1)
        pred=torch.cat((out[:,1:3].sigmoid(),out[:,3:5]),1)
        geomloss=F.smooth_l1_loss(pred.permute(0,2,3,1)[m],g.permute(0,2,3,1)[m])
        loss=heatloss+2*geomloss
        if not torch.isfinite(loss):raise ValueError("nonfinite training")
        opt.zero_grad();loss.backward();opt.step()
    model.eval()
    return {"steps":STEPS,"positiveTiles":len(pos),"negativeTiles":len(neg),
            "centerCollisions":sum(l[3] for l in labels),"lastLoss":float(loss.detach())}

def decode_out(out):
    t=torch.as_tensor(out)
    p=t[0].sigmoid()
    peaks=(p==F.max_pool2d(p[None,None],3,1,1)[0,0])&(p>=min(THRESHOLDS))
    yy,xx=torch.where(peaks)
    s=p[yy,xx]
    order=torch.argsort(s,descending=True)[:300];yy,xx,s=yy[order],xx[order],s[order]
    cx=(xx+t[1,yy,xx].sigmoid())/GW;cy=(yy+t[2,yy,xx].sigmoid())/GH
    w=t[3,yy,xx].clamp(-2,5).exp()/GW;h=t[4,yy,xx].clamp(-2,5).exp()/GH
    b=torch.stack((cx-w/2,cy-h/2,cx+w/2,cy+h/2),1).clamp(0,1).numpy()
    return b,s.numpy()

def scored(model,items):
    rows=[]
    for i in range(0,len(items),8):
        batch=items[i:i+8]
        x=torch.from_numpy(np.stack([r[3] for r in batch])).permute(0,3,1,2).float()/255
        with torch.inference_mode():out=model(x).numpy()
        if not np.isfinite(out).all():raise ValueError("nonfinite inference")
        for item,raw in zip(batch,out):
            b,s=decode_out(raw)
            rows.append((item[0],item[1],item[2],item[4],b,s))
    return rows

def metrics(rows,threshold):
    from torchvision.ops import nms
    tp=fp=fn=0
    for f,r,c,gt,b,s in rows:
        mask=s>=threshold;b=b[mask];s=s[mask]
        idx=nms(torch.from_numpy(b),torch.from_numpy(s),.5).numpy()
        n=base.match_count(gt,b[idx])
        tp+=n;fp+=len(idx)-n;fn+=len(gt)-n
    return {"threshold":threshold,"tp":tp,"fp":fp,"fn":fn,
            "precision":tp/(tp+fp) if tp+fp else None,
            "recall":tp/(tp+fn) if tp+fn else None,
            "f1":2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0}

def acquire(root,name,v,t):
    vp=root/(name+".mp4");tp=root/(name+".txt")
    evidence={"video":sources.download(sources.source_url(v[0]),vp,sources.MAX_VIDEO,v[2],v[1]),
              "tracks":sources.download(sources.source_url(t[0]),tp,sources.MAX_LABELS,t[2],t[1])}
    return vp,base.load_tracks(tp),evidence

def export_check(model,image,out):
    import onnx
    import onnxruntime as ort
    out.mkdir(parents=True,exist_ok=True)
    file=out/"experimental_bee_center.onnx"
    x=torch.from_numpy(image.copy()).permute(2,0,1)[None].float()/255
    torch.onnx.export(model,x,str(file),opset_version=17,input_names=["rgb01"],output_names=["center_geometry"],dynamo=False)
    onnx.checker.check_model(str(file))
    options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
    runtime=ort.InferenceSession(str(file),sess_options=options,providers=["CPUExecutionProvider"])
    with torch.inference_mode():expected=model(x).numpy()
    actual=runtime.run(None,{"rgb01":x.numpy()})[0]
    np.testing.assert_allclose(actual,expected,rtol=1e-4,atol=2e-4)
    start=time.monotonic()
    for _ in range(10):runtime.run(None,{"rgb01":x.numpy()})
    return {"bytes":file.stat().st_size,"sha256":hashlib.sha256(file.read_bytes()).hexdigest(),
            "maxAbsOutputDifference":float(np.abs(actual-expected).max()),
            "cpuTileMeanMs":(time.monotonic()-start)*100,"inputShape":[1,3,H,W],
            "opset":17,"androidVerified":False}

def run(out):
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.set_num_interop_threads(1);torch.manual_seed(base.SEED)
    start=time.monotonic(); seen=set()
    report={"scope":"scratch compact CNN, tile-level public reference agreement only",
            "dataset":"10.17632/8gb9r2yhfc.6 CC BY 4.0 Tomyslav Sledevic",
            "noPretrainedWeights":True,"productRecognitionAuthorized":False,"cleanupAuthorized":False,
            "independentPhysicalHivesVerified":False,"directionCountingEvaluated":False,"sources":{}}
    with tempfile.TemporaryDirectory(prefix="paseka-center-") as d:
        root=Path(d)
        vp,refs,report["sources"]["train"]=acquire(root,"june",base.TRAIN_VIDEO,base.TRAIN_TRACKS)
        ids=base.choose_frames(refs,48)
        train_items=dataset(vp,ids[:36],refs,seen);cal=dataset(vp,ids[36:],refs,seen)
        report["trainFrameIds"]=ids[:36];report["calibrationFrameIds"]=ids[36:]
        model=BeeCenter()
        report["parameters"]=sum(p.numel() for p in model.parameters())
        report["training"]=train(model,train_items)
        del train_items
        scores=scored(model,cal)
        curve=[metrics(scores,t) for t in THRESHOLDS]
        best=max(curve,key=lambda m:(m["f1"],m["precision"] or 0,m["threshold"]))
        report["calibration"]=curve;report["selectedThreshold"]=best["threshold"]
        report["comparisons"]={}
        for name,v,t,n in (("julyA",base.VIDEO,base.TRACKS,3),("julyB",CONTROL_VIDEO,CONTROL_TRACKS,12)):
            vp,refs,report["sources"][name]=acquire(root,name,v,t)
            ids=base.choose_frames(refs,n)
            items=dataset(vp,ids,refs,seen)
            report["comparisons"][name]={"frameIds":ids,**metrics(scored(model,items),best["threshold"])}
            if name=="julyA":report["onnx"]=export_check(model,items[0][3],out)
        report["elapsedSec"]=time.monotonic()-start
    out.mkdir(parents=True,exist_ok=True)
    (out/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")
    return report

if __name__=="__main__":
    import sys
    print("PUBLIC_BEE_CENTER_REPORT",json.dumps(run(Path(sys.argv[1])),sort_keys=True,allow_nan=False),flush=True)
