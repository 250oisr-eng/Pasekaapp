import hashlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from compare_mendeley_v6_fan_frames import check_source, nearest


class FrameComparisonTest(unittest.TestCase):
    def test_ranking_and_ties_use_display_order(self):
        target = Image.new("L", (2, 1), 255)
        ranked = nearest(io.BytesIO(bytes([0, 0, 255, 255, 255, 255])), target, 3)
        self.assertEqual(ranked, [(1, 0), (2, 0), (0, 255)])

    def test_partial_missing_and_extra_frame(self):
        for data in (b'a', b'aa', b'aaaaaa'):
            with self.subTest(data=data), self.assertRaises(ValueError):
                nearest(io.BytesIO(data), Image.new("L", (2, 1)), 2)

    def test_wrong_bytes_same_size_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "source"
            path.write_bytes(b"x")
            with self.assertRaisesRegex(ValueError, "digest"):
                check_source(path.parent, ("source", 1, hashlib.sha256(b"y").hexdigest()))
