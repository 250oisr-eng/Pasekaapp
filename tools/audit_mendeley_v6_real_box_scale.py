#!/usr/bin/env python3
"""Measure original v6 bee bbox pixel geometry, without training or model claims.

This is a LABEL-only read of strictly pinned public v6 URLs.  Source JPG pixels
were already separately fully decoded in PR #287; this diagnostic never opens
images or user media.  Square model sizes are analytical letterbox projections,
NOT measured detector outcomes.
"""
import argparse
import hashlib
import json
from collections import Counter, defaultdict

from prepare_mendeley_v6_yolo_unassigned import MendeleyRejected, parse_yolo_labels
from stage_mendeley_v6_public_csv import (
    CSVStageRejected, MAX_LABEL, bounded_read, parse_manifest, read_csv_file,
)

ORIGINAL_WIDTH = 1920
ORIGINAL_HEIGHT = 1080
SQUARE_SIDES = (640, 960, 1280)
MIN_SIDE_MARKS = (4, 8, 16)
DATASET_DOI = "10.17632/8gb9r2yhfc.6"


class GeometryRejected(ValueError):
    pass


def percentile(numbers, percentage):
    if not numbers:
        return None
    ordered = sorted(numbers)
    pos = (len(ordered) - 1) * percentage / 100
    low = int(pos)
    high = min(low + 1, len(ordered) - 1)
    return round(ordered[low] + (ordered[high] - ordered[low]) * (pos - low), 3)


def box_geometry(bboxes):
    """Numeric geometry only; no guesses about biological identity or confidence."""
    return [min(ann["bbox"][2], ann["bbox"][3]) for ann in bboxes]


def size_stats(sides):
    return {
        "count": len(sides),
        "minimumPx": percentile(sides, 0),
        "p10Px": percentile(sides, 10),
        "medianPx": percentile(sides, 50),
        "p90Px": percentile(sides, 90),
        "maximumPx": percentile(sides, 100),
    }


def project_to_square(sides, input_side):
    """Standard unwarped letterbox: scale by min(target/width,target/height)."""
    if input_side not in SQUARE_SIDES:
        raise GeometryRejected("unapproved_diagnostic_resolution")
    scale = min(input_side / ORIGINAL_WIDTH, input_side / ORIGINAL_HEIGHT)
    projected = [side * scale for side in sides]
    return {
        "squareInputPx": input_side,
        "sourceToInputScale": round(scale, 9),
        "projectedImageSizePx": [
            round(ORIGINAL_WIDTH * scale),
            round(ORIGINAL_HEIGHT * scale),
        ],
        "smallestBoxDimension": size_stats(projected),
        # Descriptive image geometry, not claimed detection failures or recall.
        "boxCountWithMinSideBelow": {
            str(threshold): sum(px < threshold for px in projected)
            for threshold in MIN_SIDE_MARKS
        },
    }


def analyze_rows(rows, fetch=bounded_read):
    if not rows or len(rows) > 16:
        raise GeometryRejected("invalid_pinned_sample_count")
    groups = defaultdict(list)
    files = []
    for row in rows:
        expected_image_sha = row.get("image_sha256")
        expected_label_sha = row.get("label_sha256")
        if not expected_image_sha or not expected_label_sha:
            raise GeometryRejected("both_source_hashes_must_be_pinned")
        # Do NOT fetch image again: original JPEG hash and full decoder results
        # are separately proven in exact-SHA PR #287 CI.
        raw = fetch(row["label_url"], MAX_LABEL)
        got = hashlib.sha256(raw).hexdigest()
        if got != expected_label_sha:
            raise GeometryRejected("original_label_sha256_changed")
        boxes = parse_yolo_labels(raw, ORIGINAL_WIDTH, ORIGINAL_HEIGHT)
        groups[row["group"]].extend(box_geometry(boxes))
        files.append({
            "group": row["group"],
            "labelFile": row["label"],
            "labelSha256Verified": True,
            "originalImageSha256PinnedButNotRecheckedHere": expected_image_sha,
            "beeBoundingBoxes": len(boxes),
        })
    source = sorted(side for sides in groups.values() for side in sides)
    if not source:
        raise GeometryRejected("no_bee_boxes_to_measure")
    return {
        "sourceDoi": DATASET_DOI,
        "sourceAuthor": "Tomyslav Sledevic",
        "sourceLicense": "CC BY 4.0",
        "stage": "real_original_yolo_geometry_only",
        "verifiedLabelFiles": len(files),
        "verifiedImageFilesThisRun": 0,
        "imagesPreviouslyVerifiedOnPinnedSha": len(files),
        "originalImageSizePx": [ORIGINAL_WIDTH, ORIGINAL_HEIGHT],
        "beeBoxes": len(source),
        "originalMinBoxDimension": size_stats(source),
        "projectedUnwarpedLetterboxInputs": [
            project_to_square(source, input_side)
            for input_side in SQUARE_SIDES
        ],
        "perPublishedHiveCollection": {
            group: {"images": sum(f["group"] == group for f in files),
                    "beeBoxes": len(groups[group]),
                    "originalMinBoxDimension": size_stats(groups[group])}
            for group in sorted(groups)
        },
        "allInputLabelsPinnedAndVerified": True,
        "sourceVideoSessionIndependenceVerified": False,
        "individualTrackIdentityKnown": False,
        "trainingAuthorized": False,
        "detectorQualityMeasured": False,
        "androidInferenceVerified": False,
        "recognitionSucceeded": False,
        "cleanupAuthorized": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Real Mendeley v6 label-size audit, diagnostics only")
    parser.add_argument("pinned_csv", help="Locally supplied 16-pair original URLs and SHA pins")
    args = parser.parse_args(argv)
    try:
        rows = parse_manifest(read_csv_file(args.pinned_csv))
        print(json.dumps(analyze_rows(rows), indent=2))
        return 0
    except (GeometryRejected, CSVStageRejected, MendeleyRejected, OSError) as exc:
        print(json.dumps({"ok": False, "reason": str(exc),
                          "trainingAuthorized": False, "cleanupAuthorized": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
