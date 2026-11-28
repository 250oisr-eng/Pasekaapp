import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_crossing_pilot as p
import numpy as np

def box(x,y):
    return [(x-5)/1920,(y-5)/1080,(x+5)/1920,(y+5)/1080]
LINE=(np.array([100.,500.]),np.array([1.,0.]),1000.)
class CrossingTests(unittest.TestCase):
    def events(self,ys):
        return p.trajectory_events({i:{1:box(500,y)} for i,y in ys},LINE)
    def test_confirmed_cross_and_return(self):
        e=self.events(enumerate([470,470,500,530,530,500,470,470],1))
        self.assertEqual([x["direction"] for x in e],["negative_to_positive","positive_to_negative"])
    def test_jitter_and_unconfirmed(self):
        self.assertEqual(self.events(enumerate([470,470,499,501,530,501],1)),[])
    def test_missing_frame_does_not_bridge(self):
        self.assertEqual(self.events([(1,470),(2,470),(4,530),(5,530)]),[])
    def test_outside_finite_line(self):
        frames={i:{1:box(1500,y)} for i,y in enumerate([470,470,530,530],1)}
        self.assertEqual(p.trajectory_events(frames,LINE),[])
    def test_one_to_one_direction_and_null(self):
        e={"direction":"negative_to_positive","frame":10,"alongPx":100}
        other={**e,"direction":"positive_to_negative"}
        self.assertEqual(p.match_events([e],[e,e,other])["tp"],1)
        self.assertEqual(p.match_events([e],[e,e,other])["fp"],2)
        self.assertIsNone(p.match_events([],[])["f1"])
    def test_windows_disjoint_fixed(self):
        w=p.windows({f:{} for f in range(1,601)})
        self.assertEqual(len(w),2);self.assertEqual(len(w[0]),32)
        self.assertFalse(set(w[0])&set(w[1]))
if __name__=="__main__":unittest.main()
