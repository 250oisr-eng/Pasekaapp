"""All tests synthetic; real 1-byte official ZIP range probe is separate CI step."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from probe_apis_zenodo_zip_range import probe_range_support, ZENODO_URL


class Response:
    def __init__(self, status, content_range, payload=b"P", content_encoding="identity"):
        self.status = status
        self.headers = {"Content-Range": content_range, "Content-Encoding": content_encoding}
        self.payload = payload
    def read(self, n):
        return self.payload[:n]
    def __enter__(self): return self
    def __exit__(self, *_): return False


class Opener:
    def __init__(self, resp): self.resp = resp
    def open(self, request, timeout=0):
        self.req = request
        return self.resp


class ZenodoRangeTests(unittest.TestCase):
    def test_synthetic_good_range_does_not_verify_any_original_media(self):
        op=Opener(Response(206, "bytes 0-0/2150000000"))
        r=probe_range_support(opener=op)
        self.assertTrue(r["rangeSupported"])
        self.assertEqual(r["publisherArchiveBytesFromContentRange"], 2150000000)
        self.assertEqual(op.req.headers["Range"], "bytes=0-0")
        self.assertFalse(r["originalJpgBytesVerified"])
        self.assertFalse(r["originalZipPublisherMd5Verified"])
        self.assertFalse(r["userVideoCleanupAuthorized"])

    def test_http_200_must_not_read_source_body(self):
        class NoRead(Response):
            def read(self, n): raise AssertionError("full body may never be read")
        r=probe_range_support(opener=Opener(NoRead(200, "")))
        self.assertFalse(r["rangeSupported"])

    def test_fake_range_invalid_header_fails_closed(self):
        for c in ("", "bytes 0-1/2150000000", "bytes 0-0/*", "bytes 0-0/0"):
            with self.subTest(c=c), self.assertRaises(ValueError):
                probe_range_support(opener=Opener(Response(206, c)))

    def test_wrong_zip_prefix_rejected(self):
        with self.assertRaises(ValueError):
            probe_range_support(opener=Opener(Response(206, "bytes 0-0/2000", b"X")))

    def test_wrong_length_rejected(self):
        with self.assertRaises(ValueError):
            probe_range_support(opener=Opener(Response(206, "bytes 0-0/2000", b"PX")))

    def test_content_encoded_byte_rejected(self):
        with self.assertRaises(ValueError):
            probe_range_support(opener=Opener(Response(206, "bytes 0-0/2000", b"P", "gzip")))

    def test_unapproved_external_url_rejected_before_network(self):
        for url in ("https://evil.example/a.zip", "https://zenodo.org/records/23099412/files/dataset_2823_images_labels.zip",
                    ZENODO_URL+"&download=0"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                probe_range_support(url=url)


if __name__ == "__main__":
    unittest.main()
