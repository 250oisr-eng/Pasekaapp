import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_center_pilot as p
import numpy as np
import torch
class CenterTests(unittest.TestCase):
    def test_shape_and_empty_target(self):
        y=p.BeeCenter()(torch.zeros(1,3,p.H,p.W))
        self.assertEqual(tuple(y.shape),(1,5,p.GH,p.GW))
        h,g,m,c=p.targets([])
        self.assertEqual(m.sum(),0);self.assertEqual(c,0)
    def test_box_center_geometry_and_collision(self):
        h,g,m,c=p.targets([(.1,.2,.2,.3),(.1,.2,.2,.3)])
        self.assertEqual(m.sum(),1);self.assertEqual(c,1);self.assertEqual(h.max(),1)
        y,x=np.argwhere(m)[0]
        self.assertAlmostEqual((x+g[0,y,x])/p.GW,.15,places=5)
        self.assertAlmostEqual(np.exp(g[2,y,x])/p.GW,.1,places=5)
    def test_empty_decode(self):
        out=np.zeros((5,p.GH,p.GW),np.float32);out[0]=-100
        b,s=p.decode_out(out);self.assertEqual(b.shape,(0,4));self.assertEqual(len(s),0)
if __name__=="__main__":unittest.main()
