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
            z.writestr("dataset/train/images/20220501a100.jpg",b"\xff\xd8test")
            for scheme in p.SCHEMES:z.writestr("dataset/train/"+scheme+"/20220501a100.txt","0 .5 .5 .1 .1")
        with zipfile.ZipFile(data) as z:
            r=p.inspect(z);self.assertEqual(r["pairedBothSchemes"],1);self.assertFalse(r["trainingAdmission"])
        with self.assertRaises(ValueError):p.safe_name(zipfile.ZipInfo("../escape"))
    def test_group_date_and_label_validation(self):
        self.assertEqual(p.source_group("train/images/20230609b1692.jpg"),"20230609b")
        self.assertIsNone(p.source_group("train/images/20230230a1.jpg"))
        self.assertIsNone(p.source_group("random.jpg"))
        self.assertEqual(p.label_rows(b"0 .5 .5 .1 .1\n3 .5 .5 .2 .2"),{"0":1,"3":1})
        with self.assertRaises(ValueError):p.label_rows(b"4 .5 .5 .1 .1")
if __name__=="__main__":unittest.main()
