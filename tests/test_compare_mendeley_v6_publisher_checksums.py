import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from compare_mendeley_v6_publisher_checksums import FIXTURES, compare, read_csv, repository_comparison


class TestPublisherComparison(unittest.TestCase):
    def setUp(self):
        self.pair = read_csv(FIXTURES / "mendeley-v6-user-16-pairs-pinned.csv")[:1]
        name = self.pair[0]["image_filename"]
        self.history = [r for r in read_csv(FIXTURES / "mendeley-v6-work-replay.csv")
                        if r["image_filename"] == name]
        self.publisher = [r for r in read_csv(FIXTURES / "mendeley-v6-publisher-checksums.csv")
                          if r["filename"] in (name, self.pair[0]["label_filename"])]

    def test_all_real_versioned_files(self):
        report = repository_comparison()
        self.assertEqual(report["files"], 192)
        self.assertEqual(report["pair_counts"], {"both_first_match": 96})
        self.assertEqual(report["digests"], {"first_matches": 192, "observed_matches": 107,
                                             "observed_absent": 13, "observed_differs": 72})
        for key in ("recordingProvenanceVerified", "trainingAuthorized",
                    "recognitionSucceeded", "cleanupAuthorized"):
            self.assertFalse(report[key])

    def test_changed_publisher_digest_is_reported(self):
        self.publisher[0]["sha256"] = "0" * 64
        report = compare(self.pair, self.history, self.publisher)
        self.assertEqual(report["pair_counts"], {"first_conflict": 1})

    def test_missing_duplicate_or_unversioned_file_is_rejected(self):
        invalid = dict(self.publisher[0], version_membership="individual_only")
        for rows in (self.publisher[:1], self.publisher * 2, [invalid, self.publisher[1]]):
            with self.subTest(rows=len(rows)), self.assertRaises(ValueError):
                compare(self.pair, self.history, rows)

    def test_uuid_without_matching_filename_is_rejected(self):
        self.publisher[0]["filename"] = "another.jpg"
        with self.assertRaises(ValueError):
            compare(self.pair, self.history, self.publisher)

    def test_missing_observed_digest_is_not_inferred_from_retry(self):
        self.history[0].update(image_observed_sha256="", label_observed_sha256="",
                               image_retry="True", label_retry="True")
        report = compare(self.pair, self.history, self.publisher)
        self.assertEqual(report["digests"], {"first_matches": 2, "observed_absent": 2})
