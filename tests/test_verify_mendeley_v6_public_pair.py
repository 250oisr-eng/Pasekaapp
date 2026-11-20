import io
import json
import sys
import unittest
from pathlib import Path
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from verify_mendeley_v6_public_pair import (
    PAIRS, RealPairRejected, TrustedRedirect, bounded_public_read,
    verify_bytes,
)

# Artificial JPEG header for expected 1920x1080, NOT a real image.
FAKE_JPEG = (b"\xff\xd8\xff\xe0\x00\x04AB" +
             b"\xff\xc0\x00\x0b\x08\x04\x38\x07\x80\x01\x01\x11\x00" +
             b"\xff\xd9")
FAKE_LABEL = b"0 0.5 0.5 0.2 0.2\n"
CDN_URL = "https://prod-dcd-datasets-public-files-eu-west-1.s3.eu-west-1.amazonaws.com/id"


class Response:
    status = 200

    def __init__(self, data, url=CDN_URL, length=None):
        self._stream = io.BytesIO(data)
        self._url = url
        self.headers = {"Content-Length": str(len(data) if length is None else length)}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def geturl(self):
        return self._url

    def read(self, n):
        return self._stream.read(n)


class FakeOpener:
    def __init__(self, value):
        self.value = value
        self.calls = 0

    def open(self, req, timeout):
        self.calls += 1
        if isinstance(self.value, Exception):
            raise self.value
        return self.value


class RealPairTests(unittest.TestCase):
    def test_synthetic_pair_is_unassigned_and_never_recognition_proof(self):
        result = verify_bytes(FAKE_JPEG, FAKE_LABEL)
        self.assertEqual(result["beeBoundingBoxes"], 1)
        self.assertEqual(result["width"], 1920)
        self.assertEqual(result["height"], 1080)
        self.assertEqual(result["sourceHiveFolder"], "_bee_20230609a")
        self.assertEqual(result["annotationBytes"], len(FAKE_LABEL))
        self.assertFalse(result["verifiedJpegDecode"])
        self.assertFalse(result["completeDatasetVerified"])
        self.assertFalse(result["trainingAuthorized"])
        self.assertFalse(result["recognitionSucceeded"])
        self.assertFalse(result["cleanupAuthorized"])

    def test_pinned_source_prevents_synthetic_or_changed_bytes(self):
        with self.assertRaisesRegex(RealPairRejected, "public_source_sha_changed"):
            verify_bytes(FAKE_JPEG, FAKE_LABEL, require_pinned_source=True)

    def test_wrong_label_class_fails(self):
        with self.assertRaisesRegex(ValueError, "non_bee_class"):
            verify_bytes(FAKE_JPEG, b"1 .5 .5 .2 .2\n")

    def test_non_jpeg_or_html_download_rejected(self):
        with self.assertRaisesRegex(RealPairRejected, "invalid_jpeg_signature"):
            verify_bytes(b"<html>404</html>", FAKE_LABEL)
        with self.assertRaisesRegex(RealPairRejected, "not_yolo_annotation"):
            verify_bytes(FAKE_JPEG, b"<html>login</html>")

    def test_pin_direct_mendeley_endpoint(self):
        client = FakeOpener(Response(FAKE_LABEL))
        with self.assertRaisesRegex(RealPairRejected, "url_not_pinned"):
            bounded_public_read("https://example.org/redirect", 1024, client)
        self.assertEqual(client.calls, 0)

    def test_real_public_endpoint_can_redirect_only_to_preapproved_cdn(self):
        out = bounded_public_read(PAIRS[1][1], PAIRS[1][2],
                                  FakeOpener(Response(FAKE_LABEL)))
        self.assertEqual(out, FAKE_LABEL)
        with self.assertRaisesRegex(RealPairRejected, "final_origin_not_trusted"):
            bounded_public_read(PAIRS[1][1], PAIRS[1][2],
                                FakeOpener(Response(FAKE_LABEL, url="http://localhost/x")))

    def test_unknown_redirect_to_internal_ip_is_refused(self):
        with self.assertRaisesRegex(RealPairRejected, "untrusted_redirect"):
            TrustedRedirect().redirect_request(
                None, None, 302, "Found", {}, "http://127.0.0.1/internal")

    def test_oversized_declared_and_actual_payloads_are_refused(self):
        with self.assertRaisesRegex(RealPairRejected, "content_length_over_limit"):
            bounded_public_read(PAIRS[1][1], PAIRS[1][2],
                FakeOpener(Response(FAKE_LABEL, length=PAIRS[1][2] + 1)))
        with self.assertRaisesRegex(RealPairRejected, "bytes_out_of_bounds"):
            bounded_public_read(PAIRS[1][1], 5,
                FakeOpener(Response(FAKE_LABEL, length=5)))

    def test_truncated_http_response_is_refused(self):
        with self.assertRaisesRegex(RealPairRejected, "response_size_mismatch"):
            bounded_public_read(PAIRS[1][1], PAIRS[1][2],
                                FakeOpener(Response(FAKE_LABEL, length=100)))

    def test_http_401_fails_without_fake_success(self):
        with self.assertRaisesRegex(RealPairRejected, "download_unavailable"):
            bounded_public_read(PAIRS[1][1], PAIRS[1][2],
                FakeOpener(HTTPError(PAIRS[1][1], 401, "Unauthorized", {}, None)))

    def test_no_dataset_or_user_media_in_script(self):
        script = (Path(__file__).resolve().parents[1] /
                  "tools/verify_mendeley_v6_public_pair.py").read_text()
        for forbidden in ("indexedDB", "MediaStore", "shutil.rmtree",
                          "torch.load", "requests.post"):
            self.assertNotIn(forbidden, script)


if __name__ == "__main__":
    unittest.main()
