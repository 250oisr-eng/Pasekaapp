"""Evaluate an ephemeral publisher-pinned public tracking TXT; never touch user video."""
import hashlib
import json
import tempfile
from pathlib import Path

from audit_mendeley_v6_fan_tracks import TRACKS
from baseline_mendeley_v6_fan_association import associate_boxes
from evaluate_mendeley_v6_fan_tracks import evaluate, read_frames
from stage_mendeley_v6_public_csv import bounded_read

TRACKS_URL = (
    "https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/"
    "3291d9bc-bdb3-4bff-94d6-fe24f17ae2a5/file_downloaded"
)


def verify_bytes(data, spec=TRACKS):
    filename, size, expected_sha = spec
    if not isinstance(data, bytes) or len(data) != size:
        raise ValueError("original tracking bytes have wrong size")
    if hashlib.sha256(data).hexdigest() != expected_sha:
        raise ValueError("original tracking SHA-256 mismatch")
    return filename


def run(fetch=bounded_read):
    data = fetch(TRACKS_URL, TRACKS[1])
    filename = verify_bytes(data)
    with tempfile.TemporaryDirectory(prefix="paseka-public-fan-track-") as directory:
        file = Path(directory) / filename
        file.write_bytes(data)
        reference = read_frames(file)
        predictions = associate_boxes(reference)
        metrics = evaluate(reference, predictions)
    return {
        "source": "Mendeley Data v6 / tracking_and_behavior / 20230711a-fan",
        "sourceSha256": TRACKS[2],
        "sourceBytes": TRACKS[1],
        "referenceFrames": len(reference),
        "referenceObservations": sum(len(frame) for frame in reference),
        "trackingBaseline": metrics,
        "realDetectorEvaluated": False,
        "entranceLineCrossingsEvaluated": False,
        "androidOfflineInferenceVerified": False,
        "videoCleanupAuthorized": False,
    }


def main():
    print(json.dumps(run(), indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
