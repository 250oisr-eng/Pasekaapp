"""Summarize the recorded observations from the 96-pair Work replay, entirely offline."""
import csv
import json
import re
from collections import Counter
from pathlib import Path


REPLAY = Path(__file__).resolve().parents[1] / "tests/fixtures/mendeley-v6-work-replay.csv"
SHA256 = re.compile(r"[0-9a-f]{64}")
UNAVAILABLE = "public_download_unavailable"
INVALID_JPEG = "original_jpg_full_decode_failed"


def classify_file(row, kind):
    expected = row[kind + "_expected_sha256"]
    observed = row[kind + "_observed_sha256"]
    read = row[kind + "_read"]
    retry = row[kind + "_retry"]
    if not SHA256.fullmatch(expected) or (observed and not SHA256.fullmatch(observed)):
        raise ValueError("malformed digest")
    outcomes = {"True", "False", UNAVAILABLE}
    if kind == "image":
        outcomes.add(INVALID_JPEG)
    if read not in outcomes or retry not in outcomes | {""}:
        raise ValueError("unknown read outcome")
    if (read == UNAVAILABLE) != (observed == ""):
        raise ValueError("first read outcome contradicts recorded digest")
    if read in {"True", "False"} and (read == "True") != (observed == expected):
        raise ValueError("first comparison contradicts recorded digest")

    # The retry stored only a comparison or an error. Never invent a retry digest.
    if observed and observed != expected:
        status, basis = "mismatch", "storedDigest"
    elif retry == "False":
        status, basis = "mismatch", "retryFlagOnly"
    elif read == "True":
        status, basis = "matched", "storedDigest"
    elif retry == "True":
        status, basis = "matched", "retryFlagOnly"
    else:
        status, basis = "unconfirmed", "noSuccessfulComparison"
    if row[kind + "_status"] != status:
        raise ValueError("file status contradicts evidence")
    return status, basis


def summarize(rows):
    pairs = Counter()
    labels = Counter()
    names = set()
    stored_matches = 0
    undecodable_conflicts = 0
    recovered_jpegs = 0
    decoded_conflicts = 0
    for row in rows:
        name = row["image_filename"]
        if not re.fullmatch(r"[0-9a-z]+\.jpg", name) or name in names:
            raise ValueError("invalid or duplicate image filename")
        names.add(name)
        image_status, image_basis = classify_file(row, "image")
        label_status, label_basis = classify_file(row, "label")
        statuses = (image_status, label_status)
        pair = next((s for s in ("mismatch", "unconfirmed") if s in statuses), "matched")
        if row["pair_status"] != pair:
            raise ValueError("pair status contradicts evidence")
        pairs[pair] += 1
        labels[(label_status, label_basis)] += 1
        if pair == "matched" and image_basis == label_basis == "storedDigest":
            stored_matches += 1

        # The original reader computed SHA before JPEG decode on the first
        # attempt, but checked the retry digest only after full pixel decode.
        if (row["image_read"] == INVALID_JPEG
                and row["image_observed_sha256"] != row["image_expected_sha256"]):
            undecodable_conflicts += 1
            if row["image_retry"] == "True":
                recovered_jpegs += 1
        if "False" in (row["image_read"], row["image_retry"]):
            decoded_conflicts += 1
    if not names:
        raise ValueError("empty replay")
    return {
        "pairs": len(names),
        "pairStatus": {s: pairs[s] for s in ("matched", "mismatch", "unconfirmed")},
        "matchedPairsWithBothDigestsStored": stored_matches,
        "matchedPairsRelyingOnRetryFlag": pairs["matched"] - stored_matches,
        "jpegDigestConflictsOnUndecodableFirstResponse": undecodable_conflicts,
        "ofThoseJpegsRetryReportedMatch": recovered_jpegs,
        "jpegConflictsAfterSuccessfulDecode": decoded_conflicts,
        "labelConflictsWithStoredDigest": labels[("mismatch", "storedDigest")],
        "labelConflictsWithRetryFlagOnly": labels[("mismatch", "retryFlagOnly")],
        "sourceBytesReadByThisAudit": False,
        "publisherChecksumVerified": False,
        "sourceRecordingVerified": False,
        "trainingAuthorized": False,
        "cleanupAuthorized": False,
    }


if __name__ == "__main__":
    with REPLAY.open(encoding="utf-8", newline="") as source:
        print(json.dumps(summarize(csv.DictReader(source)), indent=2))
