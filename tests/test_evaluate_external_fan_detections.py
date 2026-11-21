import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from evaluate_external_fan_detections import (
    assess, inspect_predictions, sha256_file,
)

BOX = [.1, .2, .3, .4]


class ExternalPredictionsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.input = self.root / "predictions.jsonl"

    def write(self, records):
        self.input.write_text("".join(json.dumps(r) + "\n" for r in records), encoding="utf-8")
        return self.input

    def good(self):
        return [{"frame": 1, "detections": [{"box": BOX, "confidence": 0.93}]},
                {"frame": 2, "detections": []}]

    def test_two_complete_frames_are_accepted_without_identity_claims(self):
        frames, count = inspect_predictions(self.write(self.good()), frame_count=2)
        self.assertEqual(count, 1)
        self.assertEqual(frames[0][0], tuple(BOX))
        self.assertEqual(frames[1], {})

    def test_missing_or_duplicate_frame_fails_closed(self):
        for records in (self.good()[:1], self.good() * 2,
                        [self.good()[0], self.good()[0]],
                        [{"frame": 0, "detections": []}, self.good()[1]],
                        [{"frame": 2, "detections": []}, {"frame": 1, "detections": []}]):
            with self.subTest(rows=len(records)):
                with self.assertRaises(ValueError):
                    inspect_predictions(self.write(records), frame_count=2)

    def test_forbid_ground_truth_ids_and_extra_metrics(self):
        for altered in ({"id": 10}, {"track_id": 4}, {"class": "bee"},
                        {"modelValidated": True}, {"groundTruth": []}):
            with self.subTest(altered=altered):
                records = self.good()
                records[0]["detections"][0].update(altered)
                with self.assertRaises(ValueError):
                    inspect_predictions(self.write(records), frame_count=2)

    def test_forbid_extra_top_level_source_claims(self):
        r = self.good()
        r[0]["sourceVideoSha256"] = "fake"
        with self.assertRaises(ValueError):
            inspect_predictions(self.write(r), frame_count=2)

    def test_reject_nan_inf_negative_and_inverted_geometry(self):
        bad_cases = [
            {"box": [.1, .2, .1, .4], "confidence": .8},
            {"box": [.8, .2, .3, .4], "confidence": .8},
            {"box": [.1, .2, 1.01, .4], "confidence": .8},
            {"box": [.1, .2, .3, .4], "confidence": -0.1},
            {"box": [.1, .2, .3, .4], "confidence": float("nan")},
            {"box": [float("inf"), .2, .3, .4], "confidence": .8},
            {"box": [.1, .2, .3, .4], "confidence": True},
        ]
        for detection in bad_cases:
            records = self.good()
            records[0]["detections"] = [detection]
            with self.subTest(detection=detection):
                with self.assertRaises(ValueError):
                    inspect_predictions(self.write(records), frame_count=2)

    def test_duplicate_json_keys_and_non_finite_constant_rejected(self):
        self.input.write_text('{"frame":1,"frame":1,"detections":[]}\n'
                              '{"frame":2,"detections":[]}\n')
        with self.assertRaisesRegex(ValueError, "duplicate"):
            inspect_predictions(self.input, frame_count=2)
        self.input.write_text('{"frame":1,"detections":[{"box":[0,0,1,1],"confidence":NaN}]}\n'
                              '{"frame":2,"detections":[]}\n')
        with self.assertRaises(ValueError):
            inspect_predictions(self.input, frame_count=2)

    def test_limits_and_file_type_rejected(self):
        records = self.good()
        records[0]["detections"] = [{"box": BOX, "confidence": 1}] * 129
        with self.assertRaises(ValueError):
            inspect_predictions(self.write(records), frame_count=2)
        self.input.unlink(missing_ok=True)
        self.input.symlink_to(self.root / "elsewhere")
        with self.assertRaises(ValueError):
            inspect_predictions(self.input, frame_count=2)

    def test_model_sha_is_verified_from_bytes(self):
        model = self.root / "model.bin"
        model.write_bytes(b"synthetic model marker only")
        digest = hashlib.sha256(model.read_bytes()).hexdigest()
        self.assertEqual(sha256_file(model, digest, 1024)["sha256"], digest)
        for wrong in ("0" * 64, "not-a-hash", digest.upper()):
            with self.subTest(wrong=wrong):
                with self.assertRaises(ValueError):
                    sha256_file(model, wrong, 1024)
        with self.assertRaises(ValueError):
            sha256_file(model, digest, 2)

    def test_assess_fails_before_reading_model_when_video_identity_mismatch(self):
        model = self.root / "model.bin"
        model.write_bytes(b"model")
        self.write(self.good())
        with patch("evaluate_external_fan_detections.check_source",
                   return_value=self.root / "different.mp4"):
            with patch("evaluate_external_fan_detections.sha256_file") as verify_model:
                with self.assertRaises(ValueError):
                    assess(self.root, self.root / "wrong.mp4", model,
                           hashlib.sha256(b"model").hexdigest(), self.input)
                verify_model.assert_not_called()

    def test_no_unverified_model_success_claims_in_script(self):
        raw = (Path(__file__).resolve().parents[1] / "tools" /
               "evaluate_external_fan_detections.py").read_text()
        for text in ('"realDetectorValidated": False',
                     '"predictionsGeneratedByModelVerified": False',
                     '"androidOfflineInferenceVerified": False',
                     '"videoCleanupAuthorized": False'):
            self.assertIn(text, raw)


if __name__ == "__main__":
    unittest.main()
