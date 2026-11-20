"""Pure synthetic tests: no network access and no original dataset bytes."""
import csv
import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from stage_mendeley_v6_public_csv import (
    CSVStageRejected, MAX_CSV, MAX_JPG, MAX_PAIRS, REQUIRED,
    bounded_read, parse_manifest, read_csv_file, stage_rows,
)

BASE = "https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/"
def url(n):
    return BASE + f"00000000-0000-4000-8000-{n:012x}/file_downloaded"

def row(group="_bee_20230609a", stem="20230609a1002", a=1, b=2):
    return {"hive_group": group, "image_filename": stem + ".jpg",
            "image_url": url(a), "label_filename": stem + ".txt",
            "label_url": url(b)}

def csv_bytes(rows, fields=None):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields or sorted(REQUIRED),
                            lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")

class Response:
    status = 200

    def __init__(self, content, final_url=None, declared=None, encoding=None):
        self.content = io.BytesIO(content)
        self.final_url = final_url or (
            "https://prod-dcd-datasets-public-files-eu-west-1.s3.eu-west-1.amazonaws.com/fixture")
        self.headers = {"Content-Length":
                        str(len(content) if declared is None else declared)}
        if encoding:
            self.headers["Content-Encoding"] = encoding

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def geturl(self):
        return self.final_url

    def read(self, n):
        return self.content.read(n)

class Opener:
    def __init__(self, response):
        self.response = response

    def open(self, *args, **kwargs):
        if isinstance(self.response, Exception):
            raise self.response
        return self.response

class BoundedCSVTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        def jpg(color):
            img = Image.new("RGB", (1920, 1080), color)
            out = io.BytesIO()
            img.save(out, format="JPEG")
            return out.getvalue()
        cls.image_a = jpg((192, 80, 15))
        cls.image_b = jpg((30, 120, 90))

    def test_valid_work_csv_group_is_unassigned(self):
        r = parse_manifest(csv_bytes([row()]))
        self.assertEqual(len(r), 1)
        self.assertEqual(r[0]["group"], "_bee_20230609a")
        self.assertIsNone(r[0]["image_sha256"])

    def test_rejects_unknown_group_and_path_escape(self):
        for bad in (
            row(group="unknown"),
            {**row(), "image_filename": "../../secrets.jpg"},
            {**row(), "image_filename": "20230609a1002.png"},
            {**row(), "label_filename": "../20230609a1002.txt"},
            row(group="_bee_20230711a"),
        ):
            with self.subTest(bad=bad):
                with self.assertRaises(CSVStageRejected):
                    parse_manifest(csv_bytes([bad]))

    def test_rejects_untrusted_and_query_urls(self):
        for bad in (
            "http://data.mendeley.com/public-files/x",
            "https://localhost/private",
            url(1) + "?token=secret",
            url(1).replace("data.mendeley.com", "data.mendeley.com.attacker.test"),
            url(1).replace("data.mendeley.com", "u:p@data.mendeley.com"),
            url(1).replace("data.mendeley.com", "data.mendeley.com:443"),
        ):
            with self.subTest(url=bad):
                with self.assertRaises(CSVStageRejected):
                    parse_manifest(csv_bytes([{**row(), "image_url": bad}]))

    def test_rejects_duplicate_pair_or_source_uuid(self):
        with self.assertRaisesRegex(CSVStageRejected, "duplicate_pair"):
            parse_manifest(csv_bytes([row(), row(a=3, b=4)]))
        with self.assertRaisesRegex(CSVStageRejected, "file_url_reused"):
            parse_manifest(csv_bytes([row(), row(stem="20230609a1003", a=1, b=4)]))
        with self.assertRaisesRegex(CSVStageRejected, "file_url_reused"):
            parse_manifest(csv_bytes([row(a=1, b=1)]))

    def test_rejects_more_than_sixteen_pairs(self):
        data = [row(stem=f"20230609a{i:04d}", a=2*i+1, b=2*i+2)
                for i in range(MAX_PAIRS+1)]
        with self.assertRaisesRegex(CSVStageRejected, "csv_pair_count_invalid"):
            parse_manifest(csv_bytes(data))

    def test_rejects_bad_columns_and_invalid_hash(self):
        with self.assertRaisesRegex(CSVStageRejected, "csv_columns_invalid"):
            parse_manifest(b"group,url\nx,y\n")
        with self.assertRaisesRegex(CSVStageRejected, "csv_encoding_or_format_invalid"):
            parse_manifest(b"\xff\xff")
        data = {**row(), "image_sha256": "zz"*32}
        with self.assertRaisesRegex(CSVStageRejected, "invalid_optional_sha256"):
            parse_manifest(csv_bytes([data], fields=sorted(REQUIRED | {"image_sha256"})))

    def test_bounded_public_read_rejects_error_and_oversize(self):
        with self.assertRaisesRegex(CSVStageRejected, "public_download_unavailable"):
            bounded_read(url(1), 50, Opener(HTTPError(url(1), 401, "auth", {}, None)))
        with self.assertRaisesRegex(CSVStageRejected, "declared_download_size_invalid"):
            bounded_read(url(1), 2, Opener(Response(b"abc")))
        with self.assertRaisesRegex(CSVStageRejected, "download_size_invalid"):
            bounded_read(url(1), 2, Opener(Response(b"abc", declared=2)))
        with self.assertRaisesRegex(CSVStageRejected, "compressed_http_response_not_accepted"):
            bounded_read(url(1), 50, Opener(Response(b"abc", encoding="gzip")))
        with self.assertRaisesRegex(CSVStageRejected, "invalid_download_origin_or_status"):
            bounded_read(url(1), 50, Opener(Response(b"abc", final_url="http://127.0.0.1")))

    def test_synthetic_full_decode_and_yolo_to_unassigned_coco(self):
        item = row()
        parsed = parse_manifest(csv_bytes([item]))
        lookup = {item["image_url"]: self.image_a,
                  item["label_url"]: b"0 .5 .5 .2 .2\n"}
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "coco.json"
            report = stage_rows(parsed, out, fetch=lambda u, c: lookup[u])
            coco = json.loads(out.read_text())
        self.assertEqual(report["images"], 1)
        self.assertEqual(report["annotations"], 1)
        self.assertEqual(coco["images"][0]["width"], 1920)
        self.assertEqual(coco["images"][0]["height"], 1080)
        self.assertEqual(coco["info"]["split"], "unassigned")
        self.assertEqual(coco["info"]["sourceCreator"], "Tomyslav Sledevic")
        self.assertEqual(coco["info"]["sourceLicense"], "CC BY 4.0")
        self.assertIn("converted", coco["info"]["modificationNotice"])
        self.assertFalse(coco["info"]["trainingAuthorized"])
        self.assertFalse(report["sourceVideoSessionIdsVerified"])
        self.assertFalse(report["cleanupAuthorized"])
        self.assertEqual(report["files"][0]["imageSha256"],
                         hashlib.sha256(self.image_a).hexdigest())
        self.assertFalse(report["files"][0]["sourceHashesPinnedByManifest"])

    def test_correct_optional_sha_is_accepted_and_replacement_refused(self):
        item = {**row(),
                "image_sha256": hashlib.sha256(self.image_a).hexdigest(),
                "label_sha256": hashlib.sha256(b"0 .5 .5 .2 .2\n").hexdigest()}
        parsed = parse_manifest(csv_bytes([item], fields=sorted(REQUIRED |
                             {"image_sha256", "label_sha256"})))
        lookup = {item["image_url"]: self.image_a,
                  item["label_url"]: b"0 .5 .5 .2 .2\n"}
        self.assertTrue(stage_rows(parsed, fetch=lambda u, c: lookup[u])
                        ["files"][0]["sourceHashesPinnedByManifest"])
        lookup[item["image_url"]] = self.image_b
        with self.assertRaisesRegex(CSVStageRejected, "declared_sha256_mismatch"):
            stage_rows(parsed, fetch=lambda u, c: lookup[u])

    def test_two_original_groups_no_independence_claim(self):
        a = row()
        b = row("_bee_20230609b", "20230609b1002", 3, 4)
        parsed = parse_manifest(csv_bytes([a, b]))
        lookup = {a["image_url"]: self.image_a,
                  a["label_url"]: b"0 .5 .5 .2 .2\n",
                  b["image_url"]: self.image_b,
                  b["label_url"]: b""}
        report = stage_rows(parsed, fetch=lambda u, cap: lookup[u])
        self.assertEqual(report["images"], 2)
        self.assertEqual(report["annotations"], 1)
        self.assertEqual(report["groups"], ["_bee_20230609a", "_bee_20230609b"])
        self.assertFalse(report["independentHoldoutVerified"])
        self.assertFalse(report["trainingAuthorized"])

    def test_duplicate_jpeg_bytes_across_groups_rejected(self):
        a = row()
        b = row("_bee_20230609b", "20230609b1002", 3, 4)
        lookup = {a["image_url"]: self.image_a, a["label_url"]: b"",
                  b["image_url"]: self.image_a, b["label_url"]: b""}
        with self.assertRaisesRegex(CSVStageRejected, "identical_jpg_across_pairs"):
            stage_rows(parse_manifest(csv_bytes([a, b])),
                       fetch=lambda u, cap: lookup[u])

    def test_output_is_never_overwritten(self):
        item = row()
        parsed = parse_manifest(csv_bytes([item]))
        lookup = {item["image_url"]: self.image_a,
                  item["label_url"]: b"0 .5 .5 .2 .2\n"}
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "coco.json"
            out.write_text("USER DATA - PRESERVE")
            with self.assertRaisesRegex(Exception, "output_exists"):
                stage_rows(parsed, out, fetch=lambda u, cap: lookup[u])
            self.assertEqual(out.read_text(), "USER DATA - PRESERVE")

    def test_csv_path_rejects_symlinks_hardlinks_and_oversize(self):
        with tempfile.TemporaryDirectory() as tmp:
            normal = Path(tmp) / "in.csv"
            normal.write_bytes(csv_bytes([row()]))
            self.assertEqual(read_csv_file(normal), normal.read_bytes())
            alias = Path(tmp) / "alias.csv"
            alias.symlink_to(normal)
            with self.assertRaisesRegex(CSVStageRejected, "csv_missing_or_symlink"):
                read_csv_file(alias)
            alias.unlink()
            import os
            os.link(normal, alias)
            with self.assertRaisesRegex(CSVStageRejected, "csv_link_or_size_invalid"):
                read_csv_file(normal)
            alias.unlink()
            normal.write_bytes(b"x"*(MAX_CSV+1))
            with self.assertRaisesRegex(CSVStageRejected, "csv_link_or_size_invalid"):
                read_csv_file(normal)

if __name__ == "__main__":
    unittest.main()
