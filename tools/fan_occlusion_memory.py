"""Conservative one-frame track memory on geometry-only bounding boxes.

Research-only offline association: no model inference, no entrance counting,
no source-video retention and no permission to delete user recordings.
A dormant ID can be reused only when a unique mutual IoU candidate exists.
"""
from baseline_mendeley_v6_fan_association import associate_boxes
from evaluate_mendeley_v6_fan_tracks import match_frame


def associate_with_memory(frames, threshold=0.5, max_missing=1):
    if not 0 < threshold <= 1:
        raise ValueError("invalid IoU threshold")
    if type(max_missing) is not int or max_missing not in (0, 1):
        raise ValueError("max_missing must be 0 or 1")
    if not max_missing:
        return associate_boxes(frames, threshold)

    output_frames = []
    previous = {}
    dormant = {}
    next_id = 1
    for frame in frames:
        # Input reference identities are deliberately discarded.
        boxes = sorted(frame.values())
        observations = dict(enumerate(boxes))
        current = {}
        assigned = set()

        # Existing visible tracks take priority; only leftover observations
        # may be linked to a track absent from the previous frame.
        for track_id, index, _ in match_frame(previous, observations, threshold):
            current[track_id] = boxes[index]
            assigned.add(index)

        # A track absent in the previous frame is eligible only once.
        remaining = {i: box for i, box in observations.items() if i not in assigned}
        possible = {track_id: (box, [i for i, candidate in remaining.items()
                                     if match_frame({track_id: box}, {i: candidate}, threshold)])
                    for track_id, box in dormant.items()}
        # Ambiguity rejection is strictly symmetric: a dormant track must
        # have one eligible observation, and that observation must have one
        # eligible dormant track. No arbitrary nearest-identity assignment.
        eligible = {tid: candidates[0] for tid, (_, candidates) in possible.items()
                    if len(candidates) == 1}
        counts = {}
        for i in eligible.values():
            counts[i] = counts.get(i, 0) + 1
        for tid in sorted(eligible):
            i = eligible[tid]
            if counts[i] == 1:
                current[tid] = boxes[i]
                assigned.add(i)

        for i, box in observations.items():
            if i not in assigned:
                current[next_id] = box
                next_id += 1

        # Never carry a dormant ID beyond one fully missed frame.
        dormant = {tid: box for tid, box in previous.items() if tid not in current}
        previous = current
        output_frames.append(current)
    return output_frames
