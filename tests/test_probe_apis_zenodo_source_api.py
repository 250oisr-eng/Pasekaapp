import json
import sys
import unittest
from pathlib import Path
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"tools"))
from probe_apis_zenodo_source_api import (
    RECORD_URL, CONTAINER_URL, fetch_small_json, publisher_record_summary, probe
)


def record():
    return {
        "id": "23276947",
        "pids": {"doi": {"identifier": "10.5281/zenodo.23276947"}},
        "metadata": {"description": "2823 Apis mellifera frames",
                     "rights": [{"id":"cc-by-4.0"}]},
        "files": {"entries": {"dataset_2823_images_labels.zip": {
            "size": 2005232875, "checksum": "md5:3b1dfaed60310045358a6e4391df89cc",
        }}},
    }


class FakeResponse:
    def __init__(self,body,status=200,content_type="application/json"):
        self.status=status
        self.headers={"Content-Type":content_type}
        self.body=body
    def __enter__(self):return self
    def __exit__(self,*_):return False
    def read(self,n):return self.body[:n]


class FakeOpener:
    def __init__(self,response):self.response=response
    def open(self,req,timeout):return self.response


class ZenodoPublisherApiEvidenceTests(unittest.TestCase):
    def test_only_two_exact_official_metadata_urls_allowed(self):
        with self.assertRaises(ValueError):
            fetch_small_json("https://elsewhere.example/zip")
        with self.assertRaises(ValueError):
            fetch_small_json(CONTAINER_URL+"?download=1")

    def test_valid_author_metadata_still_never_certifies_zip_binary(self):
        a=publisher_record_summary(record())
        self.assertEqual(a["recordDoi"],"10.5281/zenodo.23276947")
        self.assertTrue(a["publisherRecordMetadataAuthenticated"])
        self.assertFalse(a["publisherZipChecksumIndependentlyVerified"])
        self.assertFalse(a["userVideoCleanupAuthorized"])

    def test_reject_wrong_taxon_and_dataset_rights(self):
        d=record();d["metadata"]["description"]="Tetragonula carbonaria"
        with self.assertRaises(ValueError):
            publisher_record_summary(d)
        d=record();d["metadata"]["rights"]=[{"id":"cc-by-nc-4.0"}]
        with self.assertRaises(ValueError):
            publisher_record_summary(d)

    def test_reject_wrong_id_doi_and_missing_file(self):
        d=record();d["id"]="not-author"
        with self.assertRaises(ValueError):
            publisher_record_summary(d)
        d=record();d["pids"]["doi"]["identifier"]="10.5281/zenodo.1"
        with self.assertRaises(ValueError):
            publisher_record_summary(d)
        d=record();d["files"]["entries"].clear()
        with self.assertRaises(ValueError):
            publisher_record_summary(d)

    def test_reject_changed_publisher_zip_size_and_checksum(self):
        for key,value in (("size", 9),("checksum","md5:00")):
            d=record();d["files"]["entries"]["dataset_2823_images_labels.zip"][key]=value
            with self.subTest(key=key), self.assertRaises(ValueError):
                publisher_record_summary(d)

    def test_bounded_exact_metadata_fetch(self):
        op=FakeOpener(FakeResponse(json.dumps(record()).encode()))
        r=fetch_small_json(RECORD_URL,opener=op)
        self.assertTrue(r["available"])
        self.assertEqual(r["metadata"]["id"],"23276947")

    def test_metadata_endpoint_rejects_html_and_large_json(self):
        op=FakeOpener(FakeResponse(b"<html></html>",content_type="text/html"))
        self.assertFalse(fetch_small_json(RECORD_URL,opener=op)["available"])
        op=FakeOpener(FakeResponse(b"x"*1200001))
        self.assertEqual(fetch_small_json(RECORD_URL,opener=op)["reason"],"response_oversized")

    def test_simulated_unavailable_container_is_not_approved(self):
        def fixture(u):
            return {"available":True,"metadata":record()} if u==RECORD_URL else {"available":False,"status":404}
        result=probe(fetch=fixture)
        self.assertFalse(result["metadataVerifiedFromPublisher"])
        self.assertFalse(result["individualZipMemberAPIConfirmed"])
        self.assertFalse(result["originalJpgTxtMemberBytesVerified"])
        self.assertFalse(result["modelTrainingAuthorized"])

    def test_fake_container_json_does_not_verify_original_jpg(self):
        def fixture(u):
            return {"available":True,"metadata":record() if u==RECORD_URL else {"entries":[]}}
        result=probe(fetch=fixture)
        self.assertTrue(result["individualZipMemberAPIConfirmed"])
        self.assertFalse(result["metadataVerifiedFromPublisher"])
        self.assertFalse(result["originalJpgTxtMemberBytesVerified"])


if __name__ == "__main__":
    unittest.main()
