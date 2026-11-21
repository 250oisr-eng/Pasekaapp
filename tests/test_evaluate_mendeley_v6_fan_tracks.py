from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from evaluate_mendeley_v6_fan_tracks import evaluate, read_frames

A = (0., 0., .25, .25)
B = (.5, .5, .75, .75)


class FanTrackEvaluationTests(unittest.TestCase):
    def test_renumbering_is_not_a_switch_but_reassignment_is(self):
        truth = [{1: A}, {1: A}, {1: A}]
        same = evaluate(truth, [{7: A}] * 3)
        self.assertEqual((same["matched"], same["adjacentIdSwitches"], same["meanMatchedIoU"]), (3, 0, 1))
        changed = evaluate(truth, [{7: A}, {9: A}, {9: A}])
        self.assertEqual((changed["adjacentMatchedTransitions"], changed["adjacentIdSwitches"]), (2, 1))

    def test_gap_breaks_comparison(self):
        result = evaluate([{1: A}] * 3, [{1: A}, {}, {8: A}])
        self.assertEqual((result["missed"], result["adjacentMatchedTransitions"], result["adjacentIdSwitches"]), (1, 0, 0))

    def test_geometry_and_extras(self):
        result = evaluate([{1: A}, {}], [{1: B}, {2: A}])
        self.assertEqual((result["missed"], result["extra"], result["meanMatchedIoU"]), (1, 2, None))

    def test_maximum_cardinality_precedes_highest_single_overlap(self):
        truth = [{1: (0.,0.,.5,1.), 2: (.1,0.,.6,1.)}]
        pred = [{8: (0.,0.,.5,1.), 9: (0.,0.,.35,1.)}]
        self.assertEqual(evaluate(truth, pred)["matched"], 2)

    def test_threshold_inclusive_and_matches_one_to_one(self):
        result = evaluate([{1: (0.,0.,1.,1.)}], [{1: (0.,0.,.5,1.), 2: (0.,0.,.5,1.)}])
        self.assertEqual((result["matched"], result["extra"], result["meanMatchedIoU"]), (1, 1, .5))

    def test_invalid_inputs_and_empty_predictions(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "tracks"
            p.write_text("")
            self.assertEqual(len(read_frames(p)), 6000)
            for text in ("0,1,0,0,.1,.1", "1,1,0,0,NaN,.1", "1,1,0,0,.1,.1\n"*2):
                p.write_text(text)
                with self.assertRaises(ValueError):
                    read_frames(p)
        for threshold in (0, float("nan"), 1.1):
            with self.assertRaises(ValueError):
                evaluate([], [], threshold)
