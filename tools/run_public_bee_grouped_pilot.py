#!/usr/bin/env python3
"""Bounded public multi-group training experiment, no product acceptance.
Zenodo DOI 10.5281/zenodo.14929560 CC BY 4.0, publisher archive pin/entry CRC/local SHA.
Mendeley v6 DOI 10.17632/8gb9r2yhfc.6 CC BY 4.0. No user media.
June named groups only; July comparison recordings previously examined.
"""
import hashlib
import io
import json
import os
import re
import tempfile
import time
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath
import numpy as np
from PIL import Image
import torch
import probe_public_bee_zenodo_zip as zsrc
import run_public_bee_center_pilot as center
import run_public_bee_query_head_pilot as base
import verify_public_bee_pilot_inputs as sources

TRAIN_GROUPS=("20230609a","20230609c","20230609d")
CAL_GROUP="20230609e"
PER_GROUP=4
SCHEME=zsrc.SCHEMES[1]  # class 1 is pollen-bearing bee, not a grain.
CONFIG="dataset/data_custom [bee-pollenbee-drone-wasp].yaml"
CONFIG_SHA="5c1d230ebdff39a4adf5a3565a7a41c69c52caee1f248c5c325e37d1355a7817"
CAP=48*1024*1024

class SampleReader(zsrc.RangeReader):
    # Reuse exact 206/content-range guard. Allow bounded 192 requests instead
    # of 80, for 16 image/label pairs; each member remains <=4MiB.
    def read(self,n=-1):
        if self.requests>=192:raise ValueError("sample request cap")
        # Parent checks its per-batch request limit. Reset only the local
        # counter during a call, preserving actual cumulative count/budget.
        total=self.requests;self.requests=0
        try:return super().read(n)
        finally:self.requests+=total

def index(z):
    all_names=set(); groups={}; unknown=[]; patterns=Counter(); other_dates=Counter()
    for info in z.infolist():
        p=zsrc.safe_name(info)
        if info.filename in all_names:raise ValueError("duplicate archive member")
        all_names.add(info.filename)
        if "images" not in p.parts or p.suffix.lower() not in (".jpg",".jpeg",".png"):continue
        g=zsrc.source_group(info.filename)
        if g is None:
            unknown.append(p.name)
            patterns[re.sub(r"[0-9]+","#",p.stem.lower())]+=1
            date=re.search(r"(?:19|20)[0-9]{6}",p.stem)
            if date:other_dates[date.group()]+=1
            continue
        groups.setdefault(g,[]).append(info.filename)
    return groups,{"unknownCount":len(unknown),"unknownExamples":sorted(unknown)[:30],
                   "unknownPatterns":patterns.most_common(24),"unknownDateTokens":dict(other_dates),
                   "knownGroups":{g:len(v) for g,v in sorted(groups.items())}}

def select(groups):
    chosen={}
    for g in (*TRAIN_GROUPS,CAL_GROUP):
        names=sorted(groups.get(g,[]),key=lambda p:int(re.search(r"[0-9]+$",PurePosixPath(p).stem).group()))
        if len(names)<PER_GROUP:raise ValueError("missing required June group")
        if len({PurePosixPath(n).stem for n in names})!=len(names):raise ValueError("duplicate frame within group")
        chosen[g]=[names[((2*i+1)*len(names))//(2*PER_GROUP)] for i in range(PER_GROUP)]
    return chosen

def boxes(raw):
    zsrc.label_rows(raw)
    result=[]; counts=Counter()
    for line in raw.decode("utf-8").splitlines():
        if not line.strip():continue
        k,x,y,w,h=line.split();counts[k]+=1
        if k=="3":continue
        x,y,w,h=map(float,(x,y,w,h))
        box=(max(0,x-w/2),max(0,y-h/2),min(1,x+w/2),min(1,y+h/2))
        if not (box[0]<box[2] and box[1]<box[3]):raise ValueError("invalid clipped bee box")
        result.append(box)
    return result,dict(counts)

def paired_label(name):
    p=PurePosixPath(name);parts=list(p.parts)
    parts[parts.index("images")]=SCHEME
    return str(PurePosixPath(*parts).with_suffix(".txt"))

def load_sample(z,name,fid,seen):
    iraw=zsrc.read_entry(z,z.getinfo(name),4*1024*1024)
    lrname=paired_label(name)
    lraw=zsrc.read_entry(z,z.getinfo(lrname),65536)
    with Image.open(io.BytesIO(iraw)) as image:
        if image.format!="JPEG" or image.size!=(base.WIDTH,base.HEIGHT):
            raise ValueError("unexpected archive image dimensions/format")
        rgb=np.asarray(image.convert("RGB"),dtype=np.uint8)
    digest=hashlib.sha256(rgb.tobytes()).hexdigest()
    if digest in seen:raise ValueError("duplicate decoded pixels")
    seen.add(digest)
    gt,counts=boxes(lraw)
    items=[(f,r,c,np.array(im,dtype=np.uint8),b) for f,r,c,im,b in base.tiles(rgb[None], [fid],{fid:gt})]
    return items,{"image":name,"imageSha256":hashlib.sha256(iraw).hexdigest(),"decodedSha256":digest,
                  "label":lrname,"labelSha256":hashlib.sha256(lraw).hexdigest(),"classCounts":counts,"beeBoxes":len(gt)}

def run(out):
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.set_num_interop_threads(1);torch.manual_seed(base.SEED)
    start=time.monotonic();seen=set();report={"scope":"public grouped exploratory comparison, no physical hive proof",
      "zenodo":"10.5281/zenodo.14929560 CC BY 4.0","mendeley":"10.17632/8gb9r2yhfc.6 CC BY 4.0",
      "archiveFullMd5Verified":False,"trainingAdmissionForProduct":False,"productRecognitionAuthorized":False,
      "cleanupAuthorized":False,"directionCountingEvaluated":False,"sources":{}}
    out.mkdir(parents=True,exist_ok=True)
    try:
        reader=SampleReader(zsrc.record(),zsrc.SIZE,budget=CAP)
        with zipfile.ZipFile(reader) as z:
            groups,report["inventory"]=index(z)
            config=zsrc.read_entry(z,z.getinfo(CONFIG),65536)
            if hashlib.sha256(config).hexdigest()!=CONFIG_SHA:raise ValueError("class map pin mismatch")
            chosen=select(groups)
            report["samples"]={};train=[];cal=[];fid=100001
            for group,names in chosen.items():
                report["samples"][group]=[]
                for name in names:
                    items,evidence=load_sample(z,name,fid,seen)
                    (cal if group==CAL_GROUP else train).extend(items)
                    report["samples"][group].append(evidence);fid+=1
        report["rangeBytes"]=reader.received;report["rangeRequests"]=reader.requests
        with tempfile.TemporaryDirectory(prefix="paseka-grouped-") as directory:
            root=Path(directory)
            vp,refs,report["sources"]["juneB"]=center.acquire(root,"juneB",base.TRAIN_VIDEO,base.TRAIN_TRACKS)
            ids=base.choose_frames(refs,48)
            # Same original training partition, distinct group calibration.
            train.extend(center.dataset(vp,ids[:36],refs,seen))
            model=center.BeeCenter()
            center.STEPS=480
            report["training"]=center.train(model,train);del train
            scores=center.scored(model,cal)
            curve=[center.metrics(scores,t) for t in center.THRESHOLDS]
            best=max(curve,key=lambda m:(m["f1"],m["precision"] or 0,m["threshold"]))
            report["calibration"]=curve;report["threshold"]=best["threshold"]
            report["comparisons"]={}
            for name,v,t,n in (("julyA",base.VIDEO,base.TRACKS,3),("julyB",center.CONTROL_VIDEO,center.CONTROL_TRACKS,12)):
                vp,refs,report["sources"][name]=center.acquire(root,name,v,t)
                ids=base.choose_frames(refs,n)
                items=center.dataset(vp,ids,refs,seen)
                report["comparisons"][name]={"frameIds":ids,**center.metrics(center.scored(model,items),best["threshold"])}
                if name=="julyA":report["onnx"]=center.export_check(model,items[0][3],out)
        report["status"]="EXPLORATORY_GROUPED_TRAINING_COMPLETED"
    except Exception as exc:
        report["status"]="STOP_WITHOUT_PRODUCT_ADMISSION"
        report["errorType"]=type(exc).__name__;report["detail"]=str(exc)[:300]
    report["elapsedSec"]=time.monotonic()-start
    (out/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")
    return report

if __name__=="__main__":
    import sys
    r=run(Path(sys.argv[1]));print("PUBLIC_BEE_GROUPED_REPORT",json.dumps(r,sort_keys=True,allow_nan=False),flush=True)
    raise SystemExit(0 if r["status"]=="EXPLORATORY_GROUPED_TRAINING_COMPLETED" else 1)
