"""Compare recorded download hashes with the version-six publisher listing, offline."""
import csv
import json
import re
from collections import Counter
from pathlib import Path
from uuid import UUID

from stage_mendeley_v6_public_csv import SHA, URL_PATTERN

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures"


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def canonical_uuid(value):
    return isinstance(value, str) and str(UUID(value)) == value


def compare(pairs, replay, publisher):
    """Require a complete one-to-one join before emitting counts."""
    by_id = {}
    for entry in publisher:
        uid = entry["file_uuid"]
        if (not all(canonical_uuid(entry[k]) for k in ("file_uuid", "content_uuid", "folder_uuid"))
                or uid in by_id or entry["version_membership"] != "listed_v6"
                or not SHA.fullmatch(entry["sha256"]) or not re.fullmatch(r"[1-9][0-9]*", entry["size"])):
            raise ValueError("invalid publisher listing")
        by_id[uid] = entry
    by_name = {row["image_filename"]: row for row in replay}
    if len(by_name) != len(replay):
        raise ValueError("duplicate replay filename")
    pair_totals = Counter()
    counts = Counter()
    used = set()
    for pair in pairs:
        name = pair["image_filename"]
        history = by_name.pop(name, None)
        if history is None:
            raise ValueError("missing replay or duplicate pair")
        both_match = True
        for kind in ("image", "label"):
            url = URL_PATTERN.fullmatch(pair[kind + "_url"])
            if not url or url[1] in used or url[1] not in by_id:
                raise ValueError("missing or repeated file UUID")
            used.add(url[1])
            metadata = by_id[url[1]]
            expected = pair[kind + "_sha256"]
            if (metadata["filename"] != pair[kind + "_filename"] or not SHA.fullmatch(expected)
                    or expected != history[kind + "_expected_sha256"]):
                raise ValueError("file identity or original pin conflict")
            actual = history[kind + "_observed_sha256"]
            if actual and not SHA.fullmatch(actual):
                raise ValueError("malformed observed digest")
            authority = metadata["sha256"]
            first_matches = expected == authority
            both_match = both_match and first_matches
            counts["first_matches" if first_matches else "first_differs"] += 1
            status = "absent" if not actual else "matches" if actual == authority else "differs"
            counts["observed_" + status] += 1
        pair_totals["both_first_match" if both_match else "first_conflict"] += 1
    if not pairs or by_name or used != by_id.keys():
        raise ValueError("incomplete or extraneous inventory")
    return {"files": len(used), "pairs": len(pairs), "digests": dict(counts),
            "pair_counts": dict(pair_totals), "recordingProvenanceVerified": False,
            "trainingAuthorized": False, "recognitionSucceeded": False, "cleanupAuthorized": False}


def repository_comparison():
    files = [FIXTURES / "mendeley-v6-user-16-pairs-pinned.csv",
             *sorted((FIXTURES / "mendeley-v6-work-96").glob("*.csv")),
             FIXTURES / "mendeley-v6-work-rejected.csv"]
    pairs = [row for path in files for row in read_csv(path)]
    return compare(pairs, read_csv(FIXTURES / "mendeley-v6-work-replay.csv"),
                   read_csv(FIXTURES / "mendeley-v6-publisher-checksums.csv"))


if __name__ == "__main__":
    print(json.dumps(repository_comparison(), indent=2))
