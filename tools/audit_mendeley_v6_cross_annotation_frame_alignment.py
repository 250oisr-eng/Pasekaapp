"""Read-only cross-annotation alignment audit for original Mendeley v6 fan clip.

Original detection JPEG/YOLO and tracking MP4/TXT have separate publisher pins.
Full-frame gray MAE produces candidates; separately report whether independently
published object boxes agree with those candidate video-frame annotations.

This is NOT frame-to-recording provenance proof, a train/test split, model
training, inference, Android evaluation or permission to remove any videos.
"""
import csv
import hashlib
import json
import math
import re
import tempfile
from pathlib import Path

from PIL import Image, UnidentifiedImageError
import io

from audit_mendeley_v6_fan_tracks import TRACKS
from compare_mendeley_v6_fan_frames import VIDEO, check_source, compare_series
from evaluate_mendeley_v6_fan_tracks import match_frame, read_frames
from run_public_mendeley_v6_fan_baseline import TRACKS_URL, verify_bytes
from stage_mendeley_v6_public_csv import (
    MAX_JPG, MAX_LABEL, MAX_TOTAL, bounded_read, decode_original_jpg,
)

DOI = "10.17632/8gb9r2yhfc.6"
ROOT = Path(__file__).resolve().parents[1]
PUBLISHER = ROOT / "tests/fixtures/mendeley-v6-publisher-checksums.csv"
PREFIX = "20230711a"
SAFE_SOURCE_FILENAME = re.compile(r"20230711a[0-9]+\\.(?:jpg|txt)\\Z")
VIDEO_URL = (
    "https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/"
    "5e49dc33-a4b9-4be7-af18-f51871e6b71c/file_downloaded"
)
BASE = "https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/"


def pinned_series(path=PUBLISHER):
    """Exactly 12 canonical detection JPEG/TXT pairs; no filename guessing."""
    with Path(path).open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != [
            "file_uuid", "filename", "folder_uuid", "content_uuid",
            "size", "sha256", "version_membership",
        ]:
            raise ValueError("untrusted publisher table columns")
        rows = {}
        for item in reader:
            name = item["filename"]
            if not name.startswith(PREFIX) or not name.endswith((".jpg", ".txt")):
                continue
            if (not SAFE_SOURCE_FILENAME.fullmatch(name)
                or item["version_membership"] != "listed_v6" or name in rows):
                raise ValueError("invalid or duplicate publisher entry")
            if len(item["sha256"]) != 64 or any(c not in "0123456789abcdef" for c in item["sha256"]):
                raise ValueError("invalid source digest")
            size = int(item["size"])
            limit = MAX_JPG if name.endswith(".jpg") else MAX_LABEL
            if not 0 < size <= limit:
                raise ValueError("publisher source size outside cap")
            from uuid import UUID
            uuid = item["file_uuid"]
            if str(UUID(uuid)) != uuid:
                raise ValueError("invalid original source UUID")
            rows[name] = {"size": size, "sha": item["sha256"],
                          "url": BASE + uuid + "/file_downloaded"}
    jpgs = sorted(name for name in rows if name.endswith(".jpg"))
    labels = sorted(name for name in rows if name.endswith(".txt"))
    if len(jpgs) != 12 or len(labels) != 12 or {n[:-4] for n in jpgs} != {n[:-4] for n in labels}:
        raise ValueError("publisher fan JPEG/TXT series must contain exactly 12 pairs")
    return [(name, rows[name], rows[name[:-4] + ".txt"]) for name in jpgs]


def read_yolo(data):
    """Unmodified YOLO class-0 source labels -> normalized xyxy boxes."""
    try:
        rows = data.decode("ascii").splitlines()
    except UnicodeError as exc:
        raise ValueError("YOLO labels are not ASCII") from exc
    if not 1 <= len(rows) <= 128:
        raise ValueError("invalid source label row count")
    boxes = {}
    for line_number, line in enumerate(rows, 1):
        cells = line.split()
        if len(cells) != 5 or cells[0] != "0":
            raise ValueError(f"line {line_number}: expected class=0 and five YOLO fields")
        try:
            cx, cy, width, height = map(float, cells[1:])
        except ValueError as exc:
            raise ValueError(f"line {line_number}: invalid numeric label") from exc
        if not all(math.isfinite(v) for v in (cx, cy, width, height)) or width <= 0 or height <= 0:
            raise ValueError("invalid nonfinite or zero-size source box")
        left, top, right, bottom = cx-width/2, cy-height/2, cx+width/2, cy+height/2
        if not 0 <= left < right <= 1 or not 0 <= top < bottom <= 1:
            raise ValueError("source label extends outside frame; do not clip it silently")
        boxes[line_number - 1] = (left, top, right, bottom)
    return boxes


def inspect_publisher_yolo_geometry(source_bytes):
    """Report anomalous original labels without silently clipping or repairing."""
    try:
        return read_yolo(source_bytes), None
    except ValueError as exc:
        return None, str(exc)


def compare_candidate_labels(truth, boxes, candidates, minimum_iou=0.5):
    if not candidates or not isinstance(boxes, dict):
        raise ValueError("missing reference candidates or labels")
    report = []
    for frame_index, mae in candidates:
        if type(frame_index) is not int or not 0 <= frame_index < len(truth):
            raise ValueError("candidate frame index outside source")
        if not math.isfinite(mae) or mae < 0:
            raise ValueError("invalid gray MAE")
        pairs = match_frame(truth[frame_index], boxes, minimum_iou)
        report.append({
            "candidateFrameZeroBased": frame_index,
            "wholeFrameGrayMAE": round(mae, 6),
            "trackingBoxesInCandidate": len(truth[frame_index]),
            "detectionLabelBoxes": len(boxes),
            "matchedSourceAnnotationsIoU50": len(pairs),
            "meanMatchedIoU": round(sum(score for _, _, score in pairs) / len(pairs), 6)
            if pairs else None,
        })
    # Ranking remains purely pixel-based. Do NOT choose the best GT overlap
    # and present it as an independently found temporal match.
    return report



def screen_training_group_overlap(training_groups, test_group="_bee_20230711a"):
    """Prohibit same-published-collection reuse and never infer independence.

    Even disjoint folder names do not prove separate physical source sessions.
    No training action can be authorized solely by this check.
    """
    from prepare_mendeley_v6_yolo_unassigned import GROUP_COUNTS
    if (not isinstance(training_groups, list) or not training_groups
        or any(type(g) is not str or g not in GROUP_COUNTS for g in training_groups)
        or len(training_groups) != len(set(training_groups))
        or test_group not in GROUP_COUNTS):
        raise ValueError("invalid or duplicate source grouping evidence")
    return {
        "referencePublishedCollection": test_group,
        "trainingCollections": training_groups,
        "samePublishedCollectionInTraining": test_group in training_groups,
        "independentPhysicalRecordingVerified": False,
        "trainingAuthorized": False,
        "reason": ("known_same_published_collection" if test_group in training_groups
                   else "disjoint_folder_names_do_not_prove_recording_independence"),
    }

def run_public(fetch=bounded_read):
    specs = pinned_series()
    if len(specs) != 12 or len({name for name, _, _ in specs}) != 12:
        raise ValueError("requires the complete 12-JPEG fan-series manifest")
    with tempfile.TemporaryDirectory(prefix="paseka-v6-annotation-alignment-") as directory:
        root = Path(directory)
        source_video = fetch(VIDEO_URL, VIDEO[1])
        if len(source_video) != VIDEO[1] or hashlib.sha256(source_video).hexdigest() != VIDEO[2]:
            raise ValueError("original video size/SHA-256 mismatch")
        (root / VIDEO[0]).write_bytes(source_video)
        del source_video
        tracks_data = fetch(TRACKS_URL, TRACKS[1])
        track_name = verify_bytes(tracks_data)
        (root / track_name).write_bytes(tracks_data)
        del tracks_data
        truth = read_frames(check_source(root, TRACKS))
        observed = {}
        budget = 0
        for name, jpeg_spec, label_spec in specs:
            original = fetch(jpeg_spec["url"], MAX_JPG)
            label = fetch(label_spec["url"], MAX_LABEL)
            budget += len(original) + len(label)
            if budget > MAX_TOTAL:
                raise ValueError("public JPEG/label aggregate limit exceeded")
            if (len(original) != jpeg_spec["size"] or
                hashlib.sha256(original).hexdigest() != jpeg_spec["sha"] or
                len(label) != label_spec["size"] or
                hashlib.sha256(label).hexdigest() != label_spec["sha"]):
                raise ValueError("publisher-pinned original JPEG/label mismatch")
            decode_original_jpg(original)
            boxes, geometry_error = inspect_publisher_yolo_geometry(label)
            (root / name).write_bytes(original)
            observed[name] = {"boxes": boxes, "sourceLabelGeometryRejectedReason": geometry_error,
                              "verifiedOriginalJpegSha256": jpeg_spec["sha"],
                              "verifiedOriginalYoloSha256": label_spec["sha"]}
        closest_gray_frames = compare_series(root)
        if set(closest_gray_frames) != set(observed):
            raise ValueError("source image candidates do not cover all pairs")
        results = []
        for name in sorted(observed):
            data = observed[name]
            results.append({
                "detectionJpeg": name,
                "verifiedOriginalJpegSha256": data["verifiedOriginalJpegSha256"],
                "verifiedOriginalYoloSha256": data["verifiedOriginalYoloSha256"],
                "sourceLabelGeometryAccepted": data["boxes"] is not None,
                "sourceLabelGeometryRejectedReason": data["sourceLabelGeometryRejectedReason"],
                "candidateFramesByWholeImageBrightness": (compare_candidate_labels(
                    truth, data["boxes"], closest_gray_frames[name])
                    if data["boxes"] is not None else []),
            })
    return {
        "sourceDoi": DOI,
        "originalVideoSha256": VIDEO[2],
        "originalTrackLabelsSha256": TRACKS[2],
        "originalJpegAndLabelPairsChecked": len(results),
        "publisherLabelGeometryRejectedFiles": [x["detectionJpeg"] for x in results
                                                if not x["sourceLabelGeometryAccepted"]],
        "publisherSourceLabelsAllGeometryValid": all(
            x["sourceLabelGeometryAccepted"] for x in results),
        "decodedVideoFrames": len(truth),
        "comparison": results,
        "wholeFrameMAECandidatesAreGroundTruthIndependent": True,
        "annotationOverlapCheckedAfterCandidateSelection": True,
        "sourceRecordingIdentityVerified": False,
        "exactSourceFrameMappingVerified": False,
        "differentSessionIdentityVerified": False,
        "sameSeriesLeakageRisk": True,
        "holdoutIndependentVerified": False,
        "modelTrainingAuthorized": False,
        "beeRecognitionSucceeded": False,
        "videoCleanupAuthorized": False,
    }


if __name__ == "__main__":
    print(json.dumps(run_public(), indent=2, allow_nan=False))
