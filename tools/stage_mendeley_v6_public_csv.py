#!/usr/bin/env python3
"""Stage a *small* Mendeley v6 public JPG/YOLO CSV: temporary bytes, unassigned COCO.

Never trains, assigns splits, collects user camera files or deletes private media.
Requires free Pillow for a complete JPEG pixel decode. No auth, paid APIs or bulk ZIP.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

from PIL import Image, UnidentifiedImageError

from prepare_mendeley_v6_yolo_unassigned import (
    GROUP_COUNTS, MendeleyRejected, build_unassigned, publish_unassigned,
)
from verify_mendeley_v6_public_pair import TrustedRedirect, allowed_https

REQUIRED = frozenset(("hive_group", "image_filename", "image_url",
                      "label_filename", "label_url"))
OPTIONAL = frozenset(("image_sha256", "label_sha256"))
URL_PATTERN = re.compile(
    r"https://data\.mendeley\.com/public-files/datasets/8gb9r2yhfc/files/"
    r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/"
    r"file_downloaded\Z"
)
FILENAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
MAX_CSV = 64 * 1024
MAX_PAIRS = 16
MAX_JPG = 8 * 1024 * 1024
MAX_LABEL = 256 * 1024
MAX_TOTAL = 96 * 1024 * 1024
WIDTH, HEIGHT = 1920, 1080


class CSVStageRejected(ValueError):
    pass


def parse_manifest(raw):
    if not 0 < len(raw) <= MAX_CSV:
        raise CSVStageRejected("csv_size_invalid")
    try:
        text = raw.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text, newline=""))
        fields = reader.fieldnames
        if (not fields or len(fields) != len(set(fields))
            or not REQUIRED.issubset(fields)
            or not set(fields).issubset(REQUIRED | OPTIONAL)):
            raise CSVStageRejected("csv_columns_invalid")
        rows = list(reader)
    except (UnicodeDecodeError, csv.Error) as exc:
        raise CSVStageRejected("csv_encoding_or_format_invalid") from exc
    if not 1 <= len(rows) <= MAX_PAIRS:
        raise CSVStageRejected("csv_pair_count_invalid")
    used_keys, used_uuids = set(), set()
    normalized = []
    for item in rows:
        if None in item or not all(isinstance(v, str) for v in item.values()):
            raise CSVStageRejected("csv_extra_columns_or_missing_values")
        group = item["hive_group"]
        img = item["image_filename"]
        label = item["label_filename"]
        if group not in GROUP_COUNTS:
            raise CSVStageRejected("unknown_hive_collection")
        if not img.endswith((".jpg", ".jpeg")) or not label.endswith(".txt"):
            raise CSVStageRejected("only_original_jpeg_plus_yolo_supported")
        stem = img.rsplit(".", 1)[0]
        if not FILENAME.fullmatch(stem) or label != stem + ".txt":
            raise CSVStageRejected("filename_pair_invalid")
        # Original group prefix is a path provenance hint, not an independently
        # verified recording ID.
        if not stem.startswith(group.removeprefix("_bee_")):
            raise CSVStageRejected("hive_prefix_mismatch")
        key = (group, stem.casefold())
        if key in used_keys:
            raise CSVStageRejected("duplicate_pair")
        used_keys.add(key)
        urls = []
        for name in ("image_url", "label_url"):
            value = item[name]
            match = URL_PATTERN.fullmatch(value)
            if not match:
                raise CSVStageRejected("non_public_mendeley_file_url")
            urls.append(value)
            if match.group(1) in used_uuids:
                raise CSVStageRejected("file_url_reused")
            used_uuids.add(match.group(1))
        hashes = {}
        for name in OPTIONAL:
            value = item.get(name, "")
            if value and not SHA.fullmatch(value):
                raise CSVStageRejected("invalid_optional_sha256")
            hashes[name] = value or None
        normalized.append({
            "group": group, "image": img, "label": label,
            "image_url": urls[0], "label_url": urls[1],
            **hashes,
        })
    return normalized


def bounded_read(url, cap, opener=None):
    if not URL_PATTERN.fullmatch(url):
        raise CSVStageRejected("non_public_mendeley_file_url")
    client = opener if opener is not None else build_opener(TrustedRedirect())
    req = Request(url, headers={"User-Agent": "Paseka-v6-licensed-sample/1",
                                "Accept-Encoding": "identity"}, method="GET")
    try:
        with client.open(req, timeout=18) as response:
            if response.status != 200 or not allowed_https(response.geturl()):
                raise CSVStageRejected("invalid_download_origin_or_status")
            encoded = response.headers.get("Content-Encoding", "identity")
            if encoded.lower() not in ("identity", ""):
                raise CSVStageRejected("compressed_http_response_not_accepted")
            raw_len = response.headers.get("Content-Length")
            length = None if raw_len is None else int(raw_len)
            if length is not None and (length <= 0 or length > cap):
                raise CSVStageRejected("declared_download_size_invalid")
            data = response.read(cap + 1)
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise CSVStageRejected("public_download_unavailable") from exc
    except ValueError as exc:
        if isinstance(exc, CSVStageRejected):
            raise
        raise CSVStageRejected("invalid_content_length") from exc
    if not 0 < len(data) <= cap or (length is not None and len(data) != length):
        raise CSVStageRejected("download_size_invalid")
    return data


def decode_original_jpg(data):
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format != "JPEG" or image.size != (WIDTH, HEIGHT):
                raise CSVStageRejected("original_jpg_resolution_or_type_invalid")
            image.load()
    except CSVStageRejected:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise CSVStageRejected("original_jpg_full_decode_failed") from exc


def stage_rows(rows, output_json=None, fetch=bounded_read):
    """Verified, bounded original bytes -> unassigned COCO; no copy kept on runner."""
    with tempfile.TemporaryDirectory(prefix="paseka-mendeley-public-csv-") as tmp:
        root = Path(tmp) / "detection"
        root.mkdir()
        manifest = []
        image_hashes = set()
        used_bytes = 0
        for row in rows:
            img = fetch(row["image_url"], MAX_JPG)
            label = fetch(row["label_url"], MAX_LABEL)
            used_bytes += len(img) + len(label)
            if used_bytes > MAX_TOTAL:
                raise CSVStageRejected("aggregate_download_limit_exceeded")
            image_sha = hashlib.sha256(img).hexdigest()
            label_sha = hashlib.sha256(label).hexdigest()
            if ((row.get("image_sha256") and row["image_sha256"] != image_sha)
                or (row.get("label_sha256") and row["label_sha256"] != label_sha)):
                raise CSVStageRejected("declared_sha256_mismatch")
            if image_sha in image_hashes:
                raise CSVStageRejected("identical_jpg_across_pairs")
            image_hashes.add(image_sha)
            decode_original_jpg(img)
            images = root / row["group"] / "images"
            labels = root / row["group"] / "labels"
            images.mkdir(parents=True, exist_ok=True)
            labels.mkdir(parents=True, exist_ok=True)
            (images / row["image"]).write_bytes(img)
            (labels / row["label"]).write_bytes(label)
            manifest.append({
                "hiveCollectionFolder": row["group"],
                "imageFile": row["image"], "imageSha256": image_sha,
                "labelFile": row["label"], "labelSha256": label_sha,
                "imageBytes": len(img), "labelBytes": len(label),
                "sourceHashesPinnedByManifest":
                    bool(row.get("image_sha256") and row.get("label_sha256")),
            })
        coco = build_unassigned(root)
        # Fail closed even if the existing importer is later changed by mistake.
        if (coco["info"]["split"] != "unassigned"
            or coco["info"]["trainingAuthorized"]
            or coco["info"]["sourceVideosVerified"]
            or len(coco["images"]) != len(rows)):
            raise CSVStageRejected("unsafe_coco_output_state")
        if output_json is not None:
            publish_unassigned(root, output_json)  # atomic, no overwrite
    return {
        "dataset": "10.17632/8gb9r2yhfc.6",
        "mode": "verified_bounded_original_sample_not_training",
        "images": len(coco["images"]),
        "annotations": len(coco["annotations"]),
        "groups": sorted({r["group"] for r in rows}),
        "allOriginalJpegsFullyDecoded": True,
        "sourceVideoSessionIdsVerified": False,
        "independentHoldoutVerified": False,
        "completeDatasetVerified": False,
        "trainingAuthorized": False,
        "recognitionSucceeded": False,
        "cleanupAuthorized": False,
        "files": manifest,
    }


def read_csv_file(path):
    entry = Path(path)
    if entry.is_symlink() or not entry.is_file():
        raise CSVStageRejected("csv_missing_or_symlink")
    stat = entry.stat()
    if stat.st_nlink != 1 or not 0 < stat.st_size <= MAX_CSV:
        raise CSVStageRejected("csv_link_or_size_invalid")
    with entry.open("rb") as reader:
        raw = reader.read(MAX_CSV + 1)
    return raw


def main(argv=None):
    parser = argparse.ArgumentParser(description="Bounded original v6 CSV -> unassigned COCO")
    parser.add_argument("csv_file", help="Local CSV from Work, never login credentials")
    parser.add_argument("--output-coco", default=None,
                        help="New unassigned COCO path; never overwrites existing file")
    args = parser.parse_args(argv)
    try:
        rows = parse_manifest(read_csv_file(args.csv_file))
        print(json.dumps(stage_rows(rows, args.output_coco), indent=2))
        return 0
    except (CSVStageRejected, MendeleyRejected, OSError) as exc:
        print(json.dumps({"ok": False, "reason": str(exc),
                          "trainingAuthorized": False, "cleanupAuthorized": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
