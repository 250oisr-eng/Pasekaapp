"""Evaluate six-column track predictions against the pinned fan-clip labels offline."""
import argparse
import csv
import json
import math
from pathlib import Path

from audit_mendeley_v6_fan_tracks import FRAMES, TRACKS, check_source


def read_frames(path):
    frames = [{} for _ in range(FRAMES)]
    with path.open(encoding="ascii", newline="") as source:
        for line, row in enumerate(csv.reader(source), 1):
            if len(row) != 6:
                raise ValueError(f"line {line}: expected six columns")
            frame, track = map(int, row[:2])
            left, top, width, height = map(float, row[2:])
            if not 1 <= frame <= FRAMES or track < 0 or track in frames[frame - 1]:
                raise ValueError(f"line {line}: invalid frame or duplicate/invalid ID")
            if not (0 <= left < left + width <= 1 and 0 <= top < top + height <= 1):
                raise ValueError(f"line {line}: invalid normalized box")
            frames[frame - 1][track] = (left, top, left + width, top + height)
    return frames


def match_frame(reference, prediction, threshold):
    import numpy as np
    from scipy.optimize import linear_sum_assignment

    if not reference or not prediction:
        return []
    ref_ids, pred_ids = sorted(reference), sorted(prediction)
    ref = np.array([reference[i] for i in ref_ids])[:, None, :]
    pred = np.array([prediction[i] for i in pred_ids])[None, :, :]
    overlap = np.maximum(0, np.minimum(ref[..., 2:], pred[..., 2:])
                         - np.maximum(ref[..., :2], pred[..., :2])).prod(axis=2)
    union = (ref[..., 2:] - ref[..., :2]).prod(axis=2) + (pred[..., 2:] - pred[..., :2]).prod(axis=2) - overlap
    iou = overlap / union
    valid = iou >= threshold
    # One additional eligible match outweighs the total possible IoU advantage.
    weights = np.where(valid, 1 + min(iou.shape) + iou, 0)
    rows, cols = linear_sum_assignment(weights, maximize=True)
    return [(ref_ids[r], pred_ids[c], float(iou[r, c]))
            for r, c in zip(rows, cols) if valid[r, c]]


def evaluate(reference, predictions, threshold=0.5):
    if not 0 < threshold <= 1 or len(reference) != len(predictions):
        raise ValueError("invalid threshold or unequal frame counts")
    matched = missing = extra = switches = transitions = 0
    overlap_sum = 0.0
    previous = {}
    for truth, candidates in zip(reference, predictions):
        pairs = match_frame(truth, candidates, threshold)
        matched += len(pairs)
        missing += len(truth) - len(pairs)
        extra += len(candidates) - len(pairs)
        overlap_sum += math.fsum(score for _, _, score in pairs)
        current = {rid: pid for rid, pid, _ in pairs}
        for rid in previous.keys() & current.keys():
            transitions += 1
            switches += previous[rid] != current[rid]
        previous = current
    return {"frames": len(reference), "iouThreshold": threshold, "matched": matched,
            "missed": missing, "extra": extra, "meanMatchedIoU": overlap_sum / matched if matched else None,
            "adjacentMatchedTransitions": transitions, "adjacentIdSwitches": switches}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference_directory", type=Path)
    parser.add_argument("predictions", type=Path, help="same frame IDs and normalized left/top/width/height")
    parser.add_argument("--iou", type=float, default=0.5)
    args = parser.parse_args()
    truth = read_frames(check_source(args.reference_directory, TRACKS))
    result = evaluate(truth, read_frames(args.predictions), args.iou)
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
