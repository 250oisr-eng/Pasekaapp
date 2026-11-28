import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_full_cycle as p
import numpy as np
class CycleTests(unittest.TestCase):
    def test_overlap_covers_edge_and_no_duplicate_starts(self):
        starts=p.axis_starts(1920,384,288)
        self.assertEqual(starts[0],0);self.assertEqual(starts[-1],1536)
        self.assertEqual(len(starts),len(set(starts)))
        self.assertTrue(all(b-a<=384 for a,b in zip(starts,starts[1:])))
    def test_box_crop_uses_center_and_clips(self):
        got=p.crop_gt([(0.1,0.1,0.3,0.3)],1000,1000,100,100,384,360)
        np.testing.assert_allclose(got,[(0,0,200/384,200/360)])
    def test_no_gt_ids_in_tracker_and_memory_gap(self):
        box=np.array([[.1,.1,.2,.2]])
        refs={1:{7:tuple(box[0])},2:{},3:{7:tuple(box[0])}}
        pred={1:box,2:np.empty((0,4)),3:box}
        a=p.track(refs,pred,False);b=p.track(refs,pred,True)
        self.assertEqual(a["predictedTrackIds"],2);self.assertEqual(b["predictedTrackIds"],1)
        self.assertEqual(b["correctRecentIdLinks"],1);self.assertEqual(b["wrongRecentIdLinks"],0)
    def test_wrong_recent_link_is_reported(self):
        box=np.array([[.1,.1,.2,.2]])
        r=p.track({1:{7:tuple(box[0])},2:{8:tuple(box[0])}},{1:box,2:box},True)
        self.assertEqual(r["wrongRecentIdLinks"],1)
    def test_one_to_one_match(self):
        gt=[(.1,.1,.2,.2)]
        self.assertEqual(len(p.match(gt,gt+gt,.5)),1)
if __name__=="__main__":unittest.main()
