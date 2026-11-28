import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_frozen_pilot as p
import numpy as np
from PIL import Image
class FrozenTests(unittest.TestCase):
    def test_axis_coverage(self):
        for lo,hi in [(0,1920),(100,1860),(1820,1920),(0,10),(360,361)]:
            a=p.axis_cover(1920,384,lo,hi)
            self.assertTrue(all(0<=x<=1536 for x in a))
            self.assertLessEqual(a[0],lo);self.assertGreaterEqual(a[-1]+384,hi)
            self.assertTrue(all(b-a<=384 for a,b in zip(a,a[1:])))
    def test_roi_covered_without_padding(self):
        poly=np.array([[100,220],[1860,270],[1805,590],[145,545]])/np.array([1920,1080])
        im=Image.new("RGB",(1920,1080));tiles=list(p.roi_tiles(im,poly))
        self.assertTrue(all(v[4].size==(384,360) for v in tiles))
        for x,y in [(100,220),(1860,270),(1805,590),(145,545),(1000,400)]:
            self.assertTrue(any(a<=x<=a+w and b<=y<=b+h for a,b,w,h,_ in tiles))
    def test_invalid_extent(self):
        with self.assertRaises(ValueError):p.axis_cover(1920,384,-1,100)
    def test_bad_artifact_refused_before_model_loading(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            f=Path(d)/"delta";f.write_bytes(b"bad")
            with self.assertRaisesRegex(ValueError,"digest/size"):p.load_frozen(Path(d),f)
if __name__=="__main__":unittest.main()
