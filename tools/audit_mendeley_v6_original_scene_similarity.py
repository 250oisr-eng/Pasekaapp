#!/usr/bin/env python3
"""Research-only source-JPEG similarity screen, *not* proof of video independence.

At most 16 original Mendeley v6 JPEGs, pinned public URLs, no user media. Does
not train models or choose train/val/test. A small dHash distance is only a
heuristic candidate for a repeated camera scene, not same recording identity.
"""
import argparse
import hashlib
import io
import json
from collections import Counter
from itertools import combinations

from PIL import Image, UnidentifiedImageError

from prepare_mendeley_v6_yolo_unassigned import GROUP_COUNTS
from stage_mendeley_v6_public_csv import (
    CSVStageRejected, MAX_JPG, MAX_TOTAL, bounded_read, parse_manifest,
    read_csv_file,
)

SIZE = (1920, 1080)
D_HASH_GRID = (9, 8)
# Diagnostic only, no universal perceptual duplicate threshold.
NEAR_SCENE_HEURISTIC_DISTANCE = 6
TOP_PAIR_LIMIT = 12


class SceneAuditRejected(ValueError):
    pass


def require_original_eight_group_sample(rows):
    if len(rows) != 16 or Counter(row["group"] for row in rows) != {
        group: 2 for group in GROUP_COUNTS
    }:
        raise SceneAuditRejected("requires_16_pairs_two_from_each_published_group")
    if not all(row.get("image_sha256") and row.get("label_sha256") for row in rows):
        raise SceneAuditRejected("missing_source_pins")


def image_dhash(jpeg):
    """Return 64-bit grayscale edge fingerprint from verified complete JPEG."""
    try:
        with Image.open(io.BytesIO(jpeg)) as image:
            if image.format != "JPEG" or image.size != SIZE:
                raise SceneAuditRejected("source_jpeg_wrong_format_or_size")
            image.load()  # Full pixel decode; invalid/truncated JPEG is rejected.
            pixels = list(image.convert("L").resize(D_HASH_GRID, Image.Resampling.LANCZOS).getdata())
    except SceneAuditRejected:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise SceneAuditRejected("source_jpeg_full_decode_failed") from exc
    fingerprint = 0
    for y in range(8):
        for x in range(8):
            fingerprint = (fingerprint << 1) | int(pixels[y * 9 + x] > pixels[y * 9 + x + 1])
    return fingerprint


def hamming64(first, second):
    if not all(isinstance(x, int) and 0 <= x <= (1 << 64) - 1 for x in (first, second)):
        raise SceneAuditRejected("hash_not_64_bit_uint")
    return (first ^ second).bit_count()


def inspect_original_images(rows, fetch=bounded_read):
    require_original_eight_group_sample(rows)
    observed = []
    digests = set()
    total = 0
    for row in rows:
        jpeg = fetch(row["image_url"], MAX_JPG)
        total += len(jpeg)
        if total > MAX_TOTAL:
            raise SceneAuditRejected("source_bytes_over_limit")
        digest = hashlib.sha256(jpeg).hexdigest()
        if digest != row["image_sha256"]:
            raise SceneAuditRejected("original_jpeg_sha256_changed")
        if digest in digests:
            raise SceneAuditRejected("identical_jpeg_in_source_sample")
        digests.add(digest)
        phash = image_dhash(jpeg)
        observed.append({
            "group": row["group"],
            "filename": row["image"],
            "imageSha256Verified": True,
            "_dhash": phash,
        })
    same_group = []
    cross_group = []
    for left, right in combinations(observed, 2):
        score = hamming64(left["_dhash"], right["_dhash"])
        item = {
            "a": left["group"] + "/" + left["filename"],
            "b": right["group"] + "/" + right["filename"],
            "dHash64Distance": score,
        }
        (same_group if left["group"] == right["group"] else cross_group).append(item)
    by_distance = lambda x: (x["dHash64Distance"], x["a"], x["b"])
    same_group.sort(key=by_distance)
    cross_group.sort(key=by_distance)
    return {
        "sourceDoi": "10.17632/8gb9r2yhfc.6",
        "stage": "bounded_original_jpeg_visual_similarity_diagnostic",
        "originalJpegSize": list(SIZE),
        "originalFiles": len(observed),
        "sourceImageSha256PinsVerified": True,
        "sourceJpegFullDecodeVerified": True,
        "originalJpegShaUnique": True,
        "publishedGroupCounts": dict(sorted(Counter(x["group"] for x in observed).items())),
        "dHashAlgorithm": "grayscale_9x8_LANCZOS_horizontal_dHash64",
        "dHashPairCountWithinCollection": len(same_group),
        "dHashPairCountAcrossCollections": len(cross_group),
        "withinCollectionDistances": same_group,
        "closestCrossCollectionPairs": cross_group[:TOP_PAIR_LIMIT],
        "crossCollectionDHashAtMost6Count": sum(
            x["dHash64Distance"] <= NEAR_SCENE_HEURISTIC_DISTANCE
            for x in cross_group
        ),
        "heuristicDistanceThresholdIsValidated": False,
        "sourceRecordingIdentityVerified": False,
        "sameRecordingAcrossGroupsProven": False,
        "differentRecordingAcrossGroupsProven": False,
        "frameToRecordingProvenanceVerified": False,
        "independentHoldoutVerified": False,
        "trainingAuthorized": False,
        "modelQualityMeasured": False,
        "recognitionSucceeded": False,
        "cleanupAuthorized": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Bounded original v6 JPEG scene dHash diagnostic")
    parser.add_argument("pinned_csv", help="Real v6 sample CSV with original image/label SHA pins")
    args = parser.parse_args(argv)
    try:
        rows = parse_manifest(read_csv_file(args.pinned_csv))
        print(json.dumps(inspect_original_images(rows), ensure_ascii=False, indent=2))
        return 0
    except (CSVStageRejected, SceneAuditRejected, OSError) as exc:
        print(json.dumps({
            "ok": False, "reason": str(exc),
            "trainingAuthorized": False, "cleanupAuthorized": False,
        }))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
