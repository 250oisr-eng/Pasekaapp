"""All inputs synthetic; no paid APIs, no Mendeley calls, no user videos."""
import hashlib
import io
import json
import sys
import unittest
from pathlib import Path

from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from prepare_mendeley_v6_yolo_unassigned import GROUP_COUNTS
from audit_mendeley_v6_original_scene_similarity import (
    SceneAuditRejected, hamming64, image_dhash,
    inspect_original_images, require_original_eight_group_sample,
)


class OriginalSceneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = []
        cls.payloads = {}
        for gidx, group in enumerate(GROUP_COUNTS):
            for x in range(2):
                stem = group.removeprefix("_bee_") + str(1002 + x)
                image = Image.new("RGB", (1920, 1080),
                                  (30 + 18 * gidx, 60 + 8 * x, 84))
                draw = ImageDraw.Draw(image)
                draw.rectangle((50 + 15 * gidx + x, 140, 180 + x, 240),
                               fill=(230, 80 + 10 * gidx, 60))
                data = io.BytesIO()
                image.save(data, format="JPEG", quality=80)
                payload = data.getvalue()
                url = "https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/" + f"{gidx * 2 + x:032x}"
                cls.payloads[url] = payload
                cls.rows.append({
                    "group": group, "image": stem + ".jpg",
                    "image_url": url, "label": stem + ".txt",
                    "image_sha256": hashlib.sha256(payload).hexdigest(),
                    "label_sha256": "a" * 64,
                })
        assert len(set(cls.payloads.values())) == 16

    def call(self, rows=None, payloads=None):
        p = self.payloads if payloads is None else payloads
        return inspect_original_images(self.rows if rows is None else rows,
                                       fetch=lambda url, cap: p[url])

    def test_synthetic_all_eight_groups_counts_are_not_identity(self):
        result = self.call()
        self.assertEqual(result["originalFiles"], 16)
        self.assertEqual(result["dHashPairCountWithinCollection"], 8)
        self.assertEqual(result["dHashPairCountAcrossCollections"], 112)
        self.assertEqual(len(result["withinCollectionDistances"]), 8)
        self.assertEqual(len(result["closestCrossCollectionPairs"]), 12)
        self.assertFalse(result["sameRecordingAcrossGroupsProven"])
        self.assertFalse(result["differentRecordingAcrossGroupsProven"])
        self.assertFalse(result["frameToRecordingProvenanceVerified"])
        self.assertFalse(result["independentHoldoutVerified"])
        self.assertFalse(result["trainingAuthorized"])
        self.assertFalse(result["cleanupAuthorized"])

    def test_bitwise_hamming_distance(self):
        self.assertEqual(hamming64(0,0),0)
        self.assertEqual(hamming64(0,15),4)
        self.assertEqual(hamming64(0,(1<<64)-1),64)

    def test_bad_hash_width_or_type_fails(self):
        for arg in (-1,1<<64,"ffff",True + (1<<64)):
            with self.assertRaises(SceneAuditRejected):
                hamming64(arg,0)

    def test_source_pin_mismatch_refused(self):
        rows = [dict(x) for x in self.rows]
        rows[0]["image_sha256"] = "0"*64
        with self.assertRaisesRegex(SceneAuditRejected,"original_jpeg_sha256_changed"):
            self.call(rows=rows)

    def test_unpinned_input_refused(self):
        rows = [dict(x) for x in self.rows]
        rows[0]["image_sha256"] = None
        with self.assertRaisesRegex(SceneAuditRejected,"missing_source_pins"):
            self.call(rows=rows)

    def test_only_one_group_refused(self):
        with self.assertRaisesRegex(SceneAuditRejected,"requires_16_pairs_two_from_each_published_group"):
            self.call(rows=self.rows[:2])

    def test_duplicate_sha_even_with_matching_pins_refused(self):
        rows = [dict(x) for x in self.rows]
        rows[1]["image_sha256"] = rows[0]["image_sha256"]
        payloads = dict(self.payloads)
        payloads[rows[1]["image_url"]] = payloads[rows[0]["image_url"]]
        with self.assertRaisesRegex(SceneAuditRejected,"identical_jpeg_in_source_sample"):
            self.call(rows=rows, payloads=payloads)

    def test_truncated_jpeg_refused_even_when_sha_is_pinned(self):
        rows = [dict(x) for x in self.rows]
        corrupted = b"\xff\xd8this-is-not-a-full-jpeg"
        rows[0]["image_sha256"] = hashlib.sha256(corrupted).hexdigest()
        payloads = dict(self.payloads)
        payloads[rows[0]["image_url"]] = corrupted
        with self.assertRaisesRegex(SceneAuditRejected,"source_jpeg_full_decode_failed"):
            self.call(rows=rows, payloads=payloads)

    def test_wrong_jpeg_resolution_refused(self):
        b = io.BytesIO()
        Image.new("RGB",(100,100)).save(b,format="JPEG")
        payload = b.getvalue()
        rows = [dict(x) for x in self.rows]
        rows[0]["image_sha256"] = hashlib.sha256(payload).hexdigest()
        p = dict(self.payloads)
        p[rows[0]["image_url"]] = payload
        with self.assertRaisesRegex(SceneAuditRejected,"source_jpeg_wrong_format_or_size"):
            self.call(rows=rows,payloads=p)

    def test_dhash_candidate_does_not_mean_recording_proven(self):
        # Two different files can share a dHash; it is not video provenance.
        base = self.payloads[self.rows[0]["image_url"]]
        self.assertEqual(image_dhash(base),image_dhash(base))
        result = self.call()
        self.assertFalse(result["heuristicDistanceThresholdIsValidated"])
        self.assertFalse(result["sourceRecordingIdentityVerified"])

    def test_not_a_detector_model_or_runtime(self):
        report = self.call()
        out = json.dumps(report)
        for forbidden in ("precision", "recall", "accuracy", "trainedModel"):
            self.assertNotIn(forbidden, out)
        source = (Path(__file__).resolve().parents[1] /
                  "tools/audit_mendeley_v6_original_scene_similarity.py").read_text()
        for forbidden in ("MediaStore", "IndexedDB", "shutil.rmtree", "weights.pt", "deleteVideo"):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
