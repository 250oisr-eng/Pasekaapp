import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_roi_pilot as p
import numpy as np
class RoiTests(unittest.TestCase):
    def test_zone_is_parsed_not_executed_and_boundary_included(self):
        z=p.parse_zone("polygon = np.array([[0,0],[1920,0],[1920,1080],[0,1080]])")
        self.assertTrue(p.inside([[0,0,.2,.2]],z)[0])
        with self.assertRaises(ValueError):p.parse_zone("polygon = np.array(__import__('os').system('x'))")
        with self.assertRaises(ValueError):p.parse_zone("polygon = np.array([[0,0],[1920,1080],[1920,0],[0,1080]])")
    def test_full_frame_mapping(self):
        np.testing.assert_allclose(p.full_boxes([[0,0,1,1]],[1,2]),[[.4,1/3,.6,2/3]])
    def test_metrics_and_tracking_use_actual_boxes_not_gt_ids(self):
        gt={1:{20:(0,0,.2,.2)},2:{20:(0,0,.2,.2)},3:{20:(0,0,.2,.2)}}
        pred={1:np.array([[0,0,.2,.2]]),2:np.array([[0,0,.2,.2],[.6,.6,.8,.8]]),3:np.empty((0,4))}
        self.assertEqual(p.measure(gt,pred)["tp"],2)
        self.assertEqual(p.measure(gt,pred)["fp"],1)
        self.assertEqual(p.measure(gt,pred)["fn"],1)
        self.assertEqual(p.track_metrics(gt,pred)["adjacentMatchedTransitions"],1)
        self.assertEqual(p.track_metrics(gt,pred)["adjacentIdSwitches"],0)
    def test_control_selection_contiguous(self):
        self.assertEqual(p.consecutive({x:{} for x in range(1,9)},3),[5,6,7])
        with self.assertRaises(ValueError):p.consecutive({1:{},3:{}},2)
if __name__=="__main__":unittest.main()
