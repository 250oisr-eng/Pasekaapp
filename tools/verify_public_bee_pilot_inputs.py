#!/usr/bin/env python3
"""Verify public, licensed model/input assets; never access user data or execute weights.

Sources: Roboflow/rf-detr-nano, Apache-2.0, immutable HF revision;
Tomyslav Sledevic, Mendeley Data v6, DOI 10.17632/8gb9r2yhfc.6, CC BY 4.0.
Files exist only in the temporary runner directory. No model inference, training,
user recording, production or cleanup authorization.
"""
import csv
import hashlib
import json
import math
import re
import struct
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

REVISION = "0a3d230da5e1634f79b0761d5c222de3a26dcf16"
MODEL_URL = f"https://huggingface.co/Roboflow/rf-detr-nano/resolve/{REVISION}/model.safetensors"
MODEL_SHA = "497b1dbcc8f9d115b806fb82d140d7e22e5b5c3fba45abefef39dd4f99c1f737"
DATASET = "https://data.mendeley.com/public-api/datasets/8gb9r2yhfc"
PUBLIC = "https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/"
VIDEO = ("5e49dc33-a4b9-4be7-af18-f51871e6b71c", 128747654, "e0f3a7b1bd2b70ddc333f8caa17c7f029687dab2ea911ac7aff3902e4d5ad3cc")
TRACKS = ("3291d9bc-bdb3-4bff-94d6-fe24f17ae2a5", 4817427, "8446fe874e2cf89041542e8740ef8c1d85086605987e5740e763b0edd20cec12")
SHA = re.compile(r"[0-9a-f]{64}")
UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
MAX_MODEL = 150_000_000
MAX_VIDEO = 200_000_000
MAX_LABELS = 12_000_000

def download(url, output, cap, sha=None, size=None):
    if urlparse(url).scheme != "https" or not 0 < cap <= MAX_VIDEO:
        raise ValueError("invalid input URL or cap")
    request = Request(url, headers={"Accept-Encoding": "identity", "User-Agent": "Paseka-public-research/1.0"})
    digest = hashlib.sha256()
    count = 0
    with urlopen(request, timeout=30) as response, output.open("xb") as target:
        if urlparse(response.geturl()).scheme != "https":
            raise ValueError("insecure final URL")
        declared = response.headers.get("Content-Length")
        if declared and (not declared.isdecimal() or int(declared) > cap):
            raise ValueError("declared download exceeds cap")
        while chunk := response.read(1024 * 1024):
            count += len(chunk)
            if count > cap:
                raise ValueError("download exceeds cap")
            digest.update(chunk)
            target.write(chunk)
    observed = digest.hexdigest()
    if not count or (size is not None and count != size) or (sha is not None and observed != sha):
        raise ValueError("source size/SHA mismatch")
    return {"bytes": count, "sha256": observed}

def verify_safetensors(path):
    size = path.stat().st_size
    with path.open("rb") as stream:
        prefix = stream.read(8)
        if len(prefix) != 8:
            raise ValueError("truncated safetensors header")
        length = struct.unpack("<Q", prefix)[0]
        if not 2 <= length <= 2_000_000 or 8 + length >= size:
            raise ValueError("invalid safetensors header size")
        header = json.loads(stream.read(length))
    if not isinstance(header, dict):
        raise ValueError("invalid tensor map")
    spans = []
    data_size = size - 8 - length
    for name, value in header.items():
        if name == "__metadata__":
            continue
        if not isinstance(value, dict) or not isinstance(value.get("shape"), list):
            raise ValueError("invalid tensor record")
        offsets = value.get("data_offsets")
        if not isinstance(offsets, list) or len(offsets) != 2 or any(type(v) is not int for v in offsets):
            raise ValueError("invalid tensor offsets")
        start, end = offsets
        if not 0 <= start <= end <= data_size:
            raise ValueError("out-of-bounds tensor")
        spans.append((start, end))
    if not spans:
        raise ValueError("empty tensor map")
    cursor = 0
    for start, end in sorted(spans):
        if start != cursor:
            raise ValueError("overlap or gap in safetensors data")
        cursor = end
    if cursor != data_size:
        raise ValueError("unreferenced tensor data")
    return {"tensorCount": len(spans), "dataBytes": data_size, "safeHeaderVerified": True}

def fetch_json(url):
    request = Request(url, headers={"Accept": "application/json", "Accept-Encoding": "identity",
                                   "User-Agent": "Paseka-public-research/1.0"})
    with urlopen(request, timeout=25) as response:
        payload = response.read(4 * 1024 * 1024 + 1)
    if len(payload) > 4 * 1024 * 1024:
        raise ValueError("metadata response too large")
    rows = json.loads(payload)
    if not isinstance(rows, list) or len(rows) > 1000 or not all(isinstance(row, dict) for row in rows):
        raise ValueError("invalid publisher list")
    return rows

def tracking_catalog():
    folders = fetch_json(DATASET + "/folders/6")
    by_id = {}
    for folder in folders:
        uid = folder.get("id")
        if not isinstance(uid, str) or not UUID.fullmatch(uid) or uid in by_id:
            raise ValueError("invalid/duplicate publisher folder")
        by_id[uid] = folder
    roots = [uid for uid, f in by_id.items() if f.get("name") == "tracking_and_behavior"]
    if len(roots) != 1:
        raise ValueError("ambiguous tracking_and_behavior folder")
    selected = set(roots)
    while True:
        expanded = selected | {uid for uid, f in by_id.items() if f.get("parent_id") in selected}
        if expanded == selected:
            break
        selected = expanded
        if len(selected) > 30:
            raise ValueError("tracking folder limit")
    records = []
    names = set()
    for folder_id in sorted(selected):
        listing = fetch_json(DATASET + f"/files?folder_id={folder_id}&version=6&$start=0&$limit=1000")
        if len(listing) >= 1000:
            raise ValueError("catalog pagination requires explicit continuation")
        for item in listing:
            name = item.get("filename")
            if not isinstance(name, str) or not (name.lower().endswith(".mp4") or name.startswith("tracks_") and name.endswith(".txt")):
                continue
            uid = item.get("id")
            details = item.get("content_details")
            if not isinstance(details, dict):
                raise ValueError("missing publisher content metadata")
            digest, size = details.get("sha256_hash"), details.get("size")
            if (not UUID.fullmatch(str(uid)) or not SHA.fullmatch(str(digest)) or type(size) is not int
                    or size <= 0 or item.get("folder_id") != folder_id or item.get("size") != size
                    or item.get("status") != "COMPLETED" or name in names):
                raise ValueError("invalid/duplicate tracking catalog entry")
            names.add(name)
            records.append({"name": name, "uuid": uid, "bytes": size, "sha256": digest})
    videos = {Path(r["name"]).stem: r for r in records if r["name"].lower().endswith(".mp4")}
    labels = {Path(r["name"]).stem.removeprefix("tracks_"): r for r in records if r["name"].startswith("tracks_")}
    paired = [{"recording": k, "video": videos[k], "labels": labels[k]} for k in sorted(videos.keys() & labels.keys())]
    if not paired:
        raise ValueError("no named video/track pairs")
    return {"pairs": paired, "unpairedVideos": sorted(videos.keys() - labels.keys()),
            "unpairedLabels": sorted(labels.keys() - videos.keys()),
            "independentPhysicalHivesVerified": False}

def parse_tracks(path):
    frames = {}
    identities = set()
    rows = 0
    with path.open(encoding="ascii", newline="") as stream:
        for record in csv.reader(stream):
            if len(record) != 6:
                raise ValueError("tracking row must contain six columns")
            frame, track = map(int, record[:2])
            x, y, w, h = map(float, record[2:])
            if not 1 <= frame <= 100000 or track < 0 or not all(map(math.isfinite, (x, y, w, h))) or not (0 <= x < x+w <= 1 and 0 <= y < y+h <= 1):
                raise ValueError("invalid tracking row")
            key = (frame, track)
            if key in identities:
                raise ValueError("duplicate track/frame")
            identities.add(key)
            frames[frame] = frames.get(frame, 0) + 1
            rows += 1
            if rows > 1_000_000:
                raise ValueError("too many tracking rows")
    if not frames:
        raise ValueError("empty tracks")
    return {"annotatedFrames": len(frames), "minFrame": min(frames), "maxFrame": max(frames),
            "referenceBoxes": rows, "sampleFrameBoxCount": frames[min(frames)]}

def decode_first_frame(path):
    output = subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-noautorotate",
                                      "-i", str(path), "-map", "0:v:0", "-frames:v", "1",
                                      "-vf", "scale=640:360:flags=area", "-pix_fmt", "rgb24",
                                      "-f", "rawvideo", "pipe:1"], timeout=45)
    if len(output) != 640*360*3:
        raise ValueError("unexpected decoded frame length")
    return {"decodedFrameBytes": len(output), "decodedFrameSha256": hashlib.sha256(output).hexdigest()}

def source_url(uid):
    if not UUID.fullmatch(uid):
        raise ValueError("invalid public file UUID")
    return PUBLIC + uid + "/file_downloaded"

def report():
    result = {"scope": "public-input-verification-only", "dataset": "10.17632/8gb9r2yhfc.6",
              "datasetAttribution": "Tomyslav Sledevic, Mendeley Data v6, CC BY 4.0",
              "modelId": "Roboflow/rf-detr-nano", "revision": REVISION, "license": "Apache-2.0",
              "beeClass": False, "trainingAuthorized": False, "realBeeInference": False,
              "cleanupAuthorized": False, "physicalAndroidVerified": False}
    errors = []
    with tempfile.TemporaryDirectory(prefix="paseka-public-pilot-") as directory:
        root = Path(directory)
        try:
            model = root / "model.safetensors"
            result["modelBytes"] = download(MODEL_URL, model, MAX_MODEL, MODEL_SHA)
            result["modelFormat"] = verify_safetensors(model)
        except Exception as exc:
            errors.append({"stage": "model", "error": type(exc).__name__, "detail": str(exc)[:160] if isinstance(exc, ValueError) else None})
        try:
            result["trackingCatalog"] = tracking_catalog()
        except Exception as exc:
            errors.append({"stage": "catalog", "error": type(exc).__name__, "detail": str(exc)[:160] if isinstance(exc, ValueError) else None})
        try:
            video = root / "public-fan.mp4"
            labels = root / "public-fan.txt"
            result["videoBytes"] = download(source_url(VIDEO[0]), video, MAX_VIDEO, VIDEO[2], VIDEO[1])
            result["labelBytes"] = download(source_url(TRACKS[0]), labels, MAX_LABELS, TRACKS[2], TRACKS[1])
            result["reference"] = parse_tracks(labels)
            if result["reference"]["annotatedFrames"] != 6000 or result["reference"]["referenceBoxes"] != 127452:
                raise ValueError("unexpected verified fan reference totals")
            result["decoded"] = decode_first_frame(video)
        except Exception as exc:
            errors.append({"stage": "public-fan", "error": type(exc).__name__, "detail": str(exc)[:160] if isinstance(exc, ValueError) else None})
    result["errors"] = errors
    return result

if __name__ == "__main__":
    data = report()
    print("PUBLIC_BEE_PILOT_REPORT", json.dumps(data, ensure_ascii=False, sort_keys=True, allow_nan=False), flush=True)
    raise SystemExit(1 if data["errors"] else 0)
