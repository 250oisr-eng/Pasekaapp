from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from evaluate_public_fan_motion_baseline import (
    FRAME_HEIGHT, FRAME_WIDTH, motion_boxes, predict_video, run_public,
)


class RealPixelMotionBaselineTests(unittest.TestCase):
    def black(self):
        return np.zeros((FRAME_HEIGHT, FRAME_WIDTH), dtype=np.uint8)

    def test_moving_patch_yields_pixel_based_box(self):
        old = self.black()
        new = self.black()
        new[30:35, 60:65] = 200
        boxes, capped = motion_boxes(old, new)
        self.assertFalse(capped)
        self.assertEqual(boxes, [(60 / 320, 30 / 180, 65 / 320, 35 / 180)])
        self.assertEqual(np.count_nonzero(old), 0)

    def test_stationary_scene_cannot_identify_bees(self):
        frame = self.black()
        frame[30:35, 60:65] = 200
        self.assertEqual(motion_boxes(frame, frame), ([], False))

    def test_below_threshold_and_below_area_are_ignored(self):
        old = self.black()
        new = self.black()
        new[10, 10] = 10
        self.assertEqual(motion_boxes(old, new), ([], False))
        new[10, 10] = 200
        self.assertEqual(motion_boxes(old, new), ([], False))

    def test_motion_has_no_bee_identity_or_reference_ids(self):
        old = self.black()
        new = self.black()
        new[10:14, 20:24] = 200
        with patch("evaluate_public_fan_motion_baseline.decoded_gray_frames",
                   return_value=iter((old, new))):
            with self.assertRaisesRegex(ValueError, "incomplete"):
                predict_video(Path("not-a-real-video"))
        boxes, _ = motion_boxes(old, new)
        self.assertEqual(len(boxes), 1)

    def test_mismatched_grayscale_frame_geometry_fails_closed(self):
        good = self.black()
        for invalid in (good[:30], good.astype(np.float64)):
            with self.assertRaises(ValueError):
                motion_boxes(good, invalid)
        for kwargs in ({"pixel_difference": 0}, {"pixel_difference": 256},
                       {"pixel_difference": float("nan")}, {"min_area": 0},
                       {"max_area": 1, "min_area": 2}):
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValueError):
                    motion_boxes(good, good, **kwargs)

    def test_preprocessing_is_non_destructive(self):
        a, b = self.black(), self.black()
        b[20:25, 20:25] = 155
        previous = a.copy(), b.copy()
        motion_boxes(a, b)
        self.assertTrue(np.array_equal(a, previous[0]))
        self.assertTrue(np.array_equal(b, previous[1]))

    def test_wrong_original_video_fails_before_any_decoding(self):
        def wrong_fetch(url, cap):
            return b"fabricated"  # must never reach decoder
        with patch("evaluate_public_fan_motion_baseline.predict_video") as decode:
            with self.assertRaisesRegex(ValueError, "MP4 size/hash"):
                run_public(fetch=wrong_fetch)
            decode.assert_not_called()

    def test_evidence_flags_cannot_claim_bee_recognition_or_cleanup(self):
        source = (Path(__file__).resolve().parents[1] / "tools" /
                  "evaluate_public_fan_motion_baseline.py").read_text()
        for expected in ('"isMotionOnly": True',
                         '"realBeeNeuralDetectorEvaluated": False',
                         '"beeRecognitionSucceeded": False',
                         '"realAndroidInferenceVerified": False',
                         '"entranceCrossingsValidated": False',
                         '"videoCleanupAuthorized": False'):
            self.assertIn(expected, source)


if __name__ == "__main__":
    unittest.main()
