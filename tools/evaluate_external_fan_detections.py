"""Fail-closed local evaluation of independently supplied detector bounding boxes.

Requires the *actual* SHA-pinned public source video and tracking labels and a
locally supplied model artifact. Matching hashes establish file identity only:
the script CANNOT prove that the submitted boxes were computed by that model.
Never approves model inference or original video deletion.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path

from audit_mendeley_v6_fan_tracks import FRAMES, TRACKS, check_source
from compare_mendeley_v6_fan_frames import VIDEO
from evaluate_mendeley_v6_fan_tracks import evaluate, read_frames
from fan_occlusion_memory import associate_with_memory

MAX_PREDICTION_BYTES = 32 * 1024 * 1024
MAX_PREDICTIONS_PER_FRAME = 128
MAX_MODEL_BYTES = 100 * 1024 * 1024
FIELDS = frozenset(("frame", "detections"))
DETECTION_FIELDS = frozenset(("box", "confidence"))


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def invalid_constant(value):
    raise ValueError("non-finite JSON constant: " + value)


def finite_unit(value):
    return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1


def inspect_predictions(path, frame_count=FRAMES, minimum_confidence=0.5):
    """Read exactly one JSONL row per frame, including empty frame rows.

    Each line: {"frame": 1, "detections": [{"box": [x1,y1,x2,y2],
    "confidence": 0.9}]}. NO ground-truth IDs or scores are accepted.
    """
    if not finite_unit(minimum_confidence):
        raise ValueError("confidence threshold must be finite in [0,1]")
    path = Path(path)
    info = path.lstat()
    if not path.is_file() or path.is_symlink() or not 0 < info.st_size <= MAX_PREDICTION_BYTES:
        raise ValueError("prediction source missing, unsafe, or outside size limit")
    frames = []
    total = 0
    with path.open("rb") as source:
        for frame_index, line in enumerate(source, 1):
            if frame_index > frame_count or not line or len(line) > 65536:
                raise ValueError("prediction frame count or line length invalid")
            try:
                record = json.loads(line.decode("utf-8"), object_pairs_hook=no_duplicate_keys,
                                    parse_constant=invalid_constant)
            except (UnicodeError, json.JSONDecodeError) as exc:
                raise ValueError("malformed prediction JSON") from exc
            if not isinstance(record, dict) or record.keys() != FIELDS:
                raise ValueError("prediction row must contain only frame and detections")
            if type(record["frame"]) is not int or record["frame"] != frame_index:
                raise ValueError("frame IDs must cover every source frame in order, starting at 1")
            observations = record["detections"]
            if not isinstance(observations, list) or len(observations) > MAX_PREDICTIONS_PER_FRAME:
                raise ValueError("invalid detection list or excessive predictions")
            frame = {}
            for index, item in enumerate(observations):
                if not isinstance(item, dict) or item.keys() != DETECTION_FIELDS:
                    raise ValueError("detector result must contain only box and confidence")
                box = item["box"]
                if (not isinstance(box, list) or len(box) != 4
                    or not all(finite_unit(v) for v in box)
                    or not box[0] < box[2] or not box[1] < box[3]
                    or not finite_unit(item["confidence"])):
                    raise ValueError("non-finite or out-of-range box/confidence")
                if item["confidence"] >= minimum_confidence:
                    frame[len(frame)] = tuple(box)
                    total += 1
            frames.append(frame)
    if len(frames) != frame_count:
        raise ValueError("predictions do not cover every source frame")
    return frames, total


def sha256_file(path, expected, max_bytes):
    path = Path(path)
    info = path.lstat()
    if (not path.is_file() or path.is_symlink()
        or not 0 < info.st_size <= max_bytes
        or not isinstance(expected, str) or len(expected) != 64
        or any(c not in "0123456789abcdef" for c in expected)):
        raise ValueError("artifact missing, unsafe, or invalid expected SHA-256")
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != expected or path.stat().st_size != info.st_size:
        raise ValueError("artifact SHA-256 mismatch or size changed")
    return {"sha256": digest, "bytes": info.st_size}


def assess(reference_directory, video_path, model_path, model_sha256, predictions_path,
           minimum_confidence=0.5):
    # Validate both actual publisher files; a filename or manifest claim is
    # not a substitute for verifying original source bytes.
    video = check_source(Path(reference_directory), VIDEO)
    original_path = Path(video_path).resolve(strict=True)
    if video.resolve() != original_path:
        raise ValueError("source video must be the same verified local original")
    model = sha256_file(model_path, model_sha256, MAX_MODEL_BYTES)
    reference = read_frames(check_source(Path(reference_directory), TRACKS))
    predicted, observed = inspect_predictions(predictions_path,
                                              minimum_confidence=minimum_confidence)
    associated = associate_with_memory(predicted, recovery_threshold=0.9)
    measurements = evaluate(reference, associated)
    return {
        "dataset": "Mendeley Data v6 20230711a-fan / original video and track TXT",
        "verifiedVideoSha256": VIDEO[2],
        "verifiedTrackLabelSha256": TRACKS[2],
        "verifiedModelArtifact": model,
        "predictionsAtOrAboveThreshold": observed,
        "confidenceThreshold": minimum_confidence,
        "frameMetrics": measurements,
        "predictionsGeneratedByModelVerified": False,
        "modelLicenseVerified": False,
        "independentTestSplitVerified": False,
        "realDetectorValidated": False,
        "entranceLineCrossingsValidated": False,
        "androidOfflineInferenceVerified": False,
        "videoCleanupAuthorized": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference_directory", type=Path,
                        help="directory containing publisher-pinned original MP4 and track TXT")
    parser.add_argument("video_path", type=Path, help="exact same original MP4 from reference_directory")
    parser.add_argument("model_path", type=Path, help="local model artifact (not executed)")
    parser.add_argument("model_sha256", help="expected hash from independently verified evidence")
    parser.add_argument("predictions_jsonl", type=Path,
                        help="one full-frame row per frame; generated by external process")
    parser.add_argument("--min-confidence", type=float, default=0.5)
    args = parser.parse_args()
    print(json.dumps(assess(args.reference_directory, args.video_path,
                            args.model_path, args.model_sha256, args.predictions_jsonl,
                            minimum_confidence=args.min_confidence),
                     indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
