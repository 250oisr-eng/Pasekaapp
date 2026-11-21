"""Deterministic adjacent-frame IoU association baseline; no learned detector.

The input consists of reference bounding boxes with their IDs discarded.
New IDs are assigned in sorted input order, and a lost track is never revived.
This deliberately exposes ID switches after gaps/occlusions.
"""
import argparse
import json
from pathlib import Path

from audit_mendeley_v6_fan_tracks import TRACKS, check_source
from evaluate_mendeley_v6_fan_tracks import evaluate, match_frame, read_frames


def associate_boxes(frames, threshold=0.5):
    if not 0 < threshold <= 1:
        raise ValueError("threshold must lie in (0, 1]")
    result = []
    active = {}
    next_id = 1
    for frame in frames:
        # Reference IDs are used only for deterministic sorting here; they are
        # not passed to the association algorithm or reused as output IDs.
        boxes = [frame[k] for k in sorted(frame)]
        observations = dict(enumerate(boxes))
        matches = match_frame(active, observations, threshold)
        output = {}
        assigned = set()
        for track_id, observation_index, _ in matches:
            output[track_id] = boxes[observation_index]
            assigned.add(observation_index)
        for index, box in enumerate(boxes):
            if index not in assigned:
                output[next_id] = box
                next_id += 1
        result.append(output)
        active = output
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference_directory", type=Path)
    parser.add_argument("--association-iou", type=float, default=0.5)
    parser.add_argument("--evaluation-iou", type=float, default=0.5)
    args = parser.parse_args()
    reference = read_frames(check_source(args.reference_directory, TRACKS))
    predictions = associate_boxes(reference, args.association_iou)
    metrics = evaluate(reference, predictions, args.evaluation_iou)
    metrics["baseline"] = "adjacent-frame-IoU-only / reference boxes / reference IDs hidden"
    metrics["associationIoU"] = args.association_iou
    print(json.dumps(metrics, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
