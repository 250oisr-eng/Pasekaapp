#!/usr/bin/env python3
"""Offline v6 Mendeley YOLO detection inventory. NEVER creates train/test splits."""
import argparse
import hashlib
import json
import math
import os
import tempfile
from pathlib import Path
from sample_lila_voc_range import image_header_dimensions, SampleRejected

DOI = "10.17632/8gb9r2yhfc.6"
GROUP_COUNTS = {
    "_bee_20230609a": 700, "_bee_20230609b": 1000,
    "_bee_20230609c": 800, "_bee_20230609d": 720,
    "_bee_20230609e": 1140, "_bee_20230711a": 1320,
    "_bee_20230711b": 910, "_bee_20230711c": 610,
}
MAX_IMAGES = 8000
MAX_IMAGE_BYTES = 16 * 1024 * 1024
MAX_LABEL_BYTES = 256 * 1024
MAX_ANNOTATIONS = 500000


class MendeleyRejected(ValueError):
    pass


def require_dir(p, root=None):
    if p.is_symlink() or not p.is_dir():
        raise MendeleyRejected("unsafe_or_missing_directory")
    actual = p.resolve(strict=True)
    if root is not None and not actual.is_relative_to(root):
        raise MendeleyRejected("directory_escape")
    return actual


def require_file(p, root, limit, allow_empty=False):
    if p.is_symlink() or not p.is_file():
        raise MendeleyRejected("missing_or_linked_file")
    actual = p.resolve(strict=True)
    if not actual.is_relative_to(root):
        raise MendeleyRejected("file_path_escape")
    stat = actual.stat()
    if stat.st_nlink != 1 or not (0 <= stat.st_size <= limit if allow_empty else 0 < stat.st_size <= limit):
        raise MendeleyRejected("file_size_or_link_invalid")
    return actual


def parse_yolo_labels(content, width, height):
    if len(content) > MAX_LABEL_BYTES:
        raise MendeleyRejected("annotation_too_large")
    try:
        raw = content.decode("ascii")
    except UnicodeDecodeError as exc:
        raise MendeleyRejected("label_encoding_invalid") from exc
    boxes = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) != 5 or parts[0] != "0":
            raise MendeleyRejected("non_bee_class_or_label_shape")
        try:
            x, y, w, h = (float(v) for v in parts[1:])
        except ValueError as exc:
            raise MendeleyRejected("label_number_invalid") from exc
        if (not all(math.isfinite(v) for v in (x, y, w, h))
            or not (0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1)
            or x - w / 2 < -1e-9 or x + w / 2 > 1 + 1e-9
            or y - h / 2 < -1e-9 or y + h / 2 > 1 + 1e-9):
            raise MendeleyRejected("bbox_out_of_image")
        left = max(0.0, (x - w / 2) * width)
        top = max(0.0, (y - h / 2) * height)
        pw, ph = w * width, h * height
        boxes.append({"category_id": 1, "bbox": [left, top, pw, ph],
                      "area": pw * ph, "iscrowd": 0})
        if len(boxes) > 10000:
            raise MendeleyRejected("frame_annotation_count_excessive")
    return boxes


def build_unassigned(detection_root):
    source = Path(detection_root)
    root = require_dir(source)
    folders = sorted(root.iterdir(), key=lambda x: x.name)
    if not folders or any(p.name not in GROUP_COUNTS for p in folders):
        raise MendeleyRejected("unknown_or_missing_hive_group")
    result = {
        "info": {
            "description": "Mendeley 8gb9r2yhfc v6: LOCAL YOLO detection inventory; NOT TRAINING READY",
            "sourceDoi": DOI,
            "sourceDatasetUrl": "https://data.mendeley.com/datasets/8gb9r2yhfc/6",
            "sourceCreator": "Tomyslav Sledevic",
            "sourceLicense": "CC BY 4.0",
            "sourceLicenseUrl": "https://creativecommons.org/licenses/by/4.0/",
            "modificationNotice": "Original YOLO normalized boxes converted to COCO pixel boxes; source JPG bytes unchanged.",
            "split": "unassigned", "trainingAuthorized": False,
            "sourceVideosVerified": False, "licenseFileRightsAudited": False,
            "completeAgainstPublication": False
        },
        "categories": [{"id": 1, "name": "bee"}], "images": [], "annotations": [],
        "sourceCollectionGroups": []
    }
    seen_hashes = set()
    for folder in folders:
        group_dir = require_dir(folder, root)
        children = {p.name for p in group_dir.iterdir()}
        if children != {"images", "labels"}:
            raise MendeleyRejected("expected_images_labels_directories")
        img_dir = require_dir(group_dir / "images", root)
        label_dir = require_dir(group_dir / "labels", root)
        images = sorted(img_dir.iterdir(), key=lambda p: p.name)
        labels = sorted(label_dir.iterdir(), key=lambda p: p.name)
        if not images or not all(p.suffix.lower() in (".jpg", ".jpeg", ".png") for p in images):
            raise MendeleyRejected("image_files_invalid")
        if not all(p.suffix.lower() == ".txt" for p in labels):
            raise MendeleyRejected("label_files_invalid")
        stems = [p.stem.casefold() for p in images]
        label_stems = [p.stem.casefold() for p in labels]
        if (len(set(stems)) != len(stems) or len(set(label_stems)) != len(label_stems)
            or set(stems) != set(label_stems)):
            raise MendeleyRejected("missing_or_ambiguous_yolo_label")
        mapping = {p.stem.casefold(): p for p in labels}
        if len(result["images"]) + len(images) > MAX_IMAGES:
            raise MendeleyRejected("image_count_excessive")
        result["sourceCollectionGroups"].append({
            "name": folder.name, "observedImages": len(images),
            "publishedExpectedImages": GROUP_COUNTS[folder.name],
            "countMatchesPublication": len(images) == GROUP_COUNTS[folder.name],
            "sourceSessionIdVerified": False
        })
        for image in images:
            img = require_file(image, root, MAX_IMAGE_BYTES)
            label = require_file(mapping[image.stem.casefold()], root, MAX_LABEL_BYTES, allow_empty=True)
            with img.open("rb") as inp:
                header = inp.read(65536)
            try:
                width, height = image_header_dimensions(header, img.name)
            except SampleRejected as exc:
                raise MendeleyRejected("image_header_invalid") from exc
            annotations = parse_yolo_labels(label.read_bytes(), width, height)
            digest = hashlib.sha256()
            with img.open("rb") as inp:
                for chunk in iter(lambda: inp.read(1024 * 1024), b""):
                    digest.update(chunk)
            hexdigest = digest.hexdigest()
            if hexdigest in seen_hashes:
                raise MendeleyRejected("duplicate_image_across_hives")
            seen_hashes.add(hexdigest)
            image_id = len(result["images"]) + 1
            result["images"].append({
                "id": image_id, "file_name": img.relative_to(root).as_posix(),
                "width": width, "height": height, "sha256": hexdigest,
                "hiveCollectionFolder": folder.name,
                "sourceRecordingSha256": None
            })
            for annotation in annotations:
                if len(result["annotations"]) >= MAX_ANNOTATIONS:
                    raise MendeleyRejected("annotations_excessive")
                result["annotations"].append({
                    "id": len(result["annotations"]) + 1,
                    "image_id": image_id, **annotation
                })
    result["info"]["completeAgainstPublication"] = (
        len(result["sourceCollectionGroups"]) == len(GROUP_COUNTS)
        and len(result["images"]) == 7200
        and all(g["countMatchesPublication"] for g in result["sourceCollectionGroups"])
    )
    return result


def publish_unassigned(detection_root, output_json):
    root = require_dir(Path(detection_root))
    target = Path(output_json).absolute()
    parent = require_dir(target.parent)
    if (target == root or target.is_relative_to(root) or
        root.is_relative_to(target) or parent.is_relative_to(root)):
        raise MendeleyRejected("output_overlaps_source")
    if target.exists() or target.is_symlink():
        raise MendeleyRejected("output_exists")
    data = build_unassigned(root)
    fd, tmp = tempfile.mkstemp(prefix=".paseka-mendeley-stage-", suffix=".json", dir=parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            json.dump(data, out, ensure_ascii=False, indent=2, allow_nan=False)
            out.write("\n")
        os.link(tmp, target)
    finally:
        os.unlink(tmp)
    return {"ok": True, "stage": "mendeley_v6_coco_unassigned_only",
            "images": len(data["images"]), "annotations": len(data["annotations"]),
            "completeAgainstPublication": data["info"]["completeAgainstPublication"],
            "trainingAuthorized": False, "recognitionSucceeded": False,
            "cleanupAuthorized": False}


def main(argv=None):
    p = argparse.ArgumentParser(description="Offline Mendeley v6 YOLO detection to UNASSIGNED COCO")
    p.add_argument("detection_root", help="Local detection folder containing eight hive folders")
    p.add_argument("output_json", help="New output JSON outside the dataset tree")
    args = p.parse_args(argv)
    try:
        print(json.dumps(publish_unassigned(args.detection_root, args.output_json)))
        return 0
    except (MendeleyRejected, OSError) as exc:
        print(json.dumps({"ok": False, "reason": str(exc),
                          "trainingAuthorized": False, "cleanupAuthorized": False}),
              file=__import__("sys").stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
