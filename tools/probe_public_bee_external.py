#!/usr/bin/env python3
"""Read-only, bounded cross-source benchmark for already frozen public ONNX.
Data: BeeLivingSensor, Noninvasive bee tracking in videos: deep learning
algorithms and cloud platform design specifications. Dataset, 2021.
https://lila.science/datasets/boxes-on-bees-and-pollen ; CDLA-Permissive-1.0.
Never train on this sample, publish images or claim physical hive independence.
"""
import hashlib
import io
import json
import math
import re
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path,PurePosixPath
from urllib.request import Request,urlopen
import numpy as np
from PIL import Image
from scipy.ndimage import maximum_filter
from scipy.optimize import linear_sum_assignment
import probe_public_bee_zenodo_zip as zsrc
import run_public_bee_query_head_pilot as base

URL="https://lilawildlife.blob.core.windows.net/lila-wildlife/boxes-on-bees/boxes-on-bees-2021.zip"
MODEL_SHA="34eea8b0b045cc657e33a7ca353054863cdad4aa55e9bead49011b023acb0e21"
MODEL_BYTES=157897
SCORE=.35
MAX_IMAGES=6
CAP=24*1024*1024
W,H=384,360

def open_archive():
    req=Request(URL,method="HEAD",headers={"Accept-Encoding":"identity"})
    with urlopen(req,timeout=25) as r:
        if r.geturl()!=URL:raise ValueError("unexpected archive redirect")
        size=int(r.headers["Content-Length"])
        etag=r.headers.get("ETag")
        if not 100000000<size<4000000000 or not etag or etag.startswith("W/"):
            raise ValueError("missing bounded archive size or strong ETag")
        meta={"bytes":size,"etag":etag,"contentMd5":r.headers.get("Content-MD5")}
    def pinned(req,timeout):
        req.add_header("If-Match",etag)
        response=urlopen(req,timeout=timeout)
        if response.geturl()!=URL or response.headers.get("ETag")!=etag:
            response.close();raise ValueError("archive representation changed")
        return response
    return zsrc.RangeReader(URL,size,opener=pinned,budget=CAP),meta

def index(z):
    imgs={}; xmls={}; seen=set()
    infos=z.infolist()
    if not 0<len(infos)<=30000:raise ValueError("archive directory cap")
    for info in infos:
        p=zsrc.safe_name(info)
        if info.filename in seen:raise ValueError("duplicate archive member")
        seen.add(info.filename)
        if info.is_dir():continue
        k=p.stem
        target=imgs if p.suffix.lower() in (".jpg",".jpeg") else xmls if p.suffix.lower()==".xml" else None
        if target is None:continue
        if k in target:raise ValueError("ambiguous image/label basename")
        target[k]=info
    keys=sorted(imgs.keys()&xmls.keys())
    if not keys:raise ValueError("no image/XML pairs")
    groups={}
    for k in keys:
        match=re.fullmatch(r"(.+?)[_-]([0-9]+)",k)
        if match:groups.setdefault(match[1],[]).append(k)
    group_names=sorted(groups)
    n=min(MAX_IMAGES,len(group_names))
    selected=[groups[group_names[((2*i+1)*len(group_names))//(2*n)]][len(groups[group_names[((2*i+1)*len(group_names))//(2*n)]])//2] for i in range(n)] if n else []
    return imgs,xmls,selected,{"images":len(imgs),"xml":len(xmls),"paired":len(keys),
         "filenamePrefixGroups":len(groups),"prefixExamples":group_names[:20],
         "unparsedNames":len(keys)-sum(map(len,groups.values())),"selectedNames":selected,
         "filenameGroupsArePhysicalHiveProof":False}

def parse_voc(raw,width,height):
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():raise ValueError("unsafe XML declaration")
    root=ET.fromstring(raw)
    if root.tag!="annotation" or int(root.findtext("size/width","0"))!=width or int(root.findtext("size/height","0"))!=height:
        raise ValueError("VOC image dimension mismatch")
    bees=[];classes={}
    for obj in root.findall("object"):
        name=obj.findtext("name","").strip().lower()
        if name not in ("bee","pollen"):raise ValueError("unknown VOC class: "+name)
        classes[name]=classes.get(name,0)+1
        box=obj.find("bndbox")
        if box is None:raise ValueError("missing VOC box")
        x,y,r,b=[float(box.findtext(k,"nan")) for k in ("xmin","ymin","xmax","ymax")]
        if not all(map(math.isfinite,(x,y,r,b))) or not (0<=x<r<=width and 0<=y<b<=height):
            raise ValueError("invalid VOC geometry")
        # VOC convention may be one-based inclusive; use coordinates as
        # published continuous edges; record convention, don't infer corrections.
        if name=="bee":bees.append((x/width,y/height,r/width,b/height))
    return bees,classes

def sigmoid(x):
    return 1/(1+np.exp(-np.clip(x,-80,80)))

def decode(raw):
    if raw.shape!=(5,90,96) or not np.isfinite(raw).all():raise ValueError("invalid model output")
    p=sigmoid(raw[0]); yy,xx=np.where((p==maximum_filter(p,size=3,mode="constant",cval=0))&(p>=SCORE))
    s=p[yy,xx];order=np.argsort(-s,kind="stable")[:300];yy,xx,s=yy[order],xx[order],s[order]
    cx=(xx+sigmoid(raw[1,yy,xx]))/96;cy=(yy+sigmoid(raw[2,yy,xx]))/90
    w=np.exp(np.clip(raw[3,yy,xx],-2,5))/96;h=np.exp(np.clip(raw[4,yy,xx],-2,5))/90
    return np.stack((cx-w/2,cy-h/2,cx+w/2,cy+h/2),1).clip(0,1),s

def predict(runtime,image):
    width,height=image.size
    if not 0<width*height<=12000000:raise ValueError("image pixel cap")
    boxes=[];scores=[];elapsed=0;tiles=0
    for y in range(0,height,H):
        for x in range(0,width,W):
            crop=image.crop((x,y,min(x+W,width),min(y+H,height)))
            canvas=Image.new("RGB",(W,H));canvas.paste(crop,(0,0))
            data=np.asarray(canvas,dtype=np.float32).transpose(2,0,1)[None]/255
            start=time.monotonic();raw=runtime.run(["center_geometry"],{"rgb01":data})[0][0];elapsed+=time.monotonic()-start;tiles+=1
            b,s=decode(raw)
            b[:,[0,2]]=(b[:,[0,2]]*W+x)/width;b[:,[1,3]]=(b[:,[1,3]]*H+y)/height
            valid=(b[:,0]+b[:,2])/2<=1
            valid&=(b[:,1]+b[:,3])/2<=1
            boxes.extend(b[valid].clip(0,1));scores.extend(s[valid])
    if not boxes:return np.empty((0,4)),tiles,elapsed
    b=np.asarray(boxes);order=list(np.argsort(-np.asarray(scores),kind="stable"));keep=[]
    while order:
        i=order.pop(0);keep.append(i)
        if order:
            overlaps=base.iou_matrix(b[i:i+1],b[order])[0]
            order=[j for j,v in zip(order,overlaps) if v<=.5]
    return b[keep],tiles,elapsed

def run(model,out):
    import onnxruntime as ort
    report={"scope":"frozen compact ONNX external still-image comparison, not acceptance",
      "source":"BeeLivingSensor, Noninvasive bee tracking in videos: deep learning algorithms and cloud platform design specifications. Dataset, 2021",
      "license":"CDLA-Permissive-1.0","datasetUrl":URL,"modelSha256":MODEL_SHA,"threshold":SCORE,
      "archiveFullChecksumVerified":False,"physicalHivesVerified":False,"directionCountingEvaluated":False,
      "trainingPerformed":False,"productRecognitionAuthorized":False,"cleanupAuthorized":False}
    reader=None
    try:
        if model.stat().st_size!=MODEL_BYTES or hashlib.sha256(model.read_bytes()).hexdigest()!=MODEL_SHA:
            raise ValueError("frozen ONNX hash mismatch")
        options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
        runtime=ort.InferenceSession(str(model),sess_options=options,providers=["CPUExecutionProvider"])
        reader,report["archive"]=open_archive()
        with zipfile.ZipFile(reader) as z:
            imgs,xmls,selected,report["inventory"]=index(z)
            if not selected:raise ValueError("no named prefix groups")
            seen=set();report["samples"]=[];tp=fp=fn=tiles=0;elapsed=0
            for key in selected:
                iraw=zsrc.read_entry(z,imgs[key],4*1024*1024);xraw=zsrc.read_entry(z,xmls[key],65536)
                with Image.open(io.BytesIO(iraw)) as source:
                    if source.format!="JPEG" or not 0<source.width*source.height<=12000000:raise ValueError("unexpected image format/size")
                    image=source.convert("RGB")
                digest=hashlib.sha256(image.tobytes()).hexdigest()
                if digest in seen:raise ValueError("duplicate decoded sample")
                seen.add(digest)
                gt,classes=parse_voc(xraw,*image.size)
                pred,count,seconds=predict(runtime,image)
                n=base.match_count(gt,pred,.5)
                tp+=n;fp+=len(pred)-n;fn+=len(gt)-n;tiles+=count;elapsed+=seconds
                report["samples"].append({"name":key,"imageSha256":hashlib.sha256(iraw).hexdigest(),
                   "xmlSha256":hashlib.sha256(xraw).hexdigest(),"decodedSha256":digest,"size":list(image.size),
                   "classes":classes,"tp":n,"fp":len(pred)-n,"fn":len(gt)-n,"crcVerified":True})
        report["metrics"]={"tp":tp,"fp":fp,"fn":fn,"precision":tp/(tp+fp) if tp+fp else None,
             "recall":tp/(tp+fn) if tp+fn else None,"f1":2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None,
             "tileCount":tiles,"cpuTileMeanMs":1000*elapsed/tiles if tiles else None}
        report["status"]="EXTERNAL_COMPARISON_COMPLETED"
    except Exception as exc:
        report["status"]="STOP_WITHOUT_ACCEPTANCE";report["errorType"]=type(exc).__name__;report["detail"]=str(exc)[:240]
    if reader is not None:report["rangeBytes"]=reader.received;report["rangeRequests"]=reader.requests
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")
    return report

if __name__=="__main__":
    import sys
    r=run(Path(sys.argv[1]),Path(sys.argv[2]))
    print("PUBLIC_BEE_EXTERNAL_REPORT",json.dumps(r,sort_keys=True,allow_nan=False),flush=True)
    raise SystemExit(0 if r["status"]=="EXTERNAL_COMPARISON_COMPLETED" else 1)
