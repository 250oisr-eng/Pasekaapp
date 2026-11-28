#!/usr/bin/env python3
"""One bounded public-data experiment: frozen comparison, diverse training,
overlap localization, actual prediction tracking, ONNX runtime measurements.
Research only. No user media, deployment, cleanup, or direction truth.
Zenodo DOI 10.5281/zenodo.14929560 CC BY 4.0; Mendeley v6 DOI
10.17632/8gb9r2yhfc.6 CC BY 4.0 (Tomyslav Sledevic);
LILA BeeLivingSensor Boxes on Bees and Pollen, CDLA-Permissive-1.0.
"""
import hashlib
import io
import json
import math
import os
import re
import tempfile
import time
import zipfile
from pathlib import Path,PurePosixPath
import numpy as np
from PIL import Image
from scipy.ndimage import maximum_filter
from scipy.optimize import linear_sum_assignment
import torch
from torch.nn import functional as F
import onnxruntime as ort
import run_public_bee_center_pilot as center
import run_public_bee_grouped_pilot as grouped
import run_public_bee_query_head_pilot as base
import probe_public_bee_zenodo_zip as zsrc
import probe_public_bee_external as ext
import verify_public_bee_pilot_inputs as sources

W,H=center.W,center.H
SEED=base.SEED
FROZEN={"initial":("34eea8b0b045cc657e33a7ca353054863cdad4aa55e9bead49011b023acb0e21",.35),
        "grouped":("29e5a667761b47adfa7620c5e33e6300a0a9ada5c1170d7868229310e8bcc8da",.20)}
EXTERNAL_TEST=("Chueried_Churied_01_ST_251","Doettingen_Doettingen_Hive_1_3763","Erlen_Erlen_Hive_04_1553",
 "Frohheimstrasse_14_Froh_14_ST_2437","Frohheimstrasse_23_Froh23_TC_2677","unknown_apiary_unknown_hive_5556")
EXTERNAL_TRAIN=("Echolinde_Echolinde_Hive_11","OldSchoolHoney_1-Old")
STEPS=600
CURVE=(.05,.10,.15,.20,.25,.35,.50,.65,.80,.90)
MIN_SCORE=.05

class BoundedReader(zsrc.RangeReader):
    def __init__(self,url,size,opener,budget,max_requests):
        super().__init__(url,size,opener=opener,budget=budget);self.max_requests=max_requests
    def read(self,n=-1):
        if self.requests>=self.max_requests:raise ValueError("range request cap")
        total=self.requests;self.requests=0
        try:return super().read(n)
        finally:self.requests+=total

def choose(names,n):
    names=sorted(names)
    if len(names)<n:raise ValueError("insufficient named samples")
    return [names[((2*i+1)*len(names))//(2*n)] for i in range(n)]

def axis_starts(size,tile,step):
    if size<=tile:return [0]
    starts=list(range(0,size-tile+1,step))
    if starts[-1]!=size-tile:starts.append(size-tile)
    return starts

def image_tiles(image,overlap):
    width,height=image.size
    if not 0<width*height<=12000000:raise ValueError("image pixel cap")
    for y in axis_starts(height,H,270 if overlap else H):
        for x in axis_starts(width,W,288 if overlap else W):
            crop=image.crop((x,y,min(x+W,width),min(y+H,height)))
            canvas=Image.new("RGB",(W,H));canvas.paste(crop,(0,0))
            yield x,y,crop.width,crop.height,np.asarray(canvas,dtype=np.uint8)

def crop_gt(gt,width,height,x,y,cw,ch):
    result=[]
    for a,b,c,d in gt:
        a,c=a*width,c*width;b,d=b*height,d*height
        if not (x<=(a+c)/2<x+cw and y<=(b+d)/2<y+ch):continue
        box=(max(0,a-x)/W,max(0,b-y)/H,min(cw,c-x)/W,min(ch,d-y)/H)
        if box[0]<box[2] and box[1]<box[3]:result.append(box)
    return result

def training_tiles(image,gt):
    # Overlap gives intact boxes near ordinary tile boundaries. Exclude
    # tiles with only clipped-off reference fragments from negative sampling.
    out=[]
    for x,y,cw,ch,pixels in image_tiles(image,True):
        boxes=crop_gt(gt,*image.size,x,y,cw,ch)
        if not boxes and any(a*image.width<x+cw and c*image.width>x and
                             b*image.height<y+ch and d*image.height>y for a,b,c,d in gt):continue
        if cw!=W or ch!=H:continue
        out.append((pixels,boxes))
    return out

def jpeg_sample(z,name,seen,kind):
    raw=zsrc.read_entry(z,z.getinfo(name),4*1024*1024)
    label=grouped.paired_label(name)
    labels=zsrc.read_entry(z,z.getinfo(label),65536)
    with Image.open(io.BytesIO(raw)) as im:
        if im.format not in ("JPEG","PNG") or not 0<im.width*im.height<=12000000:raise ValueError("bad image")
        image=im.convert("RGB")
    gt,classes=grouped.boxes(labels)
    return sample_evidence(image,gt,classes,raw,labels,name,seen,kind)

def sample_evidence(image,gt,classes,raw,labels,name,seen,kind):
    digest=hashlib.sha256(image.tobytes()).hexdigest()
    if digest in seen:raise ValueError("duplicate decoded pixels across sample partitions")
    seen.add(digest)
    return (image,gt,{"name":name,"source":kind,"size":list(image.size),"imageSha256":hashlib.sha256(raw).hexdigest(),
      "labelSha256":hashlib.sha256(labels).hexdigest(),"decodedSha256":digest,"classes":classes,"beeBoxes":len(gt)})

def read_external(z,imgs,xmls,name,seen):
    raw=zsrc.read_entry(z,imgs[name],4*1024*1024);labels=zsrc.read_entry(z,xmls[name],65536)
    with Image.open(io.BytesIO(raw)) as im:
        if im.format not in ("JPEG","PNG","BMP","TIFF") or not 0<im.width*im.height<=12000000:
            raise ValueError("bad external image")
        image=im.convert("RGB")
    gt,classes=ext.parse_voc(labels,*image.size)
    return sample_evidence(image,gt,classes,raw,labels,name,seen,"LILA")

def collect(report,seen):
    train=[];cal=[];external=[];old=[]
    # Fit/calibrate only June named groups. July and 2018 not fitted.
    reader=BoundedReader(zsrc.record(),zsrc.SIZE,zsrc.urlopen,80*1024*1024,280)
    with zipfile.ZipFile(reader) as z:
        groups,inventory=grouped.index(z);report["zenodoInventory"]=inventory
        config=zsrc.read_entry(z,z.getinfo(grouped.CONFIG),65536)
        if hashlib.sha256(config).hexdigest()!=grouped.CONFIG_SHA:raise ValueError("class map pin mismatch")
        for group in (*grouped.TRAIN_GROUPS,grouped.CAL_GROUP):
            for name in choose(groups[group],6):
                try:
                    row=jpeg_sample(z,name,seen,"Zenodo June "+group)
                    (cal if group==grouped.CAL_GROUP else train).append(row)
                except Exception as exc:report["sampleErrors"].append({"name":name,"partition":"June "+group,"error":str(exc)[:160]})
    report["zenodoFitRange"]={"bytes":reader.received,"requests":reader.requests}
    if len(train)<12 or len(cal)<3:raise ValueError("insufficient verified June samples")
    # Other provider: only two named prefixes not represented in fixed test.
    initial,archive=ext.open_archive()
    if archive["etag"]!="0x8DC6292D953F766" or archive["bytes"]!=2076021293:raise ValueError("external archive changed")
    reader=BoundedReader(initial.url,initial.size,initial.opener,64*1024*1024,192)
    report["externalArchive"]=archive
    with zipfile.ZipFile(reader) as z:
        imgs,xmls,_,inventory=ext.index(z);report["externalInventory"]=inventory
        for group in EXTERNAL_TRAIN:
            names=[k for k in imgs.keys()&xmls.keys() if k.startswith(group+"_") and k not in EXTERNAL_TEST]
            for name in choose(names,8):
                try:
                    row=read_external(z,imgs,xmls,name,seen)
                    im,gt,_=row
                    if im.width<1280 or im.height<720 or not gt:
                        report["sampleErrors"].append({"name":name,"partition":"LILA fit","error":"not full-sized positive frame"})
                        continue
                    train.append(row)
                except Exception as exc:report["sampleErrors"].append({"name":name,"partition":"LILA fit","error":str(exc)[:160]})
        for name in EXTERNAL_TEST:
            try:external.append(read_external(z,imgs,xmls,name,seen))
            except Exception as exc:report["sampleErrors"].append({"name":name,"partition":"LILA fixed evaluation","error":str(exc)[:160]})
    report["externalRange"]={"bytes":reader.received,"requests":reader.requests}
    if not external:raise ValueError("no valid external test samples")
    return train,cal,external

def collect_2018(report,seen):
    # Date-token candidate only; physical hive/session map not available.
    reader=BoundedReader(zsrc.record(),zsrc.SIZE,zsrc.urlopen,24*1024*1024,96)
    rows=[]
    with zipfile.ZipFile(reader) as z:
        names=[i.filename for i in z.infolist() if "images" in PurePosixPath(i.filename).parts and
               PurePosixPath(i.filename).suffix.lower() in (".jpg",".png",".jpeg") and "20180814" in PurePosixPath(i.filename).stem]
        report["oldDateTokenCandidates"]=len(names)
        for name in choose(names,6):
            try:rows.append(jpeg_sample(z,name,seen,"Zenodo date-token 20180814"))
            except Exception as exc:report["sampleErrors"].append({"name":name,"partition":"2018 evaluation","error":str(exc)[:160]})
    report["oldDateRange"]={"bytes":reader.received,"requests":reader.requests}
    return rows

def augment(pixels,boxes,rng):
    # Geometry-preserving horizontal flip + photometric variation; no
    # interpolation of labels, no augmentation on calibration or tests.
    if rng.random()<.5:
        pixels=pixels[:,::-1].copy();boxes=[(1-c,b,1-a,d) for a,b,c,d in boxes]
    pixels=np.clip(pixels.astype(np.float32)/255*rng.uniform(.8,1.2)+rng.uniform(-.06,.06),0,1)
    return pixels,boxes

def fit(model,rows):
    rng=np.random.default_rng(SEED)
    pos=np.array([i for i,(_,b) in enumerate(rows) if b]);neg=np.array([i for i,(_,b) in enumerate(rows) if not b])
    if len(pos)<10 or len(neg)<10:raise ValueError("insufficient tile diversity")
    opt=torch.optim.AdamW(model.parameters(),lr=.002,weight_decay=.0001)
    model.train()
    for _ in range(STEPS):
        sel=np.concatenate((rng.choice(pos,6),rng.choice(neg,2)))
        batch=[augment(*rows[i],rng) for i in sel]
        x=torch.from_numpy(np.stack([v[0] for v in batch])).permute(0,3,1,2).contiguous()
        target=[center.targets(v[1]) for v in batch]
        h=torch.from_numpy(np.stack([v[0] for v in target]));g=torch.from_numpy(np.stack([v[1] for v in target]))
        m=torch.from_numpy(np.stack([v[2] for v in target]))
        raw=model(x);p=raw[:,0].sigmoid()
        ce=F.binary_cross_entropy_with_logits(raw[:,0],(h==1).float(),reduction="none")
        heat=(ce*torch.where(h==1,(1-p).square(),p.square()*(1-h).pow(4))).sum()/m.sum().clamp(min=1)
        geometry=torch.cat((raw[:,1:3].sigmoid(),raw[:,3:5]),1)
        geo=F.smooth_l1_loss(geometry.permute(0,2,3,1)[m],g.permute(0,2,3,1)[m])
        loss=heat+3*geo
        if not torch.isfinite(loss):raise ValueError("nonfinite training")
        opt.zero_grad();loss.backward();opt.step()
    model.eval()
    return {"steps":STEPS,"positiveTiles":len(pos),"negativeTiles":len(neg),"lastLoss":float(loss.detach()),
            "augmentation":"horizontal flip, brightness, contrast","geometryLossWeight":3}

def make_runtime(path,sha=None):
    if sha and hashlib.sha256(path.read_bytes()).hexdigest()!=sha:raise ValueError("model SHA mismatch")
    options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
    return ort.InferenceSession(str(path),sess_options=options,providers=["CPUExecutionProvider"])

def raw_decode(raw):
    if raw.shape!=(5,90,96) or not np.isfinite(raw).all():raise ValueError("invalid output")
    p=ext.sigmoid(raw[0]); yy,xx=np.where((p==maximum_filter(p,size=3,mode="constant",cval=0))&(p>=MIN_SCORE))
    s=p[yy,xx];order=np.argsort(-s,kind="stable")[:300];yy,xx,s=yy[order],xx[order],s[order]
    cx=(xx+ext.sigmoid(raw[1,yy,xx]))/96*W;cy=(yy+ext.sigmoid(raw[2,yy,xx]))/90*H
    w=np.exp(np.clip(raw[3,yy,xx],-2,5))/96*W;h=np.exp(np.clip(raw[4,yy,xx],-2,5))/90*H
    return np.stack((cx-w/2,cy-h/2,cx+w/2,cy+h/2),1),s

def detect(runtime,image,overlap):
    start=time.monotonic();boxes=[];scores=[];elapsed=0;tiles=0
    for x,y,cw,ch,pixels in image_tiles(image,overlap):
        data=pixels.astype(np.float32).transpose(2,0,1)[None]/255
        t=time.monotonic();raw=runtime.run(["center_geometry"],{"rgb01":data})[0][0];elapsed+=time.monotonic()-t;tiles+=1
        b,s=raw_decode(raw)
        cx=(b[:,0]+b[:,2])/2;cy=(b[:,1]+b[:,3])/2
        valid=(cx>=0)&(cx<cw)&(cy>=0)&(cy<ch)
        # Reject tile-interior-edge cut proposals only in overlap mode;
        # the same object can be represented intact by a neighboring tile.
        if overlap:
            valid&=((b[:,0]>=0)|(x==0))&((b[:,2]<=cw)|(x+cw==image.width))
            valid&=((b[:,1]>=0)|(y==0))&((b[:,3]<=ch)|(y+ch==image.height))
        b=b[valid];s=s[valid]
        b[:,[0,2]]=(b[:,[0,2]]+x)/image.width;b[:,[1,3]]=(b[:,[1,3]]+y)/image.height
        b=b.clip(0,1);valid=(b[:,2]>b[:,0])&(b[:,3]>b[:,1])
        boxes.extend(b[valid]);scores.extend(s[valid])
    if boxes:
        from torchvision.ops import nms
        b=np.asarray(boxes,dtype=np.float32);s=np.asarray(scores,dtype=np.float32)
        keep=nms(torch.from_numpy(b),torch.from_numpy(s),.5).numpy()
        b,s=b[keep],s[keep]
    else:b,s=np.empty((0,4)),np.empty(0)
    return b,s,{"tiles":tiles,"ortMs":elapsed*1000,"pipelineMs":(time.monotonic()-start)*1000}

def match(a,b,threshold):
    matrix=base.iou_matrix(a,b)
    if not matrix.size:return []
    ok=matrix>=threshold
    r,c=linear_sum_assignment(np.where(ok,min(matrix.shape)+1+matrix,0),maximize=True)
    return [(int(i),int(j),float(matrix[i,j])) for i,j in zip(r,c) if ok[i,j]]

def score_rows(rows,t):
    tp=fp=fn=0;ious=[];stats=[]
    for gt,b,s,perf in rows:
        pred=b[s>=t];m=match(gt,pred,.5)
        tp+=len(m);fp+=len(pred)-len(m);fn+=len(gt)-len(m);ious.extend(v for _,_,v in m);stats.append(perf)
    return {"threshold":t,"tp":tp,"fp":fp,"fn":fn,"precision":tp/(tp+fp) if tp+fp else None,
      "recall":tp/(tp+fn) if tp+fn else None,"f1":2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0,
      "matchedMeanIoU":float(np.mean(ious)) if ious else None,
      "tiles":sum(p["tiles"] for p in stats),"ortMs":sum(p["ortMs"] for p in stats),
      "pipelineMsPerImage":float(np.mean([p["pipelineMs"] for p in stats])) if stats else None}

def evaluate(runtime,samples,overlap):
    rows=[]
    for image,gt,_ in samples:
        b,s,p=detect(runtime,image,overlap);rows.append((gt,b,s,p))
    return rows

def read_ids(path):
    import csv
    out={}
    base.load_tracks(path) # complete geometry, duplicate and bound checks
    with path.open(encoding="ascii",newline="") as stream:
        for row in csv.reader(stream):
            f,k=map(int,row[:2]);x,y,w,h=map(float,row[2:])
            out.setdefault(f,{})[k]=(x,y,x+w,y+h)
    return out

def consecutive(refs,count):
    keys=set(refs);mid=sorted(keys)[len(keys)//2]
    choices=[i for i in keys if all(i+j in keys for j in range(count))]
    if not choices:raise ValueError("no consecutive segment")
    start=min(choices,key=lambda i:(abs(i-mid),i));return list(range(start,start+count))

def track(refs,preds,use_motion):
    next_id=0;active={};last_gt={};truth_for_id={};switches=transitions=wrong=correct=0;matched=0
    for frame in sorted(preds):
        b=preds[frame];assigned={};used=set()
        ids=[k for k,v in active.items() if frame-v[0]==1]
        proposed=[active[k][1]+active[k][2] if use_motion else active[k][1] for k in ids]
        for i,j,_ in match(proposed,b,.30):
            assigned[j]=ids[i];used.add(ids[i])
        if use_motion:
            dormant=[k for k,v in active.items() if frame-v[0]==2]
            remaining=[j for j in range(len(b)) if j not in assigned]
            matrix=base.iou_matrix([active[k][1]+2*active[k][2] for k in dormant],b[remaining])
            if matrix.size:
                allowed=matrix>=.75
                for i,j in zip(*np.where(allowed)):
                    if allowed[i].sum()==1 and allowed[:,j].sum()==1:
                        assigned[remaining[j]]=dormant[i];used.add(dormant[i])
        new={}
        for j,box in enumerate(b):
            if j not in assigned:assigned[j]=next_id;next_id+=1
            k=assigned[j]
            prev=active.get(k)
            vel=(box-prev[1])/(frame-prev[0]) if prev is not None else np.zeros(4)
            new[k]=(frame,box,vel)
        if use_motion:
            new.update({k:v for k,v in active.items() if k not in used and frame-v[0]==1})
        active=new
        truth=refs[frame];keys=list(truth)
        current={keys[i]:assigned[j] for i,j,_ in match(list(truth.values()),b,.5)}
        matched+=len(current)
        for gt,k in current.items():
            previous=last_gt.get(gt)
            if previous and frame-previous[0]==1:
                transitions+=1;switches+=previous[1]!=k
            old=truth_for_id.get(k)
            if old and frame-old[0]<=2:
                if old[1]==gt:correct+=1
                else:wrong+=1
            truth_for_id[k]=(frame,gt);last_gt[gt]=(frame,k)
    return {"frames":len(preds),"matchedObservations":matched,"predictedTrackIds":next_id,
      "adjacentMatchedTransitions":transitions,"adjacentIdSwitches":switches,
      "switchFraction":switches/transitions if transitions else None,
      "correctRecentIdLinks":correct,"wrongRecentIdLinks":wrong,"directionCountingEvaluated":False}

def run(initial,previous,out):
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.set_num_interop_threads(1);torch.manual_seed(SEED)
    out.mkdir(parents=True,exist_ok=True)
    report={"scope":"bounded full public research cycle; no product acceptance",
      "physicalHiveIndependenceVerified":False,"directionCountingEvaluated":False,
      "productRecognitionAuthorized":False,"cleanupAuthorized":False,"androidVerified":False,
      "archiveFullChecksumVerified":False,"sampleErrors":[],"phases":{}}
    def checkpoint():
        (out/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")
        print("BEE_CYCLE_CHECKPOINT",json.dumps({"phases":report["phases"],"errors":len(report["sampleErrors"])}),flush=True)
    start=time.monotonic()
    try:
        frozen={key:make_runtime(path,FROZEN[key][0]) for key,path in (("initial",initial),("grouped",previous))}
        seen=set();train,cal,external=collect(report,seen)
        report["partitions"]={"train":[r[2] for r in train],"calibration":[r[2] for r in cal],"externalFixed":[r[2] for r in external]}
        report["phases"]["data"]="COMPLETED_WITH_RECORDED_SAMPLE_EXCLUSIONS"
        report["externalFrozen"]={key:score_rows(evaluate(runtime,external,False),FROZEN[key][1]) for key,runtime in frozen.items()}
        report["phases"]["externalFrozen"]="COMPLETED_PARTIAL_FIXED_SAMPLE";checkpoint()
        with tempfile.TemporaryDirectory(prefix="paseka-cycle-") as directory:
            root=Path(directory)
            vp,refs,report["juneVideo"]=center.acquire(root,"june",base.TRAIN_VIDEO,base.TRAIN_TRACKS)
            ids=base.choose_frames(refs,48)[:36]
            pixels=base.decode(vp,ids)
            for fid,px in zip(ids,pixels):
                digest=hashlib.sha256(px.tobytes()).hexdigest()
                if digest in seen:raise ValueError("duplicate training video pixels")
                seen.add(digest);train.append((Image.fromarray(px),refs[fid],{"source":"Mendeley June b","frame":fid,"decodedSha256":digest}))
            report["juneFrameIds"]=ids
            rows=[tile for image,gt,_ in train for tile in training_tiles(image,gt)]
            model=center.BeeCenter()
            report["training"]=fit(model,rows);del rows
            report["training"]["sourceImages"]=len(train)
            report["training"]["lilaImages"]=sum(r[2]["source"]=="LILA" for r in train)
            report["phases"]["training"]="COMPLETED"
            report["onnx"]=center.export_check(model,np.asarray(train[0][0].crop((0,0,W,H)).convert("RGB")),out)
            runtime=make_runtime(out/"experimental_bee_center.onnx")
            cal_scores=evaluate(runtime,cal,True)
            curve=[score_rows(cal_scores,t) for t in CURVE]
            best=max(curve,key=lambda m:(m["f1"],m["precision"] or 0,m["threshold"]))
            threshold=best["threshold"];report["calibration"]=curve;report["selectedThreshold"]=threshold
            report["phases"]["onnx"]="COMPLETED_CPU_PARITY";checkpoint()
            report["externalNew"]=score_rows(evaluate(runtime,external,True),threshold)
            report["oldDateComparisons"]={}
            try:
                old=collect_2018(report,seen)
                report["partitions"]["oldDate"]=[r[2] for r in old]
                if old:
                    for key,r in {**frozen,"new":runtime}.items():
                        t=threshold if key=="new" else FROZEN[key][1]
                        report["oldDateComparisons"][key]=score_rows(evaluate(r,old,key=="new"),t)
                report["phases"]["oldDate"]="PARTIAL_OR_COMPLETE_CANDIDATE_COMPARISON" if old else "BLOCKED_NO_VALID_IMAGE"
            except Exception as exc:
                report["phases"]["oldDate"]="BLOCKED";report["oldDateError"]=str(exc)[:200]
            # Same frames and same score thresholds, paired localization comparison.
            path=root/"julyB.mp4";tracks=root/"julyB.txt"
            v,t=center.CONTROL_VIDEO,center.CONTROL_TRACKS
            report["julyBSource"]={"video":sources.download(sources.source_url(v[0]),path,sources.MAX_VIDEO,v[2],v[1]),
              "tracks":sources.download(sources.source_url(t[0]),tracks,sources.MAX_LABELS,t[2],t[1])}
            refs=read_ids(tracks);ids=consecutive(refs,48);pixels=base.decode(path,ids)
            report["trackingFrameIds"]=ids
            samples=[(Image.fromarray(px),list(refs[f].values()),{}) for f,px in zip(ids,pixels)]
            report["localization"]={}
            new_predictions=None
            for key,r in {**frozen,"new":runtime}.items():
                t=threshold if key=="new" else FROZEN[key][1]
                plain=evaluate(r,samples,False);overlap=evaluate(r,samples,True)
                report["localization"][key]={"plain":score_rows(plain,t),"overlap":score_rows(overlap,t)}
                if key=="new":new_predictions={f:b[s>=t] for f,(_,b,s,_) in zip(ids,overlap)}
                if key=="grouped":
                    prior={f:b[s>=t] for f,(_,b,s,_) in zip(ids,overlap)}
                    report["groupedTracking"]={"baseline":track({f:refs[f] for f in ids},prior,False),"motionMemory":track({f:refs[f] for f in ids},prior,True)}
            report["phases"]["localization"]="COMPLETED_PAIRED_COMPARISON"
            report["tracking"]={"baseline":track({f:refs[f] for f in ids},new_predictions,False),
              "motionMemory":track({f:refs[f] for f in ids},new_predictions,True)}
            report["phases"]["tracking"]="COMPLETED_ACTUAL_PREDICTIONS"
            report["status"]="RESEARCH_CYCLE_COMPLETED"
    except Exception as exc:
        report["status"]="STOP_WITHOUT_ACCEPTANCE";report["errorType"]=type(exc).__name__;report["detail"]=str(exc)[:240]
    report["elapsedSec"]=time.monotonic()-start;checkpoint()
    return report

if __name__=="__main__":
    import sys
    r=run(Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]))
    print("PUBLIC_BEE_CYCLE_REPORT",json.dumps(r,sort_keys=True,allow_nan=False),flush=True)
    raise SystemExit(0 if r["status"]=="RESEARCH_CYCLE_COMPLETED" else 1)
