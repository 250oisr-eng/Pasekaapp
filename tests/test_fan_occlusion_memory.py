from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from fan_occlusion_memory import associate_with_memory
from fan_memory_diagnostics import memory_diagnostics, cross_reference_reuse_events
from compare_public_fan_memory import safety_gate
from baseline_mendeley_v6_fan_association import associate_boxes

A = (.05, .1, .15, .2)
B = (.70, .1, .80, .2)
C = (.055, .1, .155, .2)


class ShortMemoryTests(unittest.TestCase):
    def test_one_missing_frame_keeps_id(self):
        reference = [{8: A}, {}, {8: C}]
        got = associate_with_memory(reference)
        self.assertEqual(next(iter(got[0])), next(iter(got[2])))
        self.assertEqual(memory_diagnostics(reference, got)["recoveredSameIdAfterOneFrameGap"], 1)
        self.assertEqual(memory_diagnostics(reference, associate_boxes(reference))["brokenIdAfterOneFrameGap"], 1)

    def test_high_recovery_threshold_rejects_small_displacement(self):
        source = [{8: A}, {}, {8: C}]
        predicted = associate_with_memory(source, recovery_threshold=0.99)
        self.assertNotEqual(next(iter(predicted[0])), next(iter(predicted[2])))

    def test_two_missing_frames_forbid_resurrection(self):
        reference = [{8: A}, {}, {}, {8: A}]
        got = associate_with_memory(reference)
        self.assertNotEqual(next(iter(got[0])), next(iter(got[3])))

    def test_moving_far_is_not_a_valid_reidentification(self):
        reference = [{8: A}, {}, {8: B}]
        got = associate_with_memory(reference)
        self.assertNotEqual(next(iter(got[0])), next(iter(got[2])))

    def test_two_dormant_tracks_one_candidate_stays_unassigned(self):
        source = [{7: A, 8: C}, {}, {9: C}]
        got = associate_with_memory(source)
        self.assertNotIn(next(iter(got[2])), got[0])
        self.assertEqual(len(got[2]), 1)

    def test_one_dormant_track_two_candidates_stays_unassigned(self):
        source = [{7: A}, {}, {8: A, 9: C}]
        got = associate_with_memory(source)
        self.assertTrue(set(got[0]).isdisjoint(got[2]))

    def test_visible_tracks_take_priority_over_dormant(self):
        # First bee is missing one frame, second bee remains present and
        # moves into its region; the visible link must never be stolen.
        source = [{7: A, 8: B}, {8: B}, {7: A, 8: B}]
        got = associate_with_memory(source)
        self.assertEqual(got[0][2], got[1][2])
        self.assertEqual(got[0][1], got[2][1])

    def test_permuted_reference_ids_cannot_change_output(self):
        one = [{9: A, 1: B}, {1: B}, {9: C, 1: B}]
        two = [{20: B, 500: A}, {99: B}, {12: B, 10: C}]
        self.assertEqual(associate_with_memory(one), associate_with_memory(two))

    def test_max_missing_zero_is_identical_to_previous_baseline(self):
        source = [{5: A, 6: B}, {}, {5: C}]
        self.assertEqual(associate_with_memory(source, max_missing=0), associate_boxes(source))

    def test_invalid_parameters_are_rejected(self):
        for threshold in (0, float("nan"), 1.1):
            with self.assertRaises(ValueError):
                associate_with_memory([], threshold=threshold)
        for high in (0.1, float("nan"), 1.1):
            with self.assertRaises(ValueError):
                associate_with_memory([], recovery_threshold=high)
        for missing in (-1, 2, 1.0, True):
            with self.assertRaises(ValueError):
                associate_with_memory([], max_missing=missing)


class MemoryDiagnosticsTests(unittest.TestCase):
    def test_recovery_and_cross_reference_reuse_are_separate(self):
        truth = [{1: A}, {}, {1: A}]
        same = [{5: A}, {}, {5: A}]
        changed = [{5: A}, {}, {9: A}]
        self.assertEqual(memory_diagnostics(truth, same)["recoveredSameIdAfterOneFrameGap"], 1)
        self.assertEqual(memory_diagnostics(truth, changed)["brokenIdAfterOneFrameGap"], 1)
        mixed = memory_diagnostics([{1: A}, {}, {2: A}], same)
        self.assertEqual(mixed["crossReferenceIdentityReuses"], 1)
        self.assertEqual(mixed["groundTruthOneFrameGapEndpoints"], 0)

    def test_safety_gate_rejects_increased_false_reuse(self):
        baseline = {"gapDiagnostics": {"crossReferenceIdentityReuses": 12,
                                         "recoveredSameIdAfterOneFrameGap": 2}}
        improved_but_unsafe = {"gapDiagnostics": {"crossReferenceIdentityReuses": 13,
                                                   "recoveredSameIdAfterOneFrameGap": 50}}
        safe = {"gapDiagnostics": {"crossReferenceIdentityReuses": 12,
                                   "recoveredSameIdAfterOneFrameGap": 3}}
        stagnant = {"gapDiagnostics": {"crossReferenceIdentityReuses": 12,
                                       "recoveredSameIdAfterOneFrameGap": 2}}
        self.assertFalse(safety_gate(baseline, improved_but_unsafe))
        self.assertTrue(safety_gate(baseline, safe))
        self.assertFalse(safety_gate(baseline, stagnant))
        self.assertFalse(safety_gate(baseline, safe, introduced_wrong_links=1))

    def test_wrong_link_event_identifies_true_bees_not_predicted_id(self):
        reference = [{1: A}, {}, {2: A}]
        predicted = [{50: A}, {}, {50: A}]
        self.assertEqual(cross_reference_reuse_events(reference, predicted),
                         {(0, 2, 1, 2)})
        self.assertEqual(cross_reference_reuse_events(reference, [{50: A}, {}, {51: A}]), set())

    def test_no_double_count_for_adjacent_links(self):
        source = [{1: A}, {1: A}, {1: A}]
        result = memory_diagnostics(source, [{3: A}] * 3)
        self.assertEqual(result["comparedPredictedLinksOffsetOneOrTwo"], 2)
        self.assertEqual(result["crossReferenceIdentityReuses"], 0)


if __name__ == "__main__":
    unittest.main()
