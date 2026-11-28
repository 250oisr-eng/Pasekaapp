import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_event_pilot as p
import numpy as np

def rows_and_samples(boxes,scores):
    rows=[([],np.asarray(b,dtype=float).reshape(-1,4),np.asarray(s),{}) for b,s in zip(boxes,scores)]
    samples=[(None,[],{"frame":i+1},None) for i in range(len(rows))]
    return rows,samples
class EventTests(unittest.TestCase):
    def test_low_can_continue_but_not_start(self):
        a=[.1,.1,.2,.2];b=[.6,.6,.7,.7]
        rows,samples=rows_and_samples([[a,b],[a,b],[a,b]],[[.9,.6],[.6,.6],[.9,.6]])
        t,r=p.continued_tracks(rows,samples)
        self.assertEqual([list(t[f]) for f in (1,2,3)],[[0],[0],[0]])
        self.assertEqual(r["lowConfidenceContinuations"],1)
    def test_low_does_not_bridge_absence(self):
        a=[.1,.1,.2,.2]
        rows,samples=rows_and_samples([[a],[],[a],[a]],[[.9],[],[.6],[.9]])
        t,_=p.continued_tracks(rows,samples)
        self.assertEqual(t[3],{});self.assertEqual(list(t[4]),[1])
    def test_high_priority_over_low(self):
        a=[.1,.1,.2,.2];b=[.11,.1,.21,.2]
        rows,samples=rows_and_samples([[a],[b,a]],[[.9],[.9,.6]])
        t,r=p.continued_tracks(rows,samples)
        self.assertEqual(len(t[2]),1);self.assertTrue(np.allclose(t[2][0],b))
        self.assertEqual(r["lowConfidenceContinuations"],0)
    def test_empty_aggregate_not_perfect(self):
        r=p.aggregate([], "plain")
        self.assertIsNone(r["all"]["f1"])
    def test_selection_rejects_insufficient(self):
        with self.assertRaisesRegex(ValueError,"insufficient"):
            p.select_windows({f:{} for f in range(1,100)},(np.array([0.,500.]),np.array([1.,0.]),1000.),[])
if __name__=="__main__":unittest.main()
