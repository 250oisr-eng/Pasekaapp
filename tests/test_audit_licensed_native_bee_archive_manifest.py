"""Synthetic ZIP fixtures only. Real ZIPs are checked by separate CI step."""
import hashlib
from io import BytesIO
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from audit_licensed_native_bee_archive_manifest import (
    EXPECTED_FILES, MAX_ZIP_BYTES, download_checked_archive, inspect_zip, read_annotation_structure,
    audit_cross_archive_jpg_byte_overlap,
)


def archive(entries):
    out = BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as z:
        for name, data in entries:
            z.writestr(name, data)
    return out.getvalue()


class FakeResponse:
    status = 200
    headers = {"Content-Encoding": "identity"}
    def __init__(self, data, url):
        self.data = BytesIO(data)
        self.url = url
    def geturl(self):
        return self.url
    def read(self, n):
        return self.data.read(n)
    def __enter__(self):
        return self
    def __exit__(self, *_):
        return None


class FakeOpener:
    def __init__(self, data, url):
        self.data, self.url = data, url
    def open(self, request, timeout=0):
        return FakeResponse(self.data, self.url)


class ArchiveSourceAuditTests(unittest.TestCase):
    def test_synthetic_archive_reports_extensions_not_event_counts(self):
        data = archive([("data/images/0001.jpg", b"fake-image"),
                        ("data/labels/0001.txt", b"0 0.5 0.5 0.1 0.1")])
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "synthetic.zip"
            path.write_bytes(data)
            r = inspect_zip(path)
            self.assertEqual(r["filesByExtension"], {".jpg": 1, ".txt": 1})
            self.assertFalse(r["containsMp4"])

    def test_reject_path_traversal_and_absolute_and_windows_paths(self):
        for name in ("../evil.jpg", "/abs.jpg", "data/../evil.jpg", "C:/evil.jpg",
                     "data\\evil.jpg"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as td:
                p = Path(td) / "test.zip"
                p.write_bytes(archive([(name, b"bad")]))
                with self.assertRaises(ValueError):
                    inspect_zip(p)

    def test_duplicate_members_are_invalid(self):
        import warnings
        with tempfile.TemporaryDirectory() as td, warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            p = Path(td) / "test.zip"
            p.write_bytes(archive([("a.jpg", b"x"), ("a.jpg", b"y")]))
            with self.assertRaises(ValueError):
                inspect_zip(p)

    def test_bad_archive_crc_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "test.zip"
            b = bytearray(archive([("a.txt", b"knownbytes")]))
            idx = b.find(b"knownbytes")
            self.assertNotEqual(idx, -1)
            b[idx] = 0
            p.write_bytes(b)
            with self.assertRaises((ValueError, zipfile.BadZipFile)):
                inspect_zip(p)

    def test_empty_zip_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "test.zip"
            p.write_bytes(archive([]))
            with self.assertRaises(ValueError):
                inspect_zip(p)

    def test_only_exact_figshare_file_ids_are_approved(self):
        fid, (name, size, md5) = next(iter(EXPECTED_FILES.items()))
        with tempfile.TemporaryDirectory() as td:
            for url in ("https://other.example/files/"+str(fid),
                        "http://ndownloader.figshare.com/files/"+str(fid),
                        "https://ndownloader.figshare.com/files/0"):
                with self.subTest(url=url), self.assertRaises(ValueError):
                    download_checked_archive(url, Path(td)/name, size, md5, opener=None)

    def test_wrong_expected_md5_rejected_before_network(self):
        fid, (name, size, md5) = next(iter(EXPECTED_FILES.items()))
        url = "https://ndownloader.figshare.com/files/" + str(fid)
        with tempfile.TemporaryDirectory() as td, self.assertRaises(ValueError):
            download_checked_archive(url, Path(td)/name, size, "0"*32)

    def test_bad_stream_rejected_without_claiming_publisher_verified(self):
        fid, (name, size, md5) = next(iter(EXPECTED_FILES.items()))
        url = "https://ndownloader.figshare.com/files/" + str(fid)
        with tempfile.TemporaryDirectory() as td, self.assertRaises(ValueError):
            download_checked_archive(url, Path(td)/name, size, md5,
                                     opener=FakeOpener(b"tiny fake archive", url))


    def test_valid_yolo_pair_and_bee_identity_synthetic_labels(self):
        data = archive([("set/images/1.jpg", b"fakejpg"),
                        ("set/labels/1.txt", b"bee_7 0.5 0.5 0.2 0.2\n"),
                        ("set/images/2.jpg", b"fakejpg"),
                        ("set/labels/2.txt", b"0 0.5 0.5 0.2 0.2\n")])
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zip"
            p.write_bytes(data)
            r = read_annotation_structure(p)
            self.assertEqual(r["pairedJpgTxtFiles"], 2)
            self.assertEqual(r["annotatedRows"], 2)
            self.assertEqual(r["classTokenCategories"],
                             {"bee_identity_class": 1, "numeric_class": 1})
            self.assertEqual(r["geometryOutOfBoundsRows"], 0)
            self.assertFalse(r["physicalInOutEventsValidated"])

    def test_bad_realistic_yolo_box_reported_not_silently_fixed(self):
        data = archive([("set/images/1.jpg", b"mock"),
                        ("set/labels/1.txt", b"0 0.02 0.5 0.2 0.2\n"),
                        ("set/labels/2.txt", b"bee_2 unknown\n")])
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zip"
            p.write_bytes(data)
            r = read_annotation_structure(p)
            self.assertEqual(r["geometryOutOfBoundsRows"], 1)
            self.assertEqual(r["nonFiveColumnRows"], 1)
            self.assertEqual(r["unpairedTxtFiles"], 1)
            self.assertEqual(r["annotatedRows"], 2)

    def test_empty_annotation_is_legal_but_not_empty_traffic(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.zip"
            p.write_bytes(archive([("set/images/empty.jpg", b"x"),
                                   ("set/labels/empty.txt", b"")]))
            r = read_annotation_structure(p)
            self.assertEqual(r["emptyLabelFiles"], 1)
            self.assertEqual(r["annotatedRows"], 0)
            self.assertFalse(r["physicalInOutEventsValidated"])


    def test_exact_image_overlap_is_not_claimed_independent(self):
        with tempfile.TemporaryDirectory() as td:
            a, b = Path(td) / "a.zip", Path(td) / "b.zip"
            a.write_bytes(archive([("a/images/1.jpg", b"sharedjpeg"),
                                   ("a/images/2.jpg", b"unique_a")]))
            b.write_bytes(archive([("b/images/3.jpg", b"sharedjpeg"),
                                   ("b/images/4.jpg", b"unique_b")]))
            r = audit_cross_archive_jpg_byte_overlap(a, b)
            self.assertEqual(r["sharedExactJpgSha256"], 1)
            self.assertEqual(r["detectionFramesWithExactMatchInTracking"], 1)
            self.assertFalse(r["independentTrainingValidationSplitEstablished"])

    def test_no_exact_jpg_overlap_still_does_not_prove_independent_sessions(self):
        with tempfile.TemporaryDirectory() as td:
            a, b = Path(td) / "a.zip", Path(td) / "b.zip"
            a.write_bytes(archive([("a/1.jpg", b"a")]))
            b.write_bytes(archive([("b/1.jpg", b"b")]))
            r = audit_cross_archive_jpg_byte_overlap(a,b)
            self.assertEqual(r["sharedExactJpgSha256"], 0)
            self.assertFalse(r["imageVisualOrSessionIndependenceProved"])

    def test_download_cap_is_tight(self):
        self.assertLess(max(x[1] for x in EXPECTED_FILES.values()), MAX_ZIP_BYTES)
        self.assertEqual(sum(x[1] for x in EXPECTED_FILES.values()), 206135340)


if __name__ == "__main__":
    unittest.main()
