"""Synthetic-only contract for complete semantic bee entrance events.

This is NOT a detector, video evaluation, license approval, published label
decoder or validated in/out counter. Never import published D/U/DU/UD labels
without independent source evidence and a separately reviewed adapter.
"""
from collections import Counter

SIDE_PAIRS = {
    "entering": ("outside", "inside"),
    "exiting": ("inside", "outside"),
    "entering-exiting": ("outside", "outside"),
    "exiting-entering": ("inside", "inside"),
    "unknown": ("unknown", "unknown"),
}
FIELDS = frozenset(("event_id", "class_name", "start_side", "end_side"))


def summarize_synthetic_events(events, *, input_origin="synthetic_fixture"):
    """Validate synthetic completed events; summarize *logical* side changes.

    'entering-exiting' and 'exiting-entering' have zero NET side-state
    change, but may contain zero or multiple actual physical crossings.
    Those physical counts cannot be inferred from a label alone.
    """
    if input_origin != "synthetic_fixture":
        raise ValueError("only synthetic fixtures accepted; real benchmark blocked")
    if type(events) not in (list, tuple):
        raise ValueError("expected a finite list/tuple of synthetic event records")
    seen = set()
    counts = Counter()
    for item in events:
        if type(item) is not dict or set(item) != FIELDS:
            raise ValueError("incomplete or extra synthetic event fields")
        eid = item["event_id"]
        label = item["class_name"]
        if (type(eid) is not str or not eid.strip() or len(eid) > 128
                or not eid.isascii() or eid in seen):
            raise ValueError("invalid or repeated synthetic event ID")
        seen.add(eid)
        if type(label) is not str or label not in SIDE_PAIRS:
            raise ValueError("unknown class: never assume published U/D mapping")
        if (item["start_side"], item["end_side"]) != SIDE_PAIRS[label]:
            raise ValueError("class and side endpoints are inconsistent")
        counts[label] += 1
    # The delta is a semantic state change of completed events, NOT a
    # camera-derived count of actual crossing instants or a detector score.
    known_delta = counts["entering"] - counts["exiting"]
    unresolved = counts["unknown"]
    return {
        "syntheticOnly": True,
        "events": len(events),
        "simpleEnteringEvents": counts["entering"],
        "simpleExitingEvents": counts["exiting"],
        "enteringExitingTurns": counts["entering-exiting"],
        "exitingEnteringTurns": counts["exiting-entering"],
        "unresolvedEvents": unresolved,
        "knownSemanticNetDelta": known_delta,
        "totalNetDelta": None if unresolved else known_delta,
        "physicalEntranceCrossings": None,
        "physicalExitCrossings": None,
        "measuredDetectorAccuracy": None,
        "realDatasetBenchmarkAuthorized": False,
        "videoCleanupAuthorized": False,
    }
