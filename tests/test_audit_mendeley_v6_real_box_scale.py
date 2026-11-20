"""Offline synthetic regression for diagnostics; never invokes live Mendeley."""
import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from audit_mendeley_v6_real_box_scale import (
    GeometryRejected, analyze_rows, box_geometry, percentile, project_to_square,
    size_stats,
)
from prepare_mendeley_v6_yolo_unassigned import MendeleyRejected


def fake_row(group, stem, label):
    return {
        "group": group,
        "image": stem + ".jpg", "label": stem + ".txt",
        "image_sha256": "e" * 64,
        "label_sha256": hashlib.sha256(label).hexdigest(),
        "label_url": "https://data.mendeley.com/public-files/fixture/" + stem,
    }


class BBoxScaleTests(unittest.TestCase):
    def test_linear_interpolated_percentiles_are_exact(self):
        self.assertEqual(percentile([8, 16, 24], 0), 8)
        self.assertEqual(percentile([8, 16, 24], 50), 16)
        self.assertEqual(percentile([8, 16, 24], 10), 9.6)
        self.assertEqual(percentile([], 90), None)

    def test_letterbox_projections_not_square_warp(self):
        orig = [12.0, 24.0, 48.0]
        for target, scale, size in (
            (640, 1 / 3, [640, 360]),
            (960, 1 / 2, [960, 540]),
            (1280, 2 / 3, [1280, 720]),
        ):
            p = project_to_square(orig, target)
            self.assertAlmostEqual(p["sourceToInputScale"], scale, places=7)
            self.assertEqual(p["projectedImageSizePx"], size)
        self.assertEqual(project_to_square(orig, 640)["boxCountWithMinSideBelow"],
                         {"4": 0, "8": 1, "16": 2})

    def test_unknown_resolution_not_claimed(self):
        with self.assertRaisesRegex(GeometryRejected, "unapproved_diagnostic_resolution"):
            project_to_square([20.], 320)

    def test_label_only_synthetic_two_groups_and_no_training_flags(self):
        la = b"0 0.5 0.5 0.1 0.04\n0 0.5 0.7 0.2 0.06\n"
        lb = b"0 0.25 0.5 0.03 0.01\n"
        a = fake_row("_bee_20230609a", "20230609a1002", la)
        b = fake_row("_bee_20230711a", "20230711a0", lb)
        calls = []
        lookup = {a["label_url"]: la, b["label_url"]: lb}
        result = analyze_rows([a,b], fetch=lambda url,cap: (
            calls.append((url,cap)) or lookup[url]
        ))
        self.assertEqual(result["verifiedLabelFiles"], 2)
        self.assertEqual(result["verifiedImageFilesThisRun"], 0)
        self.assertEqual(result["imageHashPinsInManifestOnly"], 2)
        self.assertEqual(result["beeBoxes"], 3)
        self.assertEqual(result["perPublishedHiveCollection"]["_bee_20230609a"]["beeBoxes"], 2)
        self.assertEqual(result["perPublishedHiveCollection"]["_bee_20230711a"]["beeBoxes"], 1)
        self.assertEqual(len(calls), 2)
        self.assertFalse(result["detectorQualityMeasured"])
        self.assertFalse(result["sourceVideoSessionIndependenceVerified"])
        self.assertFalse(result["trainingAuthorized"])
        self.assertFalse(result["recognitionSucceeded"])
        self.assertFalse(result["cleanupAuthorized"])

    def test_missing_label_or_image_pin_rejected(self):
        label = b"0 0.5 0.5 0.2 0.2\n"
        for field in ("image_sha256", "label_sha256"):
            row = fake_row("_bee_20230609a", "20230609a1002", label)
            row.pop(field)
            with self.assertRaisesRegex(GeometryRejected, "both_source_hashes_must_be_pinned"):
                analyze_rows([row], fetch=lambda u, cap: label)

    def test_mismatched_real_label_digest_rejected(self):
        original = b"0 0.5 0.5 0.2 0.2\n"
        changed = b"0 0.5 0.5 0.21 0.2\n"
        row = fake_row("_bee_20230609a", "20230609a1002", original)
        with self.assertRaisesRegex(GeometryRejected, "original_label_sha256_changed"):
            analyze_rows([row], fetch=lambda u, cap: changed)

    def test_non_bee_bad_yolo_fails_even_when_hash_matches(self):
        label = b"1 0.5 0.5 0.2 0.2\n"
        row = fake_row("_bee_20230609a", "20230609a1002", label)
        with self.assertRaises(MendeleyRejected):
            analyze_rows([row], fetch=lambda u, cap: label)

    def test_no_boxes_is_not_reported_as_real_detection_quality(self):
        label = b""
        row = fake_row("_bee_20230609a", "20230609a1002", label)
        with self.assertRaisesRegex(GeometryRejected, "no_bee_boxes_to_measure"):
            analyze_rows([row], fetch=lambda u, cap: label)

    def test_rejects_too_many_rows_even_if_valid_pins(self):
        label = b"0 .5 .5 .2 .2\n"
        rows = [fake_row("_bee_20230609a", str(i), label) for i in range(17)]
        with self.assertRaisesRegex(GeometryRejected, "invalid_pinned_sample_count"):
            analyze_rows(rows, fetch=lambda u, cap: label)

    def test_quantiles_and_minimal_bbox_are_pixel_based(self):
        bboxes = [
            {"bbox": [0,0,60,12]}, {"bbox": [10,10,20,60]},
            {"bbox": [3,3,18,18]}, {"bbox": [0,0,5,90]},
        ]
        self.assertEqual(box_geometry(bboxes), [12,20,18,5])
        r = size_stats(box_geometry(bboxes))
        self.assertEqual(r["minimumPx"], 5)
        self.assertEqual(r["medianPx"], 15)
        self.assertEqual(r["maximumPx"], 20)

    def test_no_model_score_misrepresentation_or_runtime_wiring(self):
        report = analyze_rows([
            fake_row("_bee_20230609a","20230609a1002",b"0 .5 .5 .2 .2\n")],
            fetch=lambda u, cap: b"0 .5 .5 .2 .2\n")
        serialized = json.dumps(report)
        self.assertNotIn("precision", serialized)
        self.assertNotIn("recall", serialized)
        self.assertNotIn("accuracy", serialized)
        self.assertNotIn("F1", serialized)
        source = (Path(__file__).resolve().parents[1] /
                  "tools/audit_mendeley_v6_real_box_scale.py").read_text()
        for forbidden in ("deleteVideo", "MediaStore", "IndexedDB", "shutil.rmtree",
                          "torch.load", "weights.pt", "post("):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
