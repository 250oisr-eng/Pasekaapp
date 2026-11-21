"""Only invented fixtures: no author CSV, real video or user media."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from bee_event_semantics_contract import summarize_synthetic_events


def event(i, label, start, end):
    return {"event_id": i, "class_name": label,
            "start_side": start, "end_side": end}


ENTER = event("e1", "entering", "outside", "inside")
EXIT = event("e2", "exiting", "inside", "outside")
TURN_OUT = event("e3", "entering-exiting", "outside", "outside")
TURN_IN = event("e4", "exiting-entering", "inside", "inside")
UNKNOWN = event("e5", "unknown", "unknown", "unknown")


class SyntheticEventCountingContractTests(unittest.TestCase):
    def test_empty_synthetic_sequence_is_not_real_accuracy(self):
        r = summarize_synthetic_events([])
        self.assertEqual(r["events"], 0)
        self.assertEqual(r["totalNetDelta"], 0)
        self.assertIsNone(r["measuredDetectorAccuracy"])
        self.assertFalse(r["realDatasetBenchmarkAuthorized"])

    def test_simple_entrance_is_positive_logical_change(self):
        r = summarize_synthetic_events([ENTER])
        self.assertEqual((r["simpleEnteringEvents"], r["totalNetDelta"]), (1, 1))

    def test_simple_exit_is_negative_logical_change(self):
        r = summarize_synthetic_events([EXIT])
        self.assertEqual((r["simpleExitingEvents"], r["totalNetDelta"]), (1, -1))

    def test_simple_pair_balances_without_double_counting(self):
        r = summarize_synthetic_events([ENTER, EXIT])
        self.assertEqual(r["totalNetDelta"], 0)
        self.assertEqual(r["events"], 2)

    def test_turn_away_from_entrance_has_zero_net_but_unknown_gross(self):
        r = summarize_synthetic_events([TURN_OUT])
        self.assertEqual(r["enteringExitingTurns"], 1)
        self.assertEqual(r["totalNetDelta"], 0)
        self.assertIsNone(r["physicalEntranceCrossings"])
        self.assertIsNone(r["physicalExitCrossings"])

    def test_turn_back_toward_entrance_has_zero_net_but_unknown_gross(self):
        r = summarize_synthetic_events([TURN_IN])
        self.assertEqual(r["exitingEnteringTurns"], 1)
        self.assertEqual(r["totalNetDelta"], 0)
        self.assertIsNone(r["physicalEntranceCrossings"])

    def test_mixed_events_do_not_promote_turns_to_simple_counts(self):
        r = summarize_synthetic_events([ENTER, EXIT, TURN_OUT, TURN_IN])
        self.assertEqual((r["simpleEnteringEvents"], r["simpleExitingEvents"]), (1, 1))
        self.assertEqual(r["totalNetDelta"], 0)
        self.assertEqual(r["events"], 4)

    def test_unknown_event_makes_total_net_unknown(self):
        r = summarize_synthetic_events([ENTER, UNKNOWN])
        self.assertEqual(r["knownSemanticNetDelta"], 1)
        self.assertEqual(r["unresolvedEvents"], 1)
        self.assertIsNone(r["totalNetDelta"])

    def test_duplicate_ids_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "repeated"):
            summarize_synthetic_events([ENTER, ENTER])

    def test_published_raw_letter_codes_are_never_silently_mapped(self):
        for label in ("D", "U", "DU", "UD", "x", ""):
            with self.subTest(label=label), self.assertRaises(ValueError):
                summarize_synthetic_events([event("raw", label, "outside", "inside")])

    def test_wrong_endpoint_for_class_fails_closed(self):
        for wrong in (event("a", "entering", "inside", "outside"),
                      event("b", "entering-exiting", "inside", "inside"),
                      event("c", "unknown", "inside", "inside")):
            with self.subTest(wrong=wrong["event_id"]), self.assertRaises(ValueError):
                summarize_synthetic_events([wrong])

    def test_missing_or_extra_keys_are_rejected(self):
        with self.assertRaises(ValueError):
            summarize_synthetic_events([{"event_id": "x", "class_name": "entering"}])
        with self.assertRaises(ValueError):
            summarize_synthetic_events([dict(ENTER, source="claimed_author")])

    def test_real_source_flag_cannot_be_passed_to_synthetic_harness(self):
        with self.assertRaisesRegex(ValueError, "only synthetic"):
            summarize_synthetic_events([ENTER], input_origin="published_csv")

    def test_bad_ids_and_non_records_fail(self):
        for bad in (" ", "x"*129, "é", None, 3):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                summarize_synthetic_events([event(bad, "entering", "outside", "inside")])
        with self.assertRaises(ValueError):
            summarize_synthetic_events([1])

    def test_order_does_not_change_aggregate_and_input_remains_intact(self):
        rows = [ENTER.copy(), EXIT.copy(), TURN_OUT.copy(), TURN_IN.copy()]
        rev = list(reversed(rows))
        self.assertEqual(summarize_synthetic_events(rows),
                         summarize_synthetic_events(rev))
        self.assertEqual(rows[0], ENTER)
        self.assertFalse(summarize_synthetic_events(rows)["videoCleanupAuthorized"])


if __name__ == "__main__":
    unittest.main()
