"""Synthetic negative tests: publisher polygon boundary != actual bee in/out."""
import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
from audit_public_fan_polygon_transitions import classify_zone_transitions,run_public
from audit_mendeley_v6_fan_tracks import vertices

ZONE=vertices("polygon = np.array([[100, 220], [1860, 270], [1805, 590], [145, 545]])")


def box(x,y):
    cx=x/1920
    cy=y/1080
    return (cx-.005,cy-.005,cx+.005,cy+.005)


OUTSIDE=box(1000,100)
INSIDE=box(1000,400)


class PolygonTransitionTests(unittest.TestCase):
    def test_only_same_id_in_adjacent_frames_counts_zone_change(self):
        frames=[{4:OUTSIDE},{4:INSIDE},{4:INSIDE},{4:OUTSIDE}]
        result=classify_zone_transitions(frames,ZONE)
        self.assertEqual(result["polygonEntryCandidates"],1)
        self.assertEqual(result["polygonExitCandidates"],1)
        self.assertEqual(result["polygonBoundaryTransitionCandidates"],2)
        self.assertEqual(result["tracksWithPolygonTransitions"],1)
        self.assertEqual(result["rapidOppositePolygonBoundaryReversals"],1)
        self.assertFalse(result["actualBeeTrafficCountValidated"])
        self.assertFalse(result["publisherPolygonIsCalibratedEntranceLine"])
        self.assertFalse(result["videoCleanupAuthorized"])

    def test_gap_reappearance_is_not_counted_as_entrance_crossing(self):
        result=classify_zone_transitions([{9:OUTSIDE},{},{9:INSIDE}],ZONE)
        self.assertEqual(result["gapReappearancesNotInterpretableAsCrossing"],1)
        self.assertEqual(result["polygonEntryCandidates"],0)
        self.assertEqual(result["polygonBoundaryTransitionCandidates"],0)

    def test_changing_track_identity_cannot_become_crossing(self):
        r=classify_zone_transitions([{9:OUTSIDE},{10:INSIDE}],ZONE)
        self.assertEqual(r["polygonBoundaryTransitionCandidates"],0)

    def test_stationary_observations_or_empty_frames_do_not_invent_counts(self):
        a=classify_zone_transitions([{1:INSIDE},{1:INSIDE}],ZONE)
        b=classify_zone_transitions([{},{}],ZONE)
        self.assertEqual(a["polygonBoundaryTransitionCandidates"],0)
        self.assertEqual(a["adjacentSameIdComparisons"],1)
        self.assertEqual(b["referenceObservations"],0)
        self.assertEqual(b["polygonBoundaryTransitionCandidates"],0)

    def test_oscillating_boundary_marks_ambiguity_not_direction(self):
        r=classify_zone_transitions([{1:OUTSIDE},{1:INSIDE},
                                     {1:OUTSIDE},{1:INSIDE}],ZONE)
        self.assertEqual(r["polygonBoundaryTransitionCandidates"],3)
        self.assertEqual(r["rapidOppositePolygonBoundaryReversals"],2)
        self.assertFalse(r["physicalInsideOutsideOrientationVerified"])

    def test_reject_nan_and_invalid_reference_geometry(self):
        for bad in ((.1,.2,float("nan"),.4),(.7,.2,.3,.4),
                    (.1,.2,1.1,.4),(.1,.2,.3,0.1),"invalid"):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    classify_zone_transitions([{1:bad}],ZONE)

    def test_reject_invalid_polygon_and_frame_shape(self):
        for polygon in ([],[[1,2],[2,3]],[[0,0],[1,2],[float("nan"),3]],
                        [[0,0],[3000,0],[10,10]]):
            with self.subTest(polygon=polygon):
                with self.assertRaises(ValueError):
                    classify_zone_transitions([{}],polygon)
        with self.assertRaises(ValueError):
            classify_zone_transitions([[]],ZONE)
        with self.assertRaises(ValueError):
            classify_zone_transitions([],ZONE)

    def test_mismatched_original_track_file_rejected(self):
        with self.assertRaises(ValueError):
            run_public(fetch=lambda url,cap:b"not the original tracking TXT")

    def test_no_v6_tracking_to_actual_entrance_label_promotion(self):
        raw=(Path(__file__).resolve().parents[1]/"tools/audit_public_fan_polygon_transitions.py").read_text()
        for phrase in ('"publisherPolygonIsCalibratedEntranceLine":False',
                       '"independentBeeInOutEventLabelsVerified":False',
                       '"actualBeeTrafficCountValidated":False',
                       '"videoCleanupAuthorized":False'):
            self.assertIn(phrase,raw)


if __name__=="__main__":
    unittest.main()
