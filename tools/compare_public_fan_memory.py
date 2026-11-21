"""Compare conservative one-frame memory against adjacent IoU on original fan labels.

The single public TXT is bounded, SHA-verified and transient. All bounding
boxes come from published reference labels; this is NOT detector evaluation.
"""
import argparse
import json
import tempfile
from pathlib import Path

from audit_mendeley_v6_fan_tracks import TRACKS
from baseline_mendeley_v6_fan_association import associate_boxes
from evaluate_mendeley_v6_fan_tracks import evaluate, read_frames
from fan_memory_diagnostics import memory_diagnostics
from fan_occlusion_memory import associate_with_memory
from perturb_mendeley_v6_fan_boxes import perturb_frames
from run_public_mendeley_v6_fan_baseline import TRACKS_URL, verify_bytes
from stage_mendeley_v6_public_csv import bounded_read


def compare(fetch=bounded_read, drop_every=0, jitter_pixels=0):
    data = fetch(TRACKS_URL, TRACKS[1])
    name = verify_bytes(data)
    with tempfile.TemporaryDirectory(prefix="paseka-public-fan-memory-") as directory:
        path = Path(directory) / name
        path.write_bytes(data)
        reference = read_frames(path)
        observations = perturb_frames(reference, drop_every=drop_every, jitter_pixels=jitter_pixels)
        without = associate_boxes(observations)
        with_memory = associate_with_memory(observations)

    return {
        "referenceSha256": TRACKS[2],
        "referenceFrames": len(reference),
        "referenceObservations": sum(len(f) for f in reference),
        "syntheticDropEvery": drop_every,
        "syntheticJitterPixels": jitter_pixels,
        "baseline": {"frameMetrics": evaluate(reference, without),
                     "gapDiagnostics": memory_diagnostics(reference, without)},
        "oneFrameMemory": {"frameMetrics": evaluate(reference, with_memory),
                           "gapDiagnostics": memory_diagnostics(reference, with_memory)},
        "realDetectorEvaluated": False,
        "entranceLineCrossingsEvaluated": False,
        "androidOfflineInferenceVerified": False,
        "videoCleanupAuthorized": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--drop-every", type=int, default=0)
    parser.add_argument("--jitter-pixels", type=int, default=0)
    args = parser.parse_args()
    print(json.dumps(compare(drop_every=args.drop_every, jitter_pixels=args.jitter_pixels),
                     indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
