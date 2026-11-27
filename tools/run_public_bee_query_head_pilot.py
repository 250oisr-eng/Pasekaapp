#!/usr/bin/env python3
"""Exploratory bee-only query classifier on two distinct public recordings.

Frozen RF-DETR Nano COCO proposals + learned binary query head. No GT is fed
to the model during inference; GT is only used to fit the head on June and
to score a held-out July video. This is NOT a fine-tuned full detector,
not independent physical-hive validation, not a directional counter.
"""
import csv
import hashlib
import json
import math
import os
import resource
import subprocess
import tempfile
import time
from pathlib import Path

from verify_public_bee_pilot_inputs import (
    REVISION, MODEL_URL, MODEL_SHA, MAX_MODEL, MAX_VIDEO, MAX_LABELS,
    VIDEO, TRACKS, download, source_url, verify_safetensors,
)

# Native public recording pairs from the exact version-6 publisher catalog
# verified in research CI run 46072648209; not third-party YouTube clips.
TRAIN_VIDEO = ("4e2cefe4-cee8-4c6d-80c8-eff560bc4a53", 188325790,
               "1fe1a0ac03af8256873c786d753daecefd88de6a29f04b992a7aaee6a0c6f63b")
TRAIN_TRACKS = ("51688235-d0e7-4402-ab7a-7606bfefa1f9", 1147830,
                "140b973b74b4d5478fd78c5af70df1f49d61c539038dac1d3c6186b230c5a3e0")
WIDTH, HEIGHT = 1920, 1080
COLS, ROWS = 5, 3
TRAIN_FRAMES, TEST_FRAMES = 8, 3
SEED = 20261128
THRESHOLDS = (0.50, 0.80)
MATCH_IOU = 0.50
POS_IOU, NEG_IOU = 0.30, 0.10
BATCH = 2
BASE = f"https://huggingface.co/Roboflow/rf-detr-nano/resolve/{REVISION}/"
PROCESSOR_REVISION = "9f201577d9415f0378084748d27e68586e6b3600"


def load_tracks(path):
    frames = {}
    seen = set()
    with path.open(encoding="ascii", newline="") as stream:
        raw_rows = list(csv.reader(stream))
    if len(raw_rows) > 1_000_000:
        raise ValueError("reference rows exceed bound")
    for row in raw_rows:
        if len(row) != 6:
            raise ValueError("invalid track row length")
        frame, track = map(int, row[:2])
        x, y, w, h = map(float, row[2:])
        if (not 1 <= frame <= 100000 or track < 0 or (frame, track) in seen
                or not all(map(math.isfinite, (x, y, w, h)))
                or not (0 <= x < x+w <= 1 and 0 <= y < y+h <= 1)):
            raise ValueError("invalid/duplicate source annotation")
        seen.add((frame, track))
        if len(seen) > 1_000_000:
            raise ValueError("reference rows exceed bound")
        frames.setdefault(frame, []).append((x, y, x+w, y+h))
    if not frames:
        raise ValueError("empty reference")
    return frames


def choose_frames(frames, count):
    ordered = sorted(frames)
    if len(ordered) < count:
        raise ValueError("insufficient annotated frames")
    # Fixed quantile midpoints, not chosen for bee density or detector score.
    result = [ordered[((2*i+1)*len(ordered))//(2*count)] for i in range(count)]
    if len(set(result)) != count:
        raise ValueError("duplicate sampled frames")
    return result


def decode(video, frame_ids):
    import numpy as np
    # Publisher frame IDs are one-based; FFmpeg select index is zero-based.
    metadata = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=width,height,nb_frames", "-of", "json", str(video)
    ], timeout=30))
    streams = metadata.get("streams", [])
    if len(streams) != 1 or (streams[0]["width"], streams[0]["height"]) != (WIDTH, HEIGHT):
        raise ValueError("unexpected source video dimensions")
    total = streams[0].get("nb_frames")
    if total not in (None, "N/A") and int(total) < max(frame_ids):
        raise ValueError("annotation exceeds video frame count")
    filt = "+".join(f"eq(n\\,{n-1})" for n in frame_ids)
    raw = subprocess.check_output([
        "ffmpeg", "-nostdin", "-v", "error", "-noautorotate", "-i", str(video),
        "-map", "0:v:0", "-vf", "select="+filt, "-frames:v", str(len(frame_ids)),
        "-fps_mode", "passthrough", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"
    ], timeout=150)
    if len(raw) != len(frame_ids)*WIDTH*HEIGHT*3:
        raise ValueError("missing or extra decoded source frames")
    return np.frombuffer(raw, dtype=np.uint8).reshape(len(frame_ids), HEIGHT, WIDTH, 3)


def tile_reference(boxes, x0, y0, x1, y1):
    """Assign each GT by center to one fixed tile and clip at its boundary."""
    out = []
    for x, y, r, b in boxes:
        cx, cy = (x+r)*WIDTH/2, (y+b)*HEIGHT/2
        if not (x0 <= cx < x1 and y0 <= cy < y1):
            continue
        out.append(((max(x*WIDTH, x0)-x0)/(x1-x0),
                    (max(y*HEIGHT, y0)-y0)/(y1-y0),
                    (min(r*WIDTH, x1)-x0)/(x1-x0),
                    (min(b*HEIGHT, y1)-y0)/(y1-y0)))
    return out


def tiles(pixels, frame_ids, refs):
    from PIL import Image
    all_tiles = []
    for image, fid in zip(pixels, frame_ids):
        for row in range(ROWS):
            y0, y1 = row*HEIGHT//ROWS, (row+1)*HEIGHT//ROWS
            for col in range(COLS):
                x0, x1 = col*WIDTH//COLS, (col+1)*WIDTH//COLS
                boxes = tile_reference(refs[fid], x0, y0, x1, y1)
                all_tiles.append((fid, row, col, Image.fromarray(image[y0:y1,x0:x1]), boxes))
    if sum(len(tile[4]) for tile in all_tiles) != sum(len(refs[fid]) for fid in frame_ids):
        raise ValueError("reference tile assignment lost a box")
    return all_tiles


def iou_matrix(a, b):
    import numpy as np
    a = np.asarray(a, dtype=np.float64).reshape(-1, 4)
    b = np.asarray(b, dtype=np.float64).reshape(-1, 4)
    if not len(a) or not len(b):
        return np.zeros((len(a), len(b)))
    left = np.maximum(a[:, None, :2], b[None, :, :2])
    right = np.minimum(a[:, None, 2:], b[None, :, 2:])
    overlap = np.maximum(right-left, 0).prod(axis=2)
    area_a = np.maximum(a[:, 2:]-a[:, :2], 0).prod(axis=1)
    area_b = np.maximum(b[:, 2:]-b[:, :2], 0).prod(axis=1)
    return overlap / np.maximum(area_a[:,None]+area_b[None,:]-overlap, 1e-12)


def match_count(gt, pred, threshold=MATCH_IOU):
    import numpy as np
    from scipy.optimize import linear_sum_assignment
    scores = iou_matrix(gt, pred)
    if not scores.size:
        return 0
    eligible = scores >= threshold
    # Maximize number of valid one-to-one matches before maximizing IoU.
    objective = np.where(eligible, min(scores.shape)+1+scores, 0)
    rows, cols = linear_sum_assignment(objective, maximize=True)
    return int(eligible[rows, cols].sum())


def extract_queries(model, processor, items):
    import numpy as np
    import torch
    rows = []
    for start in range(0, len(items), BATCH):
        batch = items[start:start+BATCH]
        # Only actual pixel crops are passed to processor/model. No GT geometry.
        images = [item[3] for item in batch]
        values = processor(images=images, return_tensors="pt", size={"height":384,"width":384})
        if tuple(values["pixel_values"].shape) != (len(images),3,384,384):
            raise ValueError("unexpected RF-DETR Nano input dimensions")
        with torch.inference_mode():
            output = model(**values)
        hidden = output.last_hidden_state.detach().float().cpu().numpy()
        boxes = output.pred_boxes.detach().float().cpu().numpy()
        if hidden.ndim != 3 or boxes.ndim != 3 or hidden.shape[:2] != boxes.shape[:2] or boxes.shape[-1] != 4:
            raise ValueError("unexpected model query/box alignment")
        if not np.isfinite(hidden).all() or not np.isfinite(boxes).all():
            raise ValueError("nonfinite model output")
        for item, features, xywh in zip(batch, hidden, boxes):
            pred = np.concatenate((xywh[:, :2]-xywh[:, 2:]/2,
                                   xywh[:, :2]+xywh[:, 2:]/2), axis=1).clip(0, 1)
            valid = np.all(pred[:, 2:] > pred[:, :2], axis=1)
            rows.append({"frame": item[0], "tile": [item[1], item[2]],
                         "features": features[valid], "boxes": pred[valid], "gt": item[4]})
    if len(rows) != len(items):
        raise ValueError("missing inference outputs")
    return rows


def proposal_stats(rows):
    covered = sum(match_count(row["gt"], row["boxes"]) for row in rows)
    gt = sum(len(row["gt"]) for row in rows)
    return {"referenceBoxes": gt, "proposalBoxes": sum(len(row["boxes"]) for row in rows),
            "matchedAtIoU50": covered, "proposalRecallUpperBound": covered/gt if gt else None}


def fit_head(rows):
    import numpy as np
    import torch
    features, targets = [], []
    positive_frames = set()
    for row in rows:
        scores = iou_matrix(row["boxes"], row["gt"])
        best = scores.max(axis=1) if scores.shape[1] else np.zeros(len(row["boxes"]))
        use = (best >= POS_IOU) | (best <= NEG_IOU)
        positive = best[use] >= POS_IOU
        if positive.any():
            positive_frames.add(row["frame"])
        features.append(row["features"][use])
        targets.append(positive)
    x = torch.from_numpy(np.concatenate(features).astype(np.float32))
    y = torch.from_numpy(np.concatenate(targets).astype(np.float32))
    npos, nneg = int(y.sum().item()), int((1-y).sum().item())
    counts = {"positives": npos, "negatives": nneg, "positiveFrames": len(positive_frames)}
    if npos < 10 or nneg < 10 or len(positive_frames) < 2:
        return None, counts
    # Training-only feature normalization; never fit statistics to July.
    mean = x.mean(dim=0)
    std = x.std(dim=0).clamp(min=1e-4)
    x = (x-mean)/std
    torch.manual_seed(SEED)
    head = torch.nn.Linear(x.shape[1], 1)
    optimizer = torch.optim.AdamW(head.parameters(), lr=0.01, weight_decay=0.01)
    weight = torch.tensor(min(100.0, nneg/npos))
    for _ in range(100):
        optimizer.zero_grad()
        score = head(x).squeeze(-1)
        loss = torch.nn.functional.binary_cross_entropy_with_logits(score, y, pos_weight=weight)
        if not torch.isfinite(loss):
            raise ValueError("nonfinite head loss")
        loss.backward()
        optimizer.step()
    head.eval()
    counts["finalTrainingLoss"] = float(loss.detach())
    counts["headSha256"] = hashlib.sha256(b"".join(
        t.detach().contiguous().numpy().tobytes() for t in (mean, std, head.weight, head.bias)
    )).hexdigest()
    return (head, mean, std), counts


def evaluate(rows, fit, threshold):
    import torch
    from torchvision.ops import nms
    head, mean, std = fit
    tp = fp = fn = 0
    details = []
    for row in rows:
        x = torch.from_numpy(row["features"].astype("float32"))
        boxes = torch.from_numpy(row["boxes"].astype("float32"))
        with torch.inference_mode():
            score = head((x-mean)/std).squeeze(-1).sigmoid()
        use = score >= threshold
        candidates, scores = boxes[use], score[use]
        keep = nms(candidates, scores, 0.5)
        pred = candidates[keep].numpy()
        matched = match_count(row["gt"], pred)
        tp += matched
        fp += len(pred)-matched
        fn += len(row["gt"])-matched
        details.append({"frame": row["frame"], "tile": row["tile"],
                        "reference": len(row["gt"]), "predicted": len(pred), "matched": matched})
    precision = tp/(tp+fp) if tp+fp else None
    recall = tp/(tp+fn) if tp+fn else None
    f1 = 2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None
    return {"scoreThreshold": threshold, "iouThreshold": MATCH_IOU, "tp": tp, "fp": fp, "fn": fn,
            "precision": precision, "recall": recall, "f1": f1,
            "tiles": len(rows), "perTile": details}


def acquire_pair(root, video_spec, label_spec, name):
    v, t = root/(name+".mp4"), root/(name+".txt")
    return v, t, {"video": download(source_url(video_spec[0]), v, MAX_VIDEO, video_spec[2], video_spec[1]),
                  "tracks": download(source_url(label_spec[0]), t, MAX_LABELS, label_spec[2], label_spec[1])}


def run():
    import numpy as np
    import torch
    import transformers
    from transformers import AutoImageProcessor, RfDetrForObjectDetection
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    torch.set_num_interop_threads(1)
    torch.manual_seed(SEED)
    start = time.monotonic()
    report = {"scope": "experimental frozen-proposal query head; no product acceptance",
              "dataset": "Tomyslav Sledevic, Mendeley Data v6, DOI 10.17632/8gb9r2yhfc.6, CC BY 4.0",
              "modelId": "Roboflow/rf-detr-nano", "modelRevision": REVISION, "license": "Apache-2.0",
              "trainRecording": "20230609b-def", "testRecording": "20230711a-fan",
              "independentPhysicalHivesVerified": False, "distinctRecordingHashes": TRAIN_VIDEO[2] != VIDEO[2],
              "seed": SEED, "tilesPerFrame": COLS*ROWS, "resolution": [WIDTH,HEIGHT],
              "runtime": {"torch":torch.__version__, "transformers":transformers.__version__},
              "fullDetectorFineTuned": False, "directionCountingEvaluated": False,
              "productRecognitionAuthorized": False, "physicalAndroidVerified": False,
              "cleanupAuthorized": False}
    with tempfile.TemporaryDirectory(prefix="paseka-bee-head-") as directory:
        root = Path(directory)
        model_dir = root/"model"; model_dir.mkdir()
        weights = model_dir/"model.safetensors"
        report["modelFile"] = download(MODEL_URL, weights, MAX_MODEL, MODEL_SHA)
        verify_safetensors(weights)
        report["configs"] = {}
        for name in ("config.json", "preprocessor_config.json"):
            url = BASE+name if name == "config.json" else f"https://huggingface.co/Roboflow/rf-detr-nano/resolve/{PROCESSOR_REVISION}/"+name
            report["configs"][name] = download(url, model_dir/name, 65536)
            report["configs"][name]["revision"] = REVISION if name == "config.json" else PROCESSOR_REVISION
            config = json.loads((model_dir/name).read_text())
            if not isinstance(config, dict) or config.get("auto_map"):
                raise ValueError("custom remote model code not allowed")
        config = json.loads((model_dir/"config.json").read_text())
        if config.get("model_type") != "rf_detr" or config.get("architectures") != ["RfDetrForObjectDetection"]:
            raise ValueError("unexpected official model config")
        train_v, train_t, report["trainSource"] = acquire_pair(root, TRAIN_VIDEO, TRAIN_TRACKS, "train")
        test_v, test_t, report["testSource"] = acquire_pair(root, VIDEO, TRACKS, "test")
        train_refs, test_refs = load_tracks(train_t), load_tracks(test_t)
        train_ids, test_ids = choose_frames(train_refs, TRAIN_FRAMES), choose_frames(test_refs, TEST_FRAMES)
        report["trainFrameIds"], report["testFrameIds"] = train_ids, test_ids
        train_px, test_px = decode(train_v, train_ids), decode(test_v, test_ids)
        train_hashes = {hashlib.sha256(frame.tobytes()).hexdigest() for frame in train_px}
        test_hashes = {hashlib.sha256(frame.tobytes()).hexdigest() for frame in test_px}
        if len(train_hashes) != len(train_ids) or len(test_hashes) != len(test_ids) or train_hashes & test_hashes:
            raise ValueError("duplicate decoded frame across or within sampled recordings")
        report["sampleFrameHashDisjoint"] = True
        processor = AutoImageProcessor.from_pretrained(model_dir, local_files_only=True, trust_remote_code=False)
        model = RfDetrForObjectDetection.from_pretrained(model_dir, local_files_only=True,
                                                          use_safetensors=True, trust_remote_code=False)
        model.eval()
        for parameter in model.parameters():
            parameter.requires_grad_(False)
        if any("bee" in str(label).lower() for label in model.config.id2label.values()):
            raise ValueError("unexpected pretrained class list")
        # Evaluation is not used to train, tune, select, or normalize the head.
        train_rows = extract_queries(model, processor, tiles(train_px, train_ids, train_refs))
        report["trainProposal"] = proposal_stats(train_rows)
        fit, report["training"] = fit_head(train_rows)
        test_rows = extract_queries(model, processor, tiles(test_px, test_ids, test_refs))
        report["testProposal"] = proposal_stats(test_rows)
        report["testMetrics"] = [evaluate(test_rows, fit, threshold) for threshold in THRESHOLDS] if fit else []
        report["status"] = "EXPLORATORY_HEAD_TRAINED" if fit else "STOP_INSUFFICIENT_POSITIVE_PROPOSALS"
        report["elapsedSec"] = round(time.monotonic()-start, 3)
        report["peakRssKiB"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return report


if __name__ == "__main__":
    print("PUBLIC_BEE_HEAD_REPORT", json.dumps(run(), sort_keys=True, allow_nan=False), flush=True)
