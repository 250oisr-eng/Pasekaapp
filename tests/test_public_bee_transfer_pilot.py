import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_transfer_pilot as p
import numpy as np
class TransferTests(unittest.TestCase):
    def test_roundtrip(self):
        a=np.array([[.2,.2,.4,.4]],np.float32);b=np.array([[.23,.18,.43,.42]],np.float32)
        np.testing.assert_allclose(p.apply_deltas(a,p.box_deltas(a,b)),b,atol=1e-6)
    def test_zero_and_bounded_deltas(self):
        a=np.array([[.05,.05,.15,.15]],np.float32)
        np.testing.assert_allclose(p.apply_deltas(a,np.zeros_like(a)),a,atol=1e-6)
        result=p.apply_deltas(a,np.full_like(a,1000))
        self.assertTrue(np.all(result<=1));self.assertTrue(np.all(result>=0))
        with self.assertRaises(ValueError):p.apply_deltas(a,np.full_like(a,np.nan))
    def test_reference_not_used_as_model_input(self):
        row={"boxes":np.array([[.1,.1,.2,.2],[.6,.6,.7,.7]],np.float32),"gt":[(.1,.1,.2,.2)],"x":np.zeros((2,6),np.float32)}
        x,y,d=p.training_arrays([row]);self.assertEqual(list(y),[True,False]);self.assertEqual(x.shape,(2,6))
    def test_external_prefix_disjoint(self):
        self.assertNotIn(p.CAL_PREFIX,p.full.EXTERNAL_TRAIN)
        self.assertTrue(set(p.TEST_PREFIXES).isdisjoint(p.full.EXTERNAL_TRAIN))
        self.assertNotIn(p.CAL_PREFIX,p.TEST_PREFIXES)
    def test_calibration_macro_uses_both_sets(self):
        gt=[(.1,.1,.2,.2)]
        r={"gt":gt,"boxes":np.array(gt,np.float32),"poly":None}
        rows=[(r,np.array([.9],np.float32),np.array(gt,np.float32))]
        best,curve=p.calibrate(rows,rows)
        self.assertEqual(best["macroF1"],1);self.assertEqual(len(curve),16)
if __name__=="__main__":unittest.main()
