import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from benchmark_mendeley_v6_fan_association import associate

A = (0., 0., .3, .3)
B = (.6, .6, .9, .9)


class FanAssociationTests(unittest.TestCase):
    def test_reordered_boxes_preserve_identity(self):
        shifted = (.01, .01, .31, .31)
        self.assertEqual(associate([[B, A], [B, shifted]]),
                         [{1: A, 2: B}, {1: shifted, 2: B}])

    def test_unmatched_and_interrupted_tracks_receive_fresh_ids(self):
        self.assertEqual(associate([[A], [B], [], [B]]), [{1: A}, {2: B}, {}, {3: B}])

    def test_two_identical_boxes_remain_two_detections(self):
        self.assertEqual(associate([[A, A], [A]]), [{1: A, 2: A}, {1: A}])

    def test_threshold_is_required_to_be_positive_and_finite(self):
        for value in (0, float("nan"), 1.1):
            with self.assertRaises(ValueError):
                associate([], value)
