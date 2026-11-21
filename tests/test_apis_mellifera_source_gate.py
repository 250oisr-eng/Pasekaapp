"""Synthetic, nonbiological fixtures: never load third-party/user images."""
import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from audit_apis_mellifera_source_gate import (
    SOURCES, REJECTED, candidate_status, validate_synthetic_session_split, audit,
)


def sha(item):
    return hashlib.sha256(item.encode("ascii")).hexdigest()


def row(name, session, split, source="beehive-mendeley-v1"):
    return {"source_id": source, "observation_id": name,
            "frame_sha256": sha("image-" + name),
            "capture_session_sha256": sha("original-session-" + session),
            "split": split}


def fixture():
    return [row("a1", "sessionA", "train"), row("a2", "sessionA", "train"),
            row("b1", "sessionB", "valid"), row("c1", "sessionC", "test")]


class ApisMelliferaEvidenceGateTests(unittest.TestCase):
    def test_only_explicitly_sourced_apis_mellifera_candidates_exist(self):
        self.assertEqual(set(SOURCES), {"beehive-mendeley-v1", "pollen-beedata-mendeley-v1"})
        for key, src in SOURCES.items():
            self.assertTrue(src["species"].startswith("Apis mellifera"))
            status = candidate_status(key, doi=src["doi"], species=src["species"],
                                      license_name=src["license"])
            self.assertTrue(status["metadataCandidateEligibleForApisMelliferaOnly"])
            self.assertFalse(status["modelTrainingAuthorized"])
            self.assertFalse(status["sourceOriginalImageBytesVerified"])
            self.assertFalse(status["userVideoCleanupAuthorized"])

    def test_other_species_monash_explicitly_blocked(self):
        self.assertIn("Tetragonula carbonaria", REJECTED["monash-native-bee-v1"])
        with self.assertRaisesRegex(ValueError, "blocked"):
            candidate_status("monash-native-bee-v1", doi="10.26180/32315067.v1",
                             species="Tetragonula carbonaria", license_name="CC BY 4.0")

    def test_honeybee_common_name_only_dataset_not_accepted(self):
        with self.assertRaises(ValueError):
            candidate_status("boxes-on-bees-2021", doi="",
                             species="honey bee", license_name="CDLA-Permissive")

    def test_unknown_and_mixed_taxa_rejected(self):
        for sid in ("unknown", "", "bee24", None):
            with self.subTest(sid=sid), self.assertRaises(ValueError):
                candidate_status(sid, doi="", species="Apis mellifera",
                                 license_name="CC BY 4.0")

    def test_publisher_claim_is_not_user_relabelable(self):
        src = SOURCES["pollen-beedata-mendeley-v1"]
        for kwargs in (
            {"doi": "10.17632/madeup.1", "species": src["species"], "license_name": src["license"]},
            {"doi": src["doi"], "species": "Apis cerana", "license_name": src["license"]},
            {"doi": src["doi"], "species": "Apis mellifera", "license_name": src["license"]},
            {"doi": src["doi"], "species": src["species"], "license_name": "CC BY-NC 4.0"},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                candidate_status("pollen-beedata-mendeley-v1", **kwargs)

    def test_split_contract_happy_path_still_not_approved_for_real_benchmark(self):
        status = validate_synthetic_session_split(fixture(), source_id="beehive-mendeley-v1")
        self.assertEqual(status["records"], 4)
        self.assertEqual(status["distinctDeclaredSessions"], 3)
        self.assertTrue(status["noDeclaredSessionShaOverlapAcrossSyntheticSplits"])
        self.assertFalse(status["independenceOfRealTrainValidationTestSessionsEstablished"])
        self.assertFalse(status["modelTrainingAuthorized"])

    def test_cross_split_exact_frame_duplicate_blocks(self):
        rows = fixture()
        rows[-1]["frame_sha256"] = rows[0]["frame_sha256"]
        with self.assertRaisesRegex(ValueError, "same image"):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")

    def test_intrasplit_exact_duplicate_blocks(self):
        rows = fixture()
        rows[1]["frame_sha256"] = rows[0]["frame_sha256"]
        with self.assertRaisesRegex(ValueError, "same image"):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")

    def test_different_image_bytes_same_capture_session_cross_split_blocks(self):
        rows = fixture()
        rows[-1]["capture_session_sha256"] = rows[0]["capture_session_sha256"]
        with self.assertRaisesRegex(ValueError, "session crossed"):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")

    def test_missing_session_provenance_blocks(self):
        rows = fixture()
        rows[1]["capture_session_sha256"] = ""
        with self.assertRaises(ValueError):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")

    def test_invalid_or_noncanonical_sha_blocks(self):
        for value in ("A"*64, "0"*63, "notahash", None, 11):
            rows = fixture()
            rows[2]["frame_sha256"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")

    def test_mixed_source_records_fail(self):
        rows = fixture()
        rows[1]["source_id"] = "pollen-beedata-mendeley-v1"
        with self.assertRaises(ValueError):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")

    def test_unsupported_source_split_fails_even_with_valid_hashes(self):
        with self.assertRaises(ValueError):
            validate_synthetic_session_split(fixture(), source_id="monash-native-bee-v1")

    def test_non_synthetic_input_denied_until_real_byte_adapter(self):
        with self.assertRaisesRegex(ValueError, "real source"):
            validate_synthetic_session_split(fixture(), source_id="beehive-mendeley-v1",
                                             input_origin="published_archive")

    def test_missing_split_not_claimed_independent(self):
        rows = [x for x in fixture() if x["split"] != "test"]
        with self.assertRaises(ValueError):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")

    def test_duplicate_ids_and_nonascii_ids_rejected(self):
        rows = fixture()
        rows[1]["observation_id"] = rows[0]["observation_id"]
        with self.assertRaises(ValueError):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")
        rows = fixture()
        rows[1]["observation_id"] = "🐝"
        with self.assertRaises(ValueError):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")

    def test_unexpected_and_missing_fields_rejected(self):
        rows = fixture()
        rows[0]["license"] = "CC BY 4.0"
        with self.assertRaises(ValueError):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")
        rows = fixture()
        del rows[0]["capture_session_sha256"]
        with self.assertRaises(ValueError):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")

    def test_invalid_split_value_rejected(self):
        rows = fixture()
        rows[0]["split"] = "evaluation"
        with self.assertRaises(ValueError):
            validate_synthetic_session_split(rows, source_id="beehive-mendeley-v1")

    def test_empty_and_malformed_collection_rejected(self):
        for bad in ([], {}, "text", None, [1]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_synthetic_session_split(bad, source_id="beehive-mendeley-v1")

    def test_two_apis_datasets_are_not_merged_implicitly(self):
        rows = fixture()
        for item in rows:
            item["source_id"] = "pollen-beedata-mendeley-v1"
        result = validate_synthetic_session_split(rows, source_id="pollen-beedata-mendeley-v1")
        self.assertEqual(result["source"], "pollen-beedata-mendeley-v1")
        self.assertFalse(result["independentDetectorAccuracyMeasured"])

    def test_audit_is_metadata_only_and_has_no_training_or_cleanup_permission(self):
        result = audit()
        self.assertEqual(result["targetTaxon"], "Apis mellifera")
        self.assertEqual(len(result["candidateSummaries"]), 2)
        self.assertFalse(result["approvedForRealModelTraining"])
        self.assertFalse(result["realEntranceCountingValidated"])
        self.assertFalse(result["userVideoCleanupAuthorized"])


if __name__ == "__main__":
    unittest.main()
