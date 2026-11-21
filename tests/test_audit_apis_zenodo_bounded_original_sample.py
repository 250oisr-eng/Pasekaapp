"""Local byte fixtures test ZIP parsing. No original source images imported."""
import io
import struct
import sys
import unittest
from pathlib import Path
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
from audit_apis_zenodo_bounded_original_sample import (
    EXPECTED_ARCHIVE_BYTES, central_directory_from_tail, parse_central_directory,
    extract_sample_zip_member, jpeg_dimensions, yolo_annotation_summary,
    range_bytes, audit_bounded_original_jpg_txt, read_bounded_segments,
)


def fake_jpg():
    # Minimal marker structure for SOF; not a pixel-decodable JPEG, for marker tests only.
    return (b"\xff\xd8\xff\xe0\x00\x04\x00\x00"
            b"\xff\xc0\x00\x0b\x08\x00\x02\x00\x03\x01\x01\x11\x00"
            b"\xff\xd9")


def zipped(paths):
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,mode="w",compression=zipfile.ZIP_DEFLATED) as archive:
        for path,data in paths:
            archive.writestr(path,data)
    return buf.getvalue()


def parsed_archive(payload):
    cd=central_directory_from_tail(payload[-min(256*1024,len(payload)):],len(payload))
    entries=parse_central_directory(payload[cd["centralOffset"]:
                                          cd["centralOffset"]+cd["centralBytes"]],cd["count"])
    return entries


def bytes_fetch(payload):
    def get(a,b,total):
        if a<0 or b<a or b>=len(payload):
            raise ValueError("synthetic request out of bounds")
        return payload[a:b+1]
    return get


class FakeResponse:
    def __init__(self, status, content, content_range, encoding="identity"):
        self.status=status
        self.content=content
        self.headers={"Content-Range":content_range,"Content-Encoding":encoding}
    def read(self,n): return self.content[:n]
    def __enter__(self): return self
    def __exit__(self,*_): return False


class FakeOpener:
    def __init__(self,response): self.response=response
    def open(self,request,timeout=0):
        self.request=request
        return self.response


class BoundedOriginalZipTests(unittest.TestCase):
    def test_reads_synthetic_central_directory_and_members_with_crc(self):
        jpg=fake_jpg()
        txt=b"0 0.5 0.5 0.2 0.3\n1 0.4 0.4 0.2 0.2\n"
        data=zipped([("mydataset/all/images/img-20240107_010101--1.jpg",jpg),
                     ("mydataset/all/labels/img-20240107_010101--1.txt",txt)])
        items=parsed_archive(data)
        self.assertEqual(len(items),2)
        fetched=bytes_fetch(data)
        self.assertEqual(extract_sample_zip_member(items[next(k for k in items if k.endswith(".jpg"))],
                                                    len(data),fetched),jpg)
        self.assertEqual(extract_sample_zip_member(items[next(k for k in items if k.endswith(".txt"))],
                                                    len(data),fetched),txt)
        self.assertEqual(jpeg_dimensions(jpg),(3,2))
        self.assertEqual(yolo_annotation_summary(txt)["rows"],2)

    def test_wrong_compressed_member_crc_fails(self):
        original=zipped([("images/a.jpg",fake_jpg())])
        items=parsed_archive(original)
        entry=next(iter(items.values()))
        tampered=dict(entry,crc=123)
        with self.assertRaisesRegex(ValueError,"CRC"):
            extract_sample_zip_member(tampered,len(original),bytes_fetch(original))

    def test_unsafe_zip_path_rejected(self):
        original=zipped([("../escape.jpg",b"evil")])
        with self.assertRaisesRegex(ValueError,"unsafe"):
            parsed_archive(original)

    def test_rejects_non_utf8_label_text(self):
        with self.assertRaises(ValueError):
            yolo_annotation_summary(b"\xff\xfe")

    def test_yolo_out_of_bounds_not_silently_corrected(self):
        r=yolo_annotation_summary(b"0 0.01 0.5 0.20 0.20\n"
                                  b"1 0.5 0.5 0.2 0.2\n")
        self.assertEqual(r["invalidOrOutOfFrameRows"],1)
        self.assertEqual(r["rows"],2)

    def test_rejects_malformed_yolo_rows_and_nan(self):
        r=yolo_annotation_summary(b"0 nan 0.5 0.2 0.2\n2 0.5 0.5 0.2 0.2\n"
                                  b"0 0.5 0.5 0.2\n")
        self.assertEqual(r["invalidOrOutOfFrameRows"],3)

    def test_jpeg_oversized_wrong_marker_rejected(self):
        with self.assertRaises(ValueError):
            jpeg_dimensions(b"notjpg")
        with self.assertRaises(ValueError):
            jpeg_dimensions(b"\xff\xd8\xff\xd9")

    def test_range_bounds_prohibit_large_or_wrong_archive_total(self):
        for a,b,t in ((0,999999999,EXPECTED_ARCHIVE_BYTES),
                      (0,10,333),(-1,10,EXPECTED_ARCHIVE_BYTES)):
            with self.subTest(a=a,b=b,t=t), self.assertRaises(ValueError):
                range_bytes(a,b,t)

    def test_http_200_fullbody_never_read(self):
        class NoRead(FakeResponse):
            def read(self,n): raise AssertionError("must NOT download 2GB")
        r=FakeOpener(NoRead(200,b"", ""))
        with self.assertRaises(ValueError):
            range_bytes(0,0,EXPECTED_ARCHIVE_BYTES,opener=r)

    def test_correct_range_response_returns_only_exact_requested_bytes(self):
        r=FakeOpener(FakeResponse(206,b"P",f"bytes 0-0/{EXPECTED_ARCHIVE_BYTES}"))
        self.assertEqual(range_bytes(0,0,EXPECTED_ARCHIVE_BYTES,opener=r),b"P")
        self.assertEqual(r.request.headers["Range"],"bytes=0-0")

    def test_wrong_content_range_rejected(self):
        r=FakeOpener(FakeResponse(206,b"P","bytes 0-1/2005232875"))
        with self.assertRaises(ValueError):
            range_bytes(0,0,EXPECTED_ARCHIVE_BYTES,opener=r)

    def test_chunked_fetch_reconstructs_exact_bytes_only(self):
        payload=bytes(i%251 for i in range(700))
        calls=[]
        def fetch(a,b,total):
            calls.append((a,b,total))
            return payload[a:b+1]
        result=read_bounded_segments(10,609,len(payload),fetch=fetch,chunk_size=128)
        self.assertEqual(result,payload[10:610])
        self.assertEqual(len(calls),5)
        self.assertTrue(all(b-a+1<=128 for a,b,_ in calls))

    def test_chunked_fetch_rejects_fake_missing_byte(self):
        payload=b"abcdefgh"
        with self.assertRaises(ValueError):
            read_bounded_segments(0,7,len(payload),
                                  fetch=lambda a,b,t:payload[a:b],chunk_size=4)

    def test_chunked_fetch_cannot_exceed_8mib_cap(self):
        with self.assertRaises(ValueError):
            read_bounded_segments(0,8*1024*1024,EXPECTED_ARCHIVE_BYTES,
                                  fetch=lambda *_:b"",chunk_size=128*1024)

    def test_source_audit_with_injected_fixture_is_not_original(self):
        fake=lambda: {"rangeSupported":False,"blockReason":"test says blocked"}
        r=audit_bounded_original_jpg_txt(probe=fake, fetch=lambda *_:b"")
        self.assertFalse(r["originalZipMemberJpegAndTxtCrcVerified"])
        self.assertEqual(r["sourceInputOrigin"],"synthetic_fixture")
        self.assertFalse(r["modelTrainingAllowed"])
        self.assertFalse(r["userVideoCleanupAuthorized"])


if __name__=="__main__":
    unittest.main()
