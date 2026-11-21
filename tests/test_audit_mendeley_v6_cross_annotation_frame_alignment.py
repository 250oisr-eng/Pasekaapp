"""Offline negative tests; synthetic coordinates never counted as real v6 evidence."""
import csv
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from audit_mendeley_v6_cross_annotation_frame_alignment import (
    pinned_series, read_yolo, compare_candidate_labels,
    screen_training_group_overlap, run_public,
)


class SourceYoloTests(unittest.TestCase):
    def test_bee_boxes_convert_without_using_tracking_ids(self):
        boxes = read_yolo(b"0 0.500 0.500 0.200 0.300\n0 0.250 0.250 0.100 0.100\n")
        self.assertEqual(boxes[0], (0.4, 0.35, 0.6, 0.65))
        self.assertEqual(len(boxes), 2)

    def test_reject_invalid_source_coordinates_instead_of_clipping(self):
        bad = (b"0 .1 .1 .4 .4\n", b"0 1 .5 .2 .2\n",
               b"0 .5 .5 0 .2\n", b"0 .5 .5 NaN .2\n",
               b"0 .5 .5 inf .2\n", b"0 0.5 0.5 0.2\n",
               b"1 .5 .5 .2 .2\n", b"0 a b .1 .1\n",
               b"", b"0 0.5 0.5 0.2 0.1 extra\n")
        for source in bad:
            with self.subTest(source=source):
                with self.assertRaises(ValueError):
                    read_yolo(source)

    def test_annotation_comparison_preserves_brightness_order(self):
        truth = [{10: (.1,.1,.3,.3)}, {7:(.6,.6,.8,.8)}]
        boxes = {0:(.1,.1,.3,.3)}
        result = compare_candidate_labels(truth, boxes, [(1,0.01),(0,0.02)])
        self.assertEqual([x["candidateFrameZeroBased"] for x in result],[1,0])
        self.assertEqual([x["matchedSourceAnnotationsIoU50"] for x in result],[0,1])
        self.assertEqual([x["trackingBoxesInCandidate"] for x in result],[1,1])

    def test_bad_brightness_candidate_rejected(self):
        with self.assertRaises(ValueError):
            compare_candidate_labels([{}], {}, [(99,0.0)])
        with self.assertRaises(ValueError):
            compare_candidate_labels([{}], {}, [(0,float("nan"))])
        with self.assertRaises(ValueError):
            compare_candidate_labels([{}], {}, [])

    def test_training_overlap_is_blocked_even_if_no_group_overlap(self):
        same = screen_training_group_overlap(["_bee_20230711a"])
        self.assertTrue(same["samePublishedCollectionInTraining"])
        self.assertFalse(same["trainingAuthorized"])
        self.assertEqual(same["reason"],"known_same_published_collection")
        different = screen_training_group_overlap(["_bee_20230609b"])
        self.assertFalse(different["samePublishedCollectionInTraining"])
        self.assertFalse(different["independentPhysicalRecordingVerified"])
        self.assertFalse(different["trainingAuthorized"])

    def test_invalid_train_groups_rejected(self):
        for groups in ([], ["_bee_20230711a","_bee_20230711a"],
                       ["_bee_unknown"], ["_bee_20230711a",None],
                       "_bee_20230711a"):
            with self.subTest(groups=groups):
                with self.assertRaises(ValueError):
                    screen_training_group_overlap(groups)

    def test_publisher_manifest_rejects_missing_pair(self):
        source=pinned_series()
        self.assertEqual(len(source),12)
        self.assertEqual(len({name for name,_,_ in source}),12)
        with tempfile.TemporaryDirectory() as tmp:
            original=Path(__file__).resolve().parents[1]/"tests/fixtures/mendeley-v6-publisher-checksums.csv"
            rows=list(csv.DictReader(original.open(newline="",encoding="utf-8")))
            rows=[row for row in rows if row["filename"]!="20230711a0.txt"]
            p=Path(tmp)/"incomplete.csv"
            with p.open("w",newline="",encoding="utf-8") as out:
                writer=csv.DictWriter(out,fieldnames=rows[0].keys())
                writer.writeheader();writer.writerows(rows)
            with self.assertRaises(ValueError):
                pinned_series(p)

    def test_hash_failure_before_reading_labels_or_decoding_video(self):
        def invalid_mp4(_url, _cap):
            return b"not the actual public Mendeley MP4"
        with patch("audit_mendeley_v6_cross_annotation_frame_alignment.compare_series") as compare:
            with self.assertRaisesRegex(ValueError, "original video size/SHA-256"):
                run_public(fetch=invalid_mp4)
            compare.assert_not_called()

    def test_readonly_source_audit_does_not_enable_training_or_cleanup(self):
        p=Path(__file__).resolve().parents[1]/"tools/audit_mendeley_v6_cross_annotation_frame_alignment.py"
        source=p.read_text(encoding="utf-8")
        for expected in ('"modelTrainingAuthorized": False',
                         '"beeRecognitionSucceeded": False',
                         '"videoCleanupAuthorized": False',
                         '"exactSourceFrameMappingVerified": False'):
            self.assertIn(expected,source)


if __name__=="__main__":
    unittest.main()
