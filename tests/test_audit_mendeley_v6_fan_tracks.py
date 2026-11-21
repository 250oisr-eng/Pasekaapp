import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from audit_mendeley_v6_fan_tracks import in_zone, summarize, vertices

ZONE_TEXT = "polygon = np.array([[100, 220], [1860, 270], [1805, 590], [145, 545]])"


class FanTrackTests(unittest.TestCase):
    def test_zone_is_data_and_boundary_is_inclusive(self):
        zone = vertices(ZONE_TEXT)
        edges = list(zip(zone, zone[1:] + zone[:1]))
        self.assertTrue(in_zone(100, 220, edges))
        self.assertFalse(in_zone(100, 219, edges))
        with self.assertRaises(ValueError):
            vertices("import os")

    def test_counts_gaps_duplicates_and_box_geometry_independently(self):
        inside = ["1", "2", "0.4", "0.2", "0.1", "0.2"]
        outside = ["3", "2", "0.99", "0.8", "0.05", "0.1"]
        result = summarize([inside, inside, outside], vertices(ZONE_TEXT), 3)
        self.assertEqual(result["uniqueTrackIds"], 1)
        self.assertEqual(result["framesWithRows"], 2)
        self.assertEqual(result["trackIdsWithFrameGaps"], 1)
        self.assertEqual(result["duplicateFrameIdTrackIdRows"], 1)
        self.assertEqual(result["boxCentersOutsidePolygon"], 1)
        self.assertEqual(result["boxesOutsideImage"], 1)

    def test_invalid_frame_and_nonfinite_geometry(self):
        for frame, width in [("0", ".1"), ("6001", ".1"), ("1", "nan"), ("1", "0")]:
            with self.subTest(frame=frame, width=width), self.assertRaises(ValueError):
                summarize([[frame, "1", ".2", ".3", width, ".1"]], vertices(ZONE_TEXT))
