import hashlib
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from run_public_mendeley_v6_fan_baseline import TRACKS, TRACKS_URL, verify_bytes, run


class PublicFanBaselineTests(unittest.TestCase):
    def test_exact_hash_and_size(self):
        data = b"verified-public-test"
        spec = ("source.txt", len(data), hashlib.sha256(data).hexdigest())
        self.assertEqual(verify_bytes(data, spec), "source.txt")
        with self.assertRaisesRegex(ValueError, "size"):
            verify_bytes(data + b"0", spec)
        with self.assertRaisesRegex(ValueError, "SHA"):
            verify_bytes(b"incorrect-public-bytes", ("source.txt", len(b"incorrect-public-bytes"), spec[2]))

    def test_rejects_missing_or_invalid_response(self):
        for data in (None, b"", b"invalid", bytearray(TRACKS[1])):
            with self.subTest(value=type(data).__name__):
                with self.assertRaises(ValueError):
                    verify_bytes(data)

    def test_live_run_never_proceeds_after_bad_hash(self):
        calls = []
        def fake_fetch(url, cap):
            calls.append((url, cap))
            return b"not the verified tracking file"
        with patch("run_public_mendeley_v6_fan_baseline.associate_boxes") as baseline:
            with self.assertRaises(ValueError):
                run(fetch=fake_fetch)
            baseline.assert_not_called()
        self.assertEqual(calls, [(TRACKS_URL, TRACKS[1])])


if __name__ == "__main__":
    unittest.main()
