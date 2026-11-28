import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_onnx_pilot as p
import numpy as np
import torch
class OnnxTests(unittest.TestCase):
    def test_numeric_and_threshold_gate(self):
        a=(np.array([[[0.],[2.]]]),np.array([[[.2,.2,.1,.1],[.5,.5,.1,.1]]]))
        self.assertTrue(p.verify_outputs(a,a)["pass"])
        b=(a[0],a[1]+.01)
        self.assertFalse(p.verify_outputs(a,b)["pass"])
        c=(np.array([[[0.],[0.]]]),a[1])
        self.assertEqual(p.verify_outputs(a,c)["thresholdDisagreements"],1)
    def test_full_mask_required(self):
        x=torch.zeros((1,3,384,384))
        self.assertIs(p.checked_pixels({"pixel_values":x,"pixel_mask":torch.ones((1,384,384))}),x)
        with self.assertRaises(ValueError):p.checked_pixels({"pixel_values":x,"pixel_mask":torch.zeros((1,384,384))})
    def test_nonfinite_rejected(self):
        a=(np.array([[[float("nan")]]]),np.zeros((1,1,4)))
        with self.assertRaises(ValueError):p.verify_outputs(a,a)
    def test_frame_matching_rejects_missing_detection(self):
        a=[([],np.array([[.1,.1,.2,.2]]),np.array([.9]),{})]
        b=[([],np.empty((0,4)),np.empty(0),{})]
        self.assertFalse(p.compare_frames(a,b)[0]["pass"])
        self.assertTrue(p.compare_frames(a,a)[0]["pass"])
if __name__=="__main__":unittest.main()
