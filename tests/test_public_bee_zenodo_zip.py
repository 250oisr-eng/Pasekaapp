import io
import sys
import unittest
import zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import probe_public_bee_zenodo_zip as p
class Response:
    def __init__(self,data,status,header):
        self.data=data;self.status=status;self.headers={"Content-Range":header};self.read_called=False
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def geturl(self):return "https://zenodo.org/archive"
    def read(self,n):self.read_called=True;return self.data[:n]
class RangeTests(unittest.TestCase):
    def test_refuses_200_before_reading_body(self):
        r=Response(b"large",200,"")
        f=p.RangeReader("https://zenodo.org/archive",100,lambda *a,**k:r)
        with self.assertRaisesRegex(ValueError,"full download refused"):f.read(3)
        self.assertFalse(r.read_called)
    def test_exact_range_and_budget(self):
        r=Response(b"abc",206,"bytes 0-2/100")
        f=p.RangeReader("https://zenodo.org/archive",100,lambda *a,**k:r,budget=3)
        self.assertEqual(f.read(3),b"abc");self.assertEqual(f.tell(),3)
        with self.assertRaisesRegex(ValueError,"budget"):f.read(1)
    def test_mismatch_refused_without_body(self):
        r=Response(b"abc",206,"bytes 1-3/100")
        f=p.RangeReader("https://zenodo.org/archive",100,lambda *a,**k:r)
        with self.assertRaisesRegex(ValueError,"mismatch"):f.read(3)
        self.assertFalse(r.read_called)
    def test_archive_pair_and_path_traversal(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,"w") as z:
            z.writestr("g/images/a.jpg",b"\xff\xd8test");z.writestr("g/labels/a.txt","0 .5 .5 .1 .1")
        with zipfile.ZipFile(data) as z:
            r=p.inspect(z);self.assertEqual(r["pairedCandidates"],1);self.assertFalse(r["trainingAdmission"])
        with self.assertRaises(ValueError):p.safe_name(zipfile.ZipInfo("../escape"))
if __name__=="__main__":unittest.main()
