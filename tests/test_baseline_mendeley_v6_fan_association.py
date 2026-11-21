from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from baseline_mendeley_v6_fan_association import associate_boxes
from evaluate_mendeley_v6_fan_tracks import evaluate

A = (0., 0., .2, .2)
B = (.6, .6, .8, .8)


class FanAssociationBaselineTests(unittest.TestCase):
    def test_stationary_bees_keep_identity_even_when_reference_ids_change(self):
        predictions = associate_boxes([{9: A, 1: B}, {1: A, 9: B}])
        self.assertEqual(predictions[0], predictions[1])
        self.assertEqual(len(predictions[1]), 2)

    def test_empty_intervening_frame_creates_new_identity(self):
        reference = [{7: A}, {}, {7: A}]
        output = associate_boxes(reference)
        self.assertNotEqual(next(iter(output[0])), next(iter(output[2])))
        self.assertEqual(evaluate(reference, output)["adjacentIdSwitches"], 0)

    def test_disjoint_box_and_equal_box_preserve_expected_counts(self):
        reference = [{7: A}, {7: B}, {7: B}]
        output = associate_boxes(reference)
        self.assertEqual(len(set(next(iter(frame)) for frame in output)), 2)
        metrics = evaluate(reference, output)
        self.assertEqual((metrics["matched"], metrics["missed"], metrics["extra"]), (3, 0, 0))
        self.assertEqual(metrics["adjacentIdSwitches"], 1)

    def test_reference_ids_do_not_influence_output(self):
        left = associate_boxes([{42: B, 2: A}, {42: B, 2: A}])
        right = associate_boxes([{1: A, 2: B}, {100: A, 7: B}])
        self.assertEqual(left, right)

    def test_threshold_rejected_if_not_finite_and_in_range(self):
        for threshold in (0, float("nan"), 1.1):
            with self.assertRaises(ValueError):
                associate_boxes([{}], threshold)

    def test_6000_frame_synthetic_load_without_source_id_leakage(self):
        # Performance/scale smoke check only: NOT a real detector accuracy result.
        boxes = [(i / 16, .2, i / 16 + .04, .24) for i in range(12)]
        frames = [{(i + k * 47) % 40003 + 1: box for i, box in enumerate(boxes)}
                  for k in range(6000)]
        predictions = associate_boxes(frames)
        metrics = evaluate(frames, predictions)
        self.assertEqual(metrics["frames"], 6000)
        self.assertEqual(metrics["matched"], 72000)
        self.assertEqual(metrics["missed"], 0)
        self.assertEqual(metrics["extra"], 0)
        self.assertEqual(metrics["adjacentIdSwitches"], 0)
        self.assertEqual(metrics["adjacentMatchedTransitions"], 12 * 5999)

    def test_reenter_after_disappearance_gets_fresh_id(self):
        source = [{1: A}, {1: B}, {1: A}]
        predictions = associate_boxes(source)
        self.assertEqual(len({next(iter(x)) for x in predictions}), 3)
        self.assertEqual(evaluate(source, predictions)["adjacentIdSwitches"], 2)

    def test_input_is_not_mutated(self):
        source = [{3: A}, {3: A}]
        associate_boxes(source)
        self.assertEqual(source, [{3: A}, {3: A}])


if __name__ == "__main__":
    unittest.main()
