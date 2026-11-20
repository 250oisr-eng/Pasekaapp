import io
import json
import sys
import unittest
from pathlib import Path
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
from probe_lila_bee_zip_range import N, SOURCES, ProbeRejected, probe_source


class Response(io.BytesIO):
    def __init__(self,content,status,headers):
        super().__init__(content)
        self.status=status
        self.headers=headers
        self.times_read=0
    def read(self,*args):
        self.times_read+=1
        return super().read(*args)


class Opener:
    def __init__(self,head_status=200,get_status=206,range_header="bytes 0-63/2500000000",body=None):
        self.head_status=head_status
        self.get_status=get_status
        self.range_header=range_header
        self.body=body if body is not None else b"PK\x03\x04"+b"x"*(N-4)
        self.calls=[]
        self.get_reply=None
    def open(self,request,timeout):
        assert timeout<=12
        assert request.full_url in [u for _,u in SOURCES]
        self.calls.append(request.get_method())
        if request.get_method()=="HEAD":
            return Response(b"",self.head_status,{"Content-Length":"2500000000"})
        assert request.headers.get("Range")=="bytes=0-63"
        self.get_reply=Response(self.body,self.get_status,{"Content-Range":self.range_header})
        return self.get_reply


class LilaRangeTests(unittest.TestCase):
    def test_only_small_real_zip_header_is_verified(self):
        f=Opener()
        r=probe_source(*SOURCES[0],opener=f)
        self.assertEqual(f.calls,["HEAD","GET"])
        self.assertEqual(r["reportedArchiveBytes"],2500000000)
        self.assertEqual(r["byteRange"],"0-63")
        self.assertEqual(len(r["sha256Of64ByteHeader"]),64)
        for k in ("archiveDownloaded","archiveSha256Verified","archiveContentsInspected",
                  "licenseVerified","trainingAuthorized","modelApproved",
                  "recognitionSucceeded","cleanupAuthorized"):
            self.assertFalse(r[k])

    def test_never_read_entire_archive_when_server_ignores_range(self):
        f=Opener(get_status=200,body=b"X"*1000000)
        with self.assertRaisesRegex(ProbeRejected,"http_range_not_supported"):
            probe_source(*SOURCES[0],opener=f)
        self.assertEqual(f.get_reply.times_read,0)

    def test_unapproved_sources_are_rejected_before_network(self):
        f=Opener()
        with self.assertRaisesRegex(ProbeRejected,"unapproved_public_source"):
            probe_source("aws","https://evil.example/dataset.zip",opener=f)
        self.assertEqual(f.calls,[])

    def test_wrong_start_offset_or_total_size_rejected(self):
        for header in ("bytes 1-64/2500000000","bytes 0-63/*",
                       "bytes 0-63/0","bytes 0-63/999999999999"):
            with self.subTest(header=header):
                with self.assertRaises(ProbeRejected):
                    probe_source(*SOURCES[0],opener=Opener(range_header=header))

    def test_invalid_zip_header_or_short_response_rejected(self):
        for body in (b"N"*N,b"PK\x03\x04",b""):
            with self.assertRaises(ProbeRejected):
                probe_source(*SOURCES[0],opener=Opener(body=body))

    def test_head_status_rejected_without_range_request(self):
        f=Opener(head_status=403)
        with self.assertRaisesRegex(ProbeRejected,"head_status_unexpected"):
            probe_source(*SOURCES[0],opener=f)
        self.assertEqual(f.calls,["HEAD"])

    def test_http_status_classification_without_secret_urls(self):
        class Blocker:
            def open(self,request,timeout):
                raise HTTPError(request.full_url,403,"AccessDenied",None,None)
        with self.assertRaisesRegex(ProbeRejected,"public_http_403"):
            probe_source(*SOURCES[0],opener=Blocker())


if __name__=="__main__":
    unittest.main()
