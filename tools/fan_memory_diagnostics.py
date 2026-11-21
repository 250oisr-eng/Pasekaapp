"""Research diagnostics for identity recovery and erroneous cross-identity reuse.

Uses publisher track IDs ONLY during evaluation, never during association.
Results are local transition diagnostics, not standard MOT scores.
"""
from evaluate_mendeley_v6_fan_tracks import match_frame


def memory_diagnostics(reference, prediction, threshold=0.5):
    if len(reference) != len(prediction) or not 0 < threshold <= 1:
        raise ValueError("invalid frame counts or IoU threshold")
    matches = []
    for truth, proposed in zip(reference, prediction):
        pairs = match_frame(truth, proposed, threshold)
        matches.append({truth_id: proposed_id for truth_id, proposed_id, _ in pairs})
    eligible_gaps = recovered = broken = 0
    # Ground-truth identity on both sides, no matched observation of it
    # in the middle. The end-points must themselves be matched.
    for k in range(2, len(matches)):
        previous, middle, current = matches[k - 2:k + 1]
        for reference_id in previous.keys() & current.keys():
            if reference_id not in middle:
                eligible_gaps += 1
                if previous[reference_id] == current[reference_id]:
                    recovered += 1
                else:
                    broken += 1

    # Independently count instances in which a predicted ID maps to
    # different reference IDs across adjacent or one-skipped-frame pairs.
    incorrect_reuses = 0
    compared_predicted_links = 0
    for offset in (1, 2):
        for k in range(offset, len(matches)):
            older = {pred: truth for truth, pred in matches[k-offset].items()}
            newer = {pred: truth for truth, pred in matches[k].items()}
            for predicted_id in older.keys() & newer.keys():
                # For offset=2, count only links with no observation of
                # that predicted track in the middle, avoiding duplication.
                if offset == 2 and predicted_id in matches[k-1].values():
                    continue
                compared_predicted_links += 1
                incorrect_reuses += older[predicted_id] != newer[predicted_id]
    return {"groundTruthOneFrameGapEndpoints": eligible_gaps,
            "recoveredSameIdAfterOneFrameGap": recovered,
            "brokenIdAfterOneFrameGap": broken,
            "comparedPredictedLinksOffsetOneOrTwo": compared_predicted_links,
            "crossReferenceIdentityReuses": incorrect_reuses}


def cross_reference_reuse_events(reference, prediction, threshold=0.5):
    """Identify distinct wrong same-predicted-ID links using reference identities.

    Event keys are (older_frame_index, newer_frame_index, old_truth_id,
    new_truth_id). This ensures equal aggregate totals cannot conceal *new*
    mistaken links. Returned only to the offline benchmark safety gate.
    """
    if len(reference) != len(prediction) or not 0 < threshold <= 1:
        raise ValueError("invalid frame counts or IoU threshold")
    matched = [{prediction_id: truth_id
                for truth_id, prediction_id, _ in match_frame(truth, candidates, threshold)}
               for truth, candidates in zip(reference, prediction)]
    events = set()
    for offset in (1, 2):
        for frame in range(offset, len(matched)):
            previous, current = matched[frame - offset], matched[frame]
            for pid in previous.keys() & current.keys():
                if offset == 2 and pid in matched[frame-1]:
                    continue
                if previous[pid] != current[pid]:
                    events.add((frame - offset, frame, previous[pid], current[pid]))
    return events
