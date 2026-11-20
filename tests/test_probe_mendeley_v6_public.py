"""Offline unit tests: all HTTP operations are injected, no network or media."""
import io
import json
import sys
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from probe_mendeley_v6_public import (
    MAX_BODY, PATHS, ProbeError, probe, summarize,
)

class FakeResponse:
    status = 200

    def __init__(self, data, mime="application/json", status=200, declared_size=None):
        self.data = io.BytesIO(data)
        self.status = status
        self.headers = {"Content-Type": mime,
                        "Content-Length": str(len(data) if declared_size is None else declared_size)}

    def read(self, n):
        return self.data.read(n)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

class FakeClient:
    def __init__(self, response):
        self.response = response
        self.called = 0

    def open(self, request, timeout):
        self.called += 1
        assert request.full_url.startswith("https://api.data.mendeley.com/")
        assert request.get_method() == "GET"
        if isinstance(self.response, Exception):
            raise self.response
        return self.response

class ProbeTests(unittest.TestCase):
    def test_public_folder_json_summary_without_download(self):
        raw = [{"name": "detection", "id": "one"},
               {"name": "tracking", "id": "two"}]
        result = probe(PATHS[0], FakeClient(FakeResponse(json.dumps(raw).encode())))
        self.assertEqual(result["status"], 200)
        self.assertEqual(result["summary"]["count"], 2)
        self.assertEqual(result["summary"]["preview"][0]["name"], "detection")

    def test_file_summary_excludes_signed_links(self):
        raw = [{"filename": "example.zip",
                "content_details": {"size": 123, "sha256_hash": "a"*64,
                    "download_url": "https://private.invalid/?token=hidden"}}]
        result = probe(PATHS[1], FakeClient(FakeResponse(json.dumps(raw).encode())))
        self.assertEqual(result["summary"]["preview"][0]["sha256_hash"], "a"*64)
        self.assertNotIn("private.invalid", json.dumps(result))

    def test_http_401_is_not_retried_or_bypassed(self):
        result = probe(PATHS[2], FakeClient(HTTPError("url", 401, "no", {}, None)))
        self.assertEqual(result["status"], 401)
        self.assertEqual(result["body"], "http_status_only")

    def test_redirect_not_followed(self):
        result = probe(PATHS[4], FakeClient(HTTPError("url", 307, "redirect",
                        {"Location": "https://private.invalid/signed"}, None)))
        self.assertEqual(result["status"], 307)
        self.assertNotIn("private.invalid", json.dumps(result))

    def test_known_big_content_length_refused_before_body(self):
        result = probe(PATHS[0], FakeClient(
            FakeResponse(b"{}", declared_size=MAX_BODY+1)))
        self.assertEqual(result["body"], "size_exceeds_metadata_limit")

    def test_stream_without_length_is_bounded(self):
        stream = FakeResponse(b"x"*(MAX_BODY+20))
        stream.headers.pop("Content-Length")
        result = probe(PATHS[0], FakeClient(stream))
        self.assertEqual(result["body"], "oversized_metadata_response")

    def test_html_body_not_processed(self):
        result = probe(PATHS[0], FakeClient(FakeResponse(
            b"<html></html>", mime="text/html")))
        self.assertEqual(result["body"], "not_json_no_parse")

    def test_non_allowlisted_path_rejected_before_network(self):
        client = FakeClient(FakeResponse(b"{}"))
        with self.assertRaisesRegex(ProbeError, "non_allowlisted_url"):
            probe("/datasets/other/zip", client)
        self.assertEqual(client.called, 0)

    def test_network_error_is_fail_closed(self):
        result = probe(PATHS[0], FakeClient(URLError("DNS down")))
        self.assertEqual(result["status"], "network_error")

    def test_snapshot_does_not_leak_signed_links(self):
        raw = {"files": [{"name": "a.zip",
                "download_url": "https://private.invalid/?token=hidden"}],
               "download_url": "https://private.invalid/signed"}
        self.assertNotIn("private.invalid", json.dumps(summarize(raw)))

    def test_pinned_dataset_and_version(self):
        import probe_mendeley_v6_public as mod
        self.assertEqual((mod.DATASET, mod.VERSION), ("8gb9r2yhfc", 6))
        self.assertTrue(all("8gb9r2yhfc" in p for p in PATHS))

if __name__ == "__main__":
    unittest.main()
