import io
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
from probe_public_mendeley import (
    DATASET_ID, VERSION, MAX_JSON_BYTES, MetadataUnavailable,
    fetch_json, probe, verify_metadata,
)


def fixture(endpoint):
    if endpoint=="dataset":
        return {"id":DATASET_ID,"version":VERSION,"licence":{"name":"CC BY 4.0"}}
    if endpoint=="files":
        return [{"filename":"public.zip","content_details":{
            "sha256_hash":"a"*64,"size":123}}]
    if endpoint=="zip":
        return {"sha256_hash":"b"*64,"size":456,"status":"COMPLETED"}
    raise ValueError(endpoint)


class FakeOpener:
    def __init__(self, encoded):
        self.encoded=encoded
        self.urls=[]
    def open(self, request, timeout):
        self.urls.append(request.full_url)
        assert request.get_method()=="GET"
        assert timeout<=12
        return io.BytesIO(self.encoded)


class PublicMetadataTests(unittest.TestCase):
    def test_public_metadata_is_never_license_approval(self):
        report=probe(fixture)
        self.assertEqual(report["fileListCountReturned"],1)
        self.assertEqual(report["reportedLicenceLabel"],"CC BY 4.0")
        self.assertTrue(report["fileListPossiblyPartial"])
        self.assertEqual(report["sampleFileMetadata"][0]["sha256Reported"],"a"*64)
        for key in ("archiveDownloaded","fileLicensesInspected","licenseVerified",
                    "trainingAuthorized","modelApproved","recognitionSucceeded",
                    "cleanupAuthorized"):
            self.assertFalse(report[key])

    def test_wrong_version_or_identifier_fails(self):
        for override in ({"id":"another"},{"version":5}):
            obj={**fixture("dataset"),**override}
            with self.assertRaises(MetadataUnavailable):
                verify_metadata(obj,fixture("files"),fixture("zip"))

    def test_missing_listing_and_bad_checksums_fail(self):
        for entries in ([],{"results":[]},[{"filename":"x","content_details":{
                "sha256_hash":"zzzz","size":12}}]):
            with self.assertRaises(MetadataUnavailable):
                verify_metadata(fixture("dataset"),entries,fixture("zip"))
        with self.assertRaises(MetadataUnavailable):
            verify_metadata(fixture("dataset"),fixture("files"),{"sha256_hash":"no"})

    def test_fixed_https_mendeley_endpoint_only(self):
        fake=FakeOpener(json.dumps(fixture("dataset")).encode())
        item=fetch_json("dataset",fake)
        self.assertEqual(item["version"],VERSION)
        self.assertEqual(fake.urls,[
            "https://api.data.mendeley.com/datasets/8gb9r2yhfc?version=6"])
        for key in ("../../private","https://evil.example","file_downloaded",""):
            with self.assertRaises(MetadataUnavailable):
                fetch_json(key,fake)
        self.assertEqual(len(fake.urls),1)

    def test_excessive_metadata_or_invalid_json_fails(self):
        for contents in (b"x"*(MAX_JSON_BYTES+1), b"INVALID", b'"string"'):
            with self.assertRaises(MetadataUnavailable):
                fetch_json("dataset",FakeOpener(contents))

    def test_no_file_download_uri_leaks_into_inventory(self):
        f=fixture("files")
        f[0]["content_details"]["download_url"]="https://signed.example/token"
        report=verify_metadata(fixture("dataset"),f,fixture("zip"))
        self.assertNotIn("signed.example",json.dumps(report))
        self.assertFalse(report["archiveDownloaded"])


if __name__=="__main__":
    unittest.main()
