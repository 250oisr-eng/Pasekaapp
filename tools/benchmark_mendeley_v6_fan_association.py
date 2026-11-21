"""Geometry-only adjacent-frame association on the pinned fan-clip boxes."""
import argparse
import json
from pathlib import Path

from evaluate_mendeley_v6_fan_tracks import TRACKS, check_source, evaluate, match_frame, read_frames


def associate(boxes_by_frame, threshold=0.5):
    if not 0 < threshold <= 1:
        raise ValueError("invalid association IoU threshold")
    predictions = []
    previous = {}
    next_id = 1
    for boxes in boxes_by_frame:
        # Canonical geometry order prevents row order from conveying author identity.
        candidates = dict(enumerate(sorted(boxes)))
        assigned = {slot: old_id for old_id, slot, _ in match_frame(previous, candidates, threshold)}
        current = {}
        for slot, box in candidates.items():
            if slot not in assigned:
                assigned[slot] = next_id
                next_id += 1
            current[assigned[slot]] = box
        predictions.append(current)
        previous = current
    return predictions


def benchmark(directory):
    truth = read_frames(check_source(directory, TRACKS))
    predictions = associate(frame.values() for frame in truth)
    scores = evaluate(truth, predictions)
    transitions = scores["adjacentMatchedTransitions"]
    retained = transitions - scores["adjacentIdSwitches"]
    return {"sourceSha256": TRACKS[2], "associationIoU": 0.5, **scores,
            "assignedTrackIds": len({i for frame in predictions for i in frame}),
            "retainedAdjacentTransitions": retained,
            "retainedFraction": retained / transitions if transitions else None}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference_directory", type=Path)
    print(json.dumps(benchmark(parser.parse_args().reference_directory), indent=2, allow_nan=False))
