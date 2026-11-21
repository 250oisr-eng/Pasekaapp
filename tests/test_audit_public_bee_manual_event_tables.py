import csv
import hashlib
import io
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from audit_public_bee_manual_event_tables import (
    CAP, COMMIT, FIELDS, ROWS, SOURCE, SHA256_PINS, audit, compare_source_tables,
    fetch_exact_public_source, parse_events_csv, summarize_table,
    verify_git_blob,
)


class BeeManualEventSourceTests(unittest.TestCase):
    @staticmethod
    def fixture():
        records = []
        for group in range(ROWS):
            records.append({
                "group_id": str(group), "event": "D" if group % 2 == 0 else "UD",
                "ambiguousflag": "", "track_id": str(group),
                "filename": "synthetic/track.png",
                "video": "synthetic_recording.cfr.mp4",
                "frame": "12", "datetime": "00:00.5",
                "tagid": "test", "mergethreshold": "5s",
                "eventid": "synthetic_" + str(group),
                "short_interruption": "", "complex": "", "comment": "",
                "error": "", "to_review": "", "labelbee_valid": "",
            })
        return records

    @staticmethod
    def encode(records, headings=None):
        buffer = io.StringIO(newline="")
        fields = list(FIELDS) if headings is None else headings
        writer = csv.DictWriter(buffer, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)
        return buffer.getvalue().encode("utf-8")

    def test_full_synthetic_csv_is_structurally_checked_not_approved(self):
        rows = parse_events_csv(self.encode(self.fixture()))
        summary = summarize_table(rows)
        self.assertEqual(summary["rows"], 1422)
        self.assertEqual(summary["referencedVideoNames"], 1)
        self.assertEqual(summary["eventCodeCounts"], {"D": 711, "UD": 711})

    def test_compare_catches_changed_events_and_independent_event_ids(self):
        a = parse_events_csv(self.encode(self.fixture()))
        changed = self.fixture()
        changed[0]["event"] = "U"
        changed[1]["eventid"] = "updated_event_id"
        changed[2]["video"] = "other_recording.cfr.mp4"
        b = parse_events_csv(self.encode(changed))
        report = compare_source_tables(a, b)
        self.assertEqual(report["eventLabelsChangedByGroupId"], 1)
        self.assertEqual(report["eventIdChangedByGroupId"], 1)
        self.assertEqual(report["videoNameChangedByGroupId"], 1)
        self.assertFalse(report["final1194EventSubsetIdentified"])
        self.assertFalse(report["isOneTableAnAuthoritativelyConfirmedFinalVersion"])

    def test_duplicate_and_missing_group_ids_fail_closed(self):
        for replacement in ("0", "1422", "-1", "01", "not_an_int"):
            rows = self.fixture()
            rows[1]["group_id"] = replacement
            with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                parse_events_csv(self.encode(rows))
        with self.assertRaises(ValueError):
            parse_events_csv(self.encode(self.fixture()[:-1]))

    def test_unknown_events_are_not_silently_reclassified(self):
        for classification in ("enter", "exit", "TRUE", "DX", "??"):
            rows = self.fixture()
            rows[1]["event"] = classification
            with self.subTest(classification=classification), self.assertRaises(ValueError):
                parse_events_csv(self.encode(rows))
        rows = self.fixture()
        rows[1]["event"] = ""
        rows[2]["event"] = "x"
        self.assertEqual(len(parse_events_csv(self.encode(rows))), ROWS)

    def test_invalid_video_ids_and_record_ids_rejected(self):
        for value in ("", "fake.mp4", "a" * 200):
            rows = self.fixture()
            rows[3]["video"] = value
            with self.subTest(video=value), self.assertRaises(ValueError):
                parse_events_csv(self.encode(rows))
        rows = self.fixture()
        rows[3]["eventid"] = ""
        with self.assertRaises(ValueError):
            parse_events_csv(self.encode(rows))

    def test_extra_columns_duplicate_headers_and_bad_encoding_rejected(self):
        original = self.encode(self.fixture())
        header, newline, body = original.partition(b"\n")
        with self.assertRaises(ValueError):
            parse_events_csv(header + b",event" + newline + body)
        with self.assertRaises(ValueError):
            parse_events_csv(header.replace(b"group_id", b"other", 1) + newline + body)
        with self.assertRaises(ValueError):
            parse_events_csv(b"\xff\xff" + original)

    def test_published_git_hash_checks_exact_bytes_not_filename_only(self):
        raw = b"original bytes fixture not actual public CSV"
        gitsha = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
        identity = verify_git_blob(raw, len(raw), gitsha)
        self.assertEqual(identity["sourceSha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(verify_git_blob(raw, len(raw), gitsha, identity["sourceSha256"]), identity)
        with self.assertRaisesRegex(ValueError, "SHA-256 changed"):
            verify_git_blob(raw, len(raw), gitsha, "0"*64)
        for data, size, sha in ((raw+b"x", len(raw), gitsha),
                                (raw, len(raw)+1, gitsha),
                                (raw, len(raw), "0"*40)):
            with self.subTest(size=size), self.assertRaises(ValueError):
                verify_git_blob(data, size, sha)

    def test_cap_and_invalid_data_types_are_rejected(self):
        for invalid in (b"", b"a" * (CAP+1), "a string"):
            with self.subTest(invalid_type=type(invalid).__name__), self.assertRaises(ValueError):
                parse_events_csv(invalid)
        with self.assertRaises(ValueError):
            verify_git_blob(b"x"*(CAP+1), CAP+1, "0"*40)

    def test_unapproved_public_paths_are_refused_without_network(self):
        for name in ("../../secrets", "month_data/other.csv",
                     "https://evil.example.org/bait", ""):
            with self.subTest(name=name), self.assertRaises(ValueError):
                fetch_exact_public_source(name)
        self.assertEqual(COMMIT, "295948bb398054684b7b92c18b7bb44ba37566af")
        self.assertEqual(len(SOURCE), 2)
        self.assertEqual(len(SHA256_PINS), 2)
        self.assertTrue(all(len(s) == 64 for s in SHA256_PINS.values()))

    def test_research_script_never_approves_unverified_license_or_video_deletion(self):
        raw = (Path(__file__).resolve().parents[1] / "tools" /
               "audit_public_bee_manual_event_tables.py").read_text()
        for statement in (
            '"permissionToRedistributeSourceEventsVerified": False',
            '"final1194EventSubsetReproduced": False',
            '"physicalVideoSourceBytesVerified": False',
            '"independentValidationAuthorized": False',
            '"realBeeTrafficAccuracyMeasured": False',
            '"videoCleanupAuthorized": False',
        ):
            self.assertIn(statement, raw)


if __name__ == "__main__":
    unittest.main()
