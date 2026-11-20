import io
import os
import re
import sys
import unittest
import warnings
import zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
from sample_lila_voc_range import (
    MAX_NETWORK, BoundedRanges, SampleRejected, inspect_public, parse_voc,
)
XML=b"""<annotation><size><width>100</width><height>80</height></size>
<object><name>bee</name><bndbox><xmin>10</xmin><ymin>20</ymin><xmax>40</xmax><ymax>50</ymax></bndbox></object></annotation>"""


def archive(files=None):
    b=io.BytesIO()
    with zipfile.ZipFile(b,"w") as z:
        z.writestr("padding.bin",os.urandom(90000),compress_type=zipfile.ZIP_STORED)
        for name,content in (files or [
            ("LICENSE.txt",b"test-only fake license"),("images/bee-01.xml",XML)]):
            z.writestr(name,content,compress_type=zipfile.ZIP_DEFLATED)
    return b.getvalue()


class FakeResponse(io.BytesIO):
    def __init__(self,body,status,headers):
        super().__init__(body)
        self.status=status
        self.headers=headers
        self.bytes_requested=0
    def read(self,n=-1):
        self.bytes_requested+=max(0,n)
        return super().read(n)


class FakeOpener:
    def __init__(self,blob,ignore_range=False):
        self.blob=blob
        self.ignore_range=ignore_range
        self.calls=[]
        self.last=None
    def open(self,req,timeout):
        self.calls.append(req.get_method())
        if req.get_method()=="HEAD":
            return FakeResponse(b"",200,{"Content-Length":str(len(self.blob))})
        value=req.headers["Range"]
        start,end=map(int,re.fullmatch(r"bytes=([0-9]+)-([0-9]+)",value).groups())
        if self.ignore_range:
            self.last=FakeResponse(self.blob,200,{})
        else:
            self.last=FakeResponse(self.blob[start:end+1],206,
                                   {"Content-Range":f"bytes {start}-{end}/{len(self.blob)}"})
        return self.last


class LilaSampleTests(unittest.TestCase):
    def test_genuine_zip_directory_and_pascal_voc_xml_from_ranges(self):
        source=FakeOpener(archive())
        r=inspect_public(source)
        self.assertTrue(r["ok"])
        self.assertEqual(r["zipEntries"],3)
        self.assertEqual(r["xmlCandidateCount"],1)
        self.assertEqual(r["sample"]["objectsByClass"],{"bee":1})
        self.assertIn("LICENSE.txt",r["licenseDocumentPaths"])
        self.assertLess(r["bytesFetchedByRange"],MAX_NETWORK)
        for k in ("archiveDownloaded","archiveHashVerified","archiveLicensesRead",
                  "licenseVerified","trainingAuthorized","modelApproved",
                  "recognitionSucceeded","cleanupAuthorized"):
            self.assertFalse(r[k])

    def test_http_200_range_rejected_without_reading_body(self):
        source=FakeOpener(archive(),ignore_range=True)
        with self.assertRaisesRegex(SampleRejected,"range_response_not_partial"):
            inspect_public(source)
        self.assertEqual(source.last.bytes_requested,0)

    def test_refuse_zip_with_unsafe_central_directory_name(self):
        source=FakeOpener(archive([("../secret.xml",XML)]))
        with self.assertRaisesRegex(SampleRejected,"unsafe_zip_name"):
            inspect_public(source)

    def test_wrong_voc_bbox_rejected(self):
        bad=XML.replace(b"<xmax>40</xmax>",b"<xmax>140</xmax>")
        source=FakeOpener(archive([("images/bee-01.xml",bad)]))
        with self.assertRaisesRegex(SampleRejected,"no_valid_voc_sample"):
            inspect_public(source)

    def test_doctype_entities_forbidden(self):
        x=b'<!DOCTYPE annotation [<!ENTITY x "boom">]><annotation>&x;</annotation>'
        with self.assertRaisesRegex(SampleRejected,"unsafe_xml_declaration"):
            parse_voc(x)

    def test_oversized_range_rejected_without_network(self):
        source=FakeOpener(archive())
        reader=BoundedRanges(source)
        reader.head_size()
        with self.assertRaisesRegex(SampleRejected,"range_budget_exceeded"):
            reader.get(0,MAX_NETWORK)
        self.assertEqual(source.calls,["HEAD"])

    def test_invalid_archive_missing_eocd(self):
        data=bytearray(archive())
        ix=data.rfind(b"PK\x05\x06")
        self.assertGreaterEqual(ix,0)
        data[ix:ix+4]=b"BAD!"
        source=FakeOpener(bytes(data))
        with self.assertRaisesRegex(SampleRejected,"zip_end_missing"):
            inspect_public(source)


if __name__=="__main__":
    unittest.main()
