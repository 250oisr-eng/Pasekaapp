import csv
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from audit_mendeley_v6_work_replay import INVALID_JPEG, REPLAY, UNAVAILABLE, summarize


def matched_row():
    row = {"image_filename": "20230609a1002.jpg", "pair_status": "matched"}
    for kind in ("image", "label"):
        row.update({
            kind + "_expected_sha256": "a" * 64,
            kind + "_observed_sha256": "a" * 64,
            kind + "_read": "True",
            kind + "_retry": "",
            kind + "_status": "matched",
        })
    return row


class WorkReplayAuditTests(unittest.TestCase):
    def test_actual_replay(self):
        with REPLAY.open(encoding="utf-8", newline="") as source:
            report = summarize(csv.DictReader(source))
        self.assertEqual(report["pairs"], 96)
        self.assertEqual(report["pairStatus"], {"matched": 47, "mismatch": 48, "unconfirmed": 1})
        self.assertEqual(report["matchedPairsWithBothDigestsStored"], 42)
        self.assertEqual(report["matchedPairsRelyingOnRetryFlag"], 5)
        self.assertEqual(report["jpegDigestConflictsOnUndecodableFirstResponse"], 31)
        self.assertEqual(report["ofThoseJpegsRetryReportedMatch"], 27)
        self.assertEqual(report["jpegConflictsAfterSuccessfulDecode"], 0)
        self.assertEqual(report["labelConflictsWithStoredDigest"], 41)
        self.assertEqual(report["labelConflictsWithRetryFlagOnly"], 7)
        self.assertFalse(any(report[key] for key in (
            "sourceBytesReadByThisAudit", "publisherChecksumVerified",
            "sourceRecordingVerified", "trainingAuthorized", "cleanupAuthorized",
        )))

    def test_reported_retry_match_has_no_observed_retry_digest(self):
        row = dict(matched_row(), label_read=UNAVAILABLE, label_observed_sha256="", label_retry="True")
        self.assertEqual(summarize([row])["matchedPairsRelyingOnRetryFlag"], 1)

    def test_undecodable_conflicting_bytes_survive_successful_retry(self):
        row = dict(matched_row(), image_read=INVALID_JPEG, image_observed_sha256="b" * 64,
                   image_retry="True", image_status="mismatch", pair_status="mismatch")
        report = summarize([row])
        self.assertEqual(report["ofThoseJpegsRetryReportedMatch"], 1)
        self.assertEqual(report["jpegConflictsAfterSuccessfulDecode"], 0)
        self.assertEqual(report["pairStatus"]["mismatch"], 1)

    def test_decoded_jpeg_with_conflicting_hash_counts_separately(self):
        row = dict(matched_row(), image_read="False", image_observed_sha256="b" * 64,
                   image_status="mismatch", pair_status="mismatch")
        report = summarize([row])
        self.assertEqual(report["jpegConflictsAfterSuccessfulDecode"], 1)
        self.assertEqual(report["jpegDigestConflictsOnUndecodableFirstResponse"], 0)

    def test_retry_error_is_unconfirmed(self):
        row = dict(matched_row(), image_read=UNAVAILABLE, image_observed_sha256="",
                   image_retry=INVALID_JPEG, image_status="unconfirmed", pair_status="unconfirmed")
        self.assertEqual(summarize([row])["pairStatus"]["unconfirmed"], 1)

    def test_invalid_or_contradictory_evidence_is_rejected(self):
        for patch in ({"image_observed_sha256": ""}, {"label_observed_sha256": "b" * 64},
                      {"label_observed_sha256": "not-a-digest"}, {"label_retry": INVALID_JPEG},
                      {"label_status": "mismatch"}, {"pair_status": "mismatch"}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                summarize([dict(matched_row(), **patch)])

    def test_empty_and_duplicate_rows_are_rejected(self):
        for rows in ([], [matched_row(), matched_row()]):
            with self.assertRaises(ValueError):
                summarize(rows)
