"""No actual ZIP files or videos are stored. Metadata fixtures are synthetic."""
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from audit_licensed_native_bee_dataset_metadata import (
    ARTICLE_ID, ARTICLE_URL, FILES_URL, LICENSE, MAX_BYTES, SOURCE_DOI,
    SOURCE_TITLE, EXPECTED_FILES, audit, audit_public_metadata, parse_json,
    fetch_public_metadata,
)


def fake_article():
    return {"id": ARTICLE_ID, "version": 1, "doi": SOURCE_DOI,
            "title": SOURCE_TITLE, "status": "public", "is_public": True,
            "is_embargoed": False, "defined_type_name": "dataset",
            "license": {"name": LICENSE, "url": "https://creativecommons.org/licenses/by/4.0/"}}


def fake_files():
    return [{"id": fid, "name": name, "size": size,
             "is_link_only": False, "mimetype": "application/zip",
             "download_url": "https://ndownloader.figshare.com/files/" + str(fid),
             "computed_md5": md5, "supplied_md5": md5}
            for fid, (name, size, md5) in EXPECTED_FILES.items()]


class LicensedDatasetMetadataAuditTests(unittest.TestCase):
    def test_publisher_identity_and_license_is_metadata_only(self):
        r = audit_public_metadata(fake_article(), fake_files())
        self.assertEqual(r["publisherDatasetLicense"], "CC BY 4.0")
        self.assertEqual(r["sourceArticleId"], ARTICLE_ID)
        self.assertEqual(r["publisherTotalArchiveSizeBytes"], 206135340)
        self.assertFalse(r["sourceZipBytesVerified"])
        self.assertFalse(r["independentInOutAccuracyMeasured"])
        self.assertFalse(r["videoCleanupAuthorized"])

    def test_source_species_is_not_honeybee(self):
        r = audit_public_metadata(fake_article(), fake_files())
        self.assertEqual(r["speciesReportedByPublisher"], "Tetragonula carbonaria")
        self.assertFalse(r["honeyBeeApisMelliferaBenchmark"])

    def test_neither_code_license_nor_training_rights_assumed(self):
        r = audit_public_metadata(fake_article(), fake_files())
        self.assertFalse(r["modelTrainingApprovedForPaseka"])
        self.assertFalse(r["runtimeModelApprovedForPaseka"])
        self.assertTrue(r["attributionRequired"])

    def test_empty_missing_or_wrong_license_fails(self):
        for bad in (None, "", "CC BY-NC 4.0", "MIT", "CC BY 3.0"):
            p = fake_article()
            p["license"] = {"name": bad, "url": "https://creativecommons.org/licenses/by/4.0/"}
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                audit_public_metadata(p, fake_files())

    def test_wrong_license_url_fails(self):
        p = fake_article()
        p["license"]["url"] = "https://other.example/terms"
        with self.assertRaises(ValueError):
            audit_public_metadata(p, fake_files())

    def test_article_identity_must_be_version_pinned(self):
        for key, value in (("id", ARTICLE_ID+1), ("version", 2),
                           ("doi", "10.26180/unrelated"), ("title", "unrelated"),
                           ("status", "private"), ("is_public", False),
                           ("is_embargoed", True), ("defined_type_name", "article")):
            p = fake_article()
            p[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                audit_public_metadata(p, fake_files())

    def test_missing_archive_rejected(self):
        with self.assertRaises(ValueError):
            audit_public_metadata(fake_article(), fake_files()[:-1])

    def test_extra_archive_rejected(self):
        with self.assertRaises(ValueError):
            audit_public_metadata(fake_article(), fake_files()+[dict(fake_files()[0], id=123)])

    def test_duplicate_archive_rejected(self):
        a = fake_files()
        with self.assertRaises(ValueError):
            audit_public_metadata(fake_article(), [a[0], a[0]])

    def test_changed_publisher_size_or_checksum_rejected(self):
        for key, value in (("size", 17), ("computed_md5", "0"*32),
                           ("supplied_md5", "0"*32), ("name", "changed.zip"),
                           ("id", 1), ("is_link_only", True),
                           ("download_url", "https://evil.example/archive.zip"),
                           ("mimetype", "text/html")):
            a = fake_files()
            a[0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                audit_public_metadata(fake_article(), a)

    def test_metadata_types_checked(self):
        for bad in (None, [], 1):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                audit_public_metadata(bad, fake_files())
        with self.assertRaises(ValueError):
            audit_public_metadata(fake_article(), {})
        a = fake_files()
        a[0]["size"] = True
        with self.assertRaises(ValueError):
            audit_public_metadata(fake_article(), a)

    def test_duplicate_json_keys_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            parse_json(b'{"id":32315067,"id":0}')

    def test_broken_or_excess_metadata_rejected(self):
        for raw in (b"", b"{}", b"\xff\xff", b"{" + b"x" * MAX_BYTES):
            if raw == b"{}":
                self.assertEqual(parse_json(raw), {})
            else:
                with self.subTest(length=len(raw)), self.assertRaises(ValueError):
                    parse_json(raw)

    def test_json_roundtrip_pinned_fields(self):
        a = parse_json(json.dumps(fake_article()).encode("utf-8"))
        f = parse_json(json.dumps(fake_files()).encode("utf-8"))
        self.assertEqual(audit_public_metadata(a, f)["archiveFileCount"], 2)

    def test_url_allowlist_does_not_fetch_disallowed_resource(self):
        for url in ("https://ndownloader.figshare.com/files/64894983",
                    "https://api.figshare.com/v2/articles/32315068",
                    "https://evil.example/", FILES_URL+"?page=1"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                fetch_public_metadata(url)

    def test_expected_endpoints_fetch_order_and_no_extra_calls(self):
        called = []
        def fake_fetch(url):
            called.append(url)
            return fake_article() if url == ARTICLE_URL else fake_files()
        r = audit(fetch=fake_fetch)
        self.assertEqual(called, [ARTICLE_URL, FILES_URL])
        self.assertFalse(r["originalVideoBytesVerified"])


if __name__ == "__main__":
    unittest.main()
