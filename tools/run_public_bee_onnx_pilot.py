#!/usr/bin/env python3
"""Frozen bee model export and real-frame numerical parity; CPU research only.
No training, deployment, raw media artifacts, directional count or Android proof."""
import hashlib
import json
import os
import shutil
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace
import numpy as np
import torch
import onnx
import onnxruntime as ort
from transformers import AutoImageProcessor
import run_public_bee_frozen_pilot as frozen
import run_public_bee_native_pilot as native
import run_public_bee_full_cycle as full
import run_public_bee_roi_pilot as roi
import run_public_bee_query_head_pilot as base
import run_public_bee_transfer_pilot as transfer
import verify_public_bee_pilot_inputs as sources

OPSET=18
MAX_MODEL_BYTES=160*1024*1024
SCORE_TOL=1e-3
BOX_TOL=1e-3

class Export(torch.nn.Module):
    def __init__(self,model):
        super().__init__();self.model=model
    def forward(self,pixel_values):
        out=self.model(pixel_values=pixel_values)
        return out.logits,out.pred_boxes

def checked_pixels(data):
    if set(data.keys())-{"pixel_values","pixel_mask"}:
        raise ValueError("unexpected processor fields")
    x=data["pixel_values"]
    if tuple(x.shape[1:])!=(3,384,384) or x.dtype!=torch.float32 or not torch.isfinite(x).all():
        raise ValueError("unexpected processor tensor")
    if "pixel_mask" in data and not bool(torch.all(data["pixel_mask"]==1)):
        raise ValueError("export only supports full unmasked tiles")
    return x

def verify_outputs(a,b):
    if len(a)!=2 or len(b)!=2:raise ValueError("output count")
    al,ab=map(np.asarray,a);bl,bb=map(np.asarray,b)
    if al.shape!=bl.shape or ab.shape!=bb.shape or al.ndim!=3 or al.shape[-1]!=1 or ab.shape!=(*al.shape[:2],4):
        raise ValueError("output shape mismatch")
    if not all(np.isfinite(v).all() for v in (al,ab,bl,bb)):raise ValueError("nonfinite outputs")
    # Probability/normalized-box tolerance is declared before the trial.
    p=1/(1+np.exp(-np.clip(al,-80,80)));q=1/(1+np.exp(-np.clip(bl,-80,80)))
    score=float(np.max(np.abs(p-q)));box=float(np.max(np.abs(ab-bb)))
    disagreement=int(np.count_nonzero((p>=frozen.THRESHOLD)!=(q>=frozen.THRESHOLD)))
    return {"maxScoreDiff":score,"maxBoxDiff":box,"thresholdDisagreements":disagreement,
      "pass":score<=SCORE_TOL and box<=BOX_TOL and disagreement==0}

class OrtAdapter:
    def __init__(self,session):
        self.session=session
    def __call__(self,**data):
        x=checked_pixels(data);out=[self.session.run(["logits","boxes"],{"pixel_values":t[None].contiguous().numpy()}) for t in x]
        return SimpleNamespace(logits=torch.from_numpy(np.concatenate([v[0] for v in out])),
                               pred_boxes=torch.from_numpy(np.concatenate([v[1] for v in out])))

def compare_frames(a,b):
    if len(a)!=len(b):raise ValueError("frame count mismatch")
    rows=[]
    for (_,ab,ascore,_),(_,bb,bscore,_) in zip(a,b):
        aa=ab[ascore>=frozen.THRESHOLD];ba=bb[bscore>=frozen.THRESHOLD]
        m=full.match(aa,ba,.99)
        rows.append({"torchDetections":len(aa),"ortDetections":len(ba),"matchedAtIoU99":len(m),
                     "pass":len(aa)==len(ba)==len(m)})
    return rows

def run(out,delta):
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.set_num_interop_threads(1);torch.manual_seed(base.SEED)
    out.mkdir(parents=True,exist_ok=True);start=time.monotonic()
    report={"scope":"frozen FP32 ONNX CPU portability","sourceRun":46117679978,"sourceCodeSha":"1ea3f34558b89e4e2321ab94de9bf858b436d28f",
      "sourceModelSha256":base.MODEL_SHA,"deltaSha256":frozen.DELTA_SHA,"phases":{},"sourceAttempts":{},"videoSources":{},
      "training":False,"directionCountingEvaluated":False,"productRecognitionAuthorized":False,"cleanupAuthorized":False,"androidVerified":False}
    def checkpoint():
        (out/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True,allow_nan=False)+"\n")
        print("RF_ONNX_CHECKPOINT",json.dumps(report["phases"]),flush=True)
    try:
        # Keep the validated delta accessible separately from the expiring source run.
        if delta.stat().st_size!=frozen.DELTA_BYTES or hashlib.sha256(delta.read_bytes()).hexdigest()!=frozen.DELTA_SHA:
            raise ValueError("frozen delta digest/size mismatch")
        shutil.copyfile(delta,out/"experimental_native_delta.safetensors")
        report["phases"]["delta"]="EXACT_BYTES_PRESERVED";checkpoint()
        with tempfile.TemporaryDirectory(prefix="paseka-onnx-") as directory:
            root=Path(directory);md=root/"model";md.mkdir()
            sources.download(base.MODEL_URL,md/"model.safetensors",base.MAX_MODEL,base.MODEL_SHA,121926336)
            for name,(sha,size,rev) in roi.CONFIGS.items():
                sources.download(f"https://huggingface.co/Roboflow/rf-detr-nano/resolve/{rev}/{name}",md/name,65536,sha,size)
            model,report["frozenModel"]=frozen.load_frozen(md,delta)
            processor=AutoImageProcessor.from_pretrained(md,local_files_only=True,trust_remote_code=False)
            # Trace fixed shape only; zero input is NOT real parity evidence.
            wrapper=Export(model).eval()
            x=torch.zeros((1,3,384,384),dtype=torch.float32)
            path=root/"experimental_bee_fp32.onnx"
            with torch.no_grad():
                torch.onnx.export(wrapper,(x,),str(path),input_names=["pixel_values"],output_names=["logits","boxes"],
                                  opset_version=OPSET,dynamo=False,external_data=False,do_constant_folding=True)
            size=path.stat().st_size
            if not 0<size<=MAX_MODEL_BYTES:raise ValueError("export size cap")
            graph=onnx.load(str(path),load_external_data=False)
            onnx.checker.check_model(graph)
            domains=sorted({n.domain for n in graph.graph.node})
            if any(d not in ("","ai.onnx") for d in domains):raise ValueError("nonstandard ONNX operator domain")
            if any(t.data_location==onnx.TensorProto.EXTERNAL for t in graph.graph.initializer):
                raise ValueError("external tensor data forbidden")
            report["export"]={"bytes":size,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"opset":OPSET,
              "domains":domains,"operators":sorted({n.op_type for n in graph.graph.node}),"inputShape":[1,3,384,384]}
            del graph
            opts=ort.SessionOptions();opts.intra_op_num_threads=min(4,os.cpu_count() or 1);opts.inter_op_num_threads=1
            session=ort.InferenceSession(str(path),sess_options=opts,providers=["CPUExecutionProvider"])
            if len(session.get_inputs())!=1 or session.get_inputs()[0].name!="pixel_values" or session.get_inputs()[0].shape!=[1,3,384,384]:
                raise ValueError("runtime input contract")
            if [x.name for x in session.get_outputs()]!=["logits","boxes"]:raise ValueError("runtime output contract")
            report["phases"]["export"]="CHECKED_STANDARD_ONNX_CPU_LOADED";checkpoint()
            # Prior July A run 46129548587 verified these exact publisher UUIDs
            # and bytes; no catalog request needed to re-verify immutable pins.
            name=roi.DEVELOPMENT
            v=frozen.acquire_checked(root,name,"video",base.VIDEO,sources.MAX_VIDEO,".mp4",report)
            t=frozen.acquire_checked(root,name,"tracks",base.TRACKS,sources.MAX_LABELS,".txt",report)
            z=frozen.acquire_checked(root,name,"zone",("7fa8a906-4f75-4559-bd60-9b557ec2c8a8",70,"23a339cef571975e18fdaafbb01c988c0e3ec4668bac7a491c8effe54ad50580"),65536,".zone",report)
            refs=roi.load_ids(t);poly=roi.parse_zone(z.read_text(encoding="ascii"))
            ids=[3001,3012,3024]
            if not all(f in refs for f in ids):raise ValueError("missing pinned reference frames")
            from PIL import Image
            samples=[]
            for f,px in zip(ids,base.decode(v,ids)):
                gt=[b for b in refs[f].values() if roi.inside([b],poly)[0]]
                samples.append((Image.fromarray(px),gt,{"frame":f,"decodedSha256":hashlib.sha256(px.tobytes()).hexdigest()},poly))
            if len(samples)!=3:raise ValueError("incomplete frame decode")
            report["frames"]=[s[2] for s in samples]
            tiles=[v[4] for image,_,_,poly in samples for v in frozen.roi_tiles(image,poly)]
            if len(tiles)<6:raise ValueError("insufficient real tiles")
            report["phases"]["realInput"]="PINNED_BYTES_VERIFIED";checkpoint()
            results=[];torch_ms=[];ort_ms=[]
            # Fixed six lexicographic-position crops, no score selection.
            selected=[tiles[((2*i+1)*len(tiles))//12] for i in range(6)]
            for tile in selected:
                data=processor(images=[tile],return_tensors="pt",size={"height":384,"width":384});x=checked_pixels(data)
                with torch.inference_mode():
                    ref=model(**data);plain=wrapper(x)
                    if not verify_outputs((ref.logits.numpy(),ref.pred_boxes.numpy()),tuple(v.numpy() for v in plain))["pass"]:
                        raise ValueError("omitting all-one pixel mask changes reference")
                session.run(None,{"pixel_values":x.numpy()})
                t=time.monotonic()
                with torch.inference_mode():a=tuple(v.numpy() for v in wrapper(x))
                torch_ms.append((time.monotonic()-t)*1000)
                t=time.monotonic();b=session.run(None,{"pixel_values":x.numpy()});ort_ms.append((time.monotonic()-t)*1000)
                results.append(verify_outputs(a,b))
            report["rawParity"]={"tiles":results,"torchMsMedian":float(np.median(torch_ms)),"ortMsMedian":float(np.median(ort_ms)),
                "scoreTolerance":SCORE_TOL,"boxTolerance":BOX_TOL}
            if not all(v["pass"] for v in results):raise ValueError("raw numerical parity rejected")
            pt,_=frozen.reduced_predictions(model,processor,samples)
            on,_=frozen.reduced_predictions(OrtAdapter(session),processor,samples)
            matches=compare_frames(pt,on)
            a=native.metric(pt,frozen.THRESHOLD);b=native.metric(on,frozen.THRESHOLD)
            report["frameParity"]={"frames":matches,"torch":a,"ort":b,
              "postprocessing":"same Python/Torch NMS, no Android implementation"}
            if not all(v["pass"] for v in matches) or any(a[k]!=b[k] for k in ("tp","fp","fn")):
                raise ValueError("frame-level parity rejected")
            shutil.copyfile(path,out/"experimental_bee_fp32.onnx")
            report["phases"]["parity"]="REAL_TILE_AND_FRAME_PARITY_VERIFIED"
            report["status"]="ONNX_RESEARCH_COMPLETED"
    except Exception as exc:
        report["status"]="STOP_WITHOUT_ACCEPTANCE";report["errorType"]=type(exc).__name__;report["detail"]=str(exc)[:500]
    report["elapsedSec"]=time.monotonic()-start;checkpoint()
    return report

if __name__=="__main__":
    import sys
    r=run(Path(sys.argv[1]),Path(sys.argv[2]));print("PUBLIC_BEE_ONNX_REPORT",json.dumps(r,sort_keys=True,allow_nan=False),flush=True)
    raise SystemExit(0 if r["status"]=="ONNX_RESEARCH_COMPLETED" else 1)
