import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_query_head_pilot as p

class QueryHeadTests(unittest.TestCase):
    def test_coco_frisbee_is_not_a_bee_class(self):
        names = {i: name for i, name in enumerate(["person", "frisbee", "cat"] +
                 [f"other {i}" for i in range(77)] + ["N/A"])}
        self.assertEqual(p.validate_pretrained_labels(names), 80)
        for label in ("bee", "Honey-Bee", "honeybee", "APIS_MELLIFERA"):
            altered = dict(names)
            altered[3] = label
            with self.assertRaisesRegex(ValueError, "bee class"):
                p.validate_pretrained_labels(altered)
        with self.assertRaisesRegex(ValueError, "COCO"):
            p.validate_pretrained_labels({0: "frisbee"})

    def test_video_partitions_do_not_reuse_source_digest(self):
        self.assertNotEqual(p.TRAIN_VIDEO[2],p.VIDEO[2])
        self.assertNotEqual(p.TRAIN_TRACKS[2],p.TRACKS[2])
        self.assertNotEqual(p.TRAIN_VIDEO[0],p.VIDEO[0])
    def test_sampling_is_fixed_without_object_density(self):
        self.assertEqual(p.choose_frames({n: [] for n in range(1,101)},4),[13,38,63,88])
    def test_tile_boundary_owns_reference_once(self):
        bbox=[(0.18,0.10,0.22,0.15)]
        left=p.tile_reference(bbox,0,0,384,360)
        right=p.tile_reference(bbox,384,0,768,360)
        self.assertEqual(len(left)+len(right),1)
        self.assertTrue(all(0 <= v <= 1 for v in (left+right)[0]))
    def test_one_to_one_matching_counts_duplicates_as_false_positives(self):
        gt=[(0,0,0.2,0.2)]
        pred=[(0,0,0.2,0.2),(0,0,0.2,0.2)]
        self.assertEqual(p.match_count(gt,pred),1)
        self.assertEqual(p.match_count(gt,[]),0)
        self.assertEqual(p.match_count(gt,[(0.8,0.8,1,1)]),0)
    def test_empty_positive_evidence_stops_instead_of_faking_fit(self):
        import numpy as np
        rows=[{"frame":1,"gt":[],"boxes":np.array([[0,0,0.2,0.2]]),"features":np.ones((1,4))}]
        fit,counts=p.fit_head(rows)
        self.assertIsNone(fit)
        self.assertEqual(counts["positives"],0)
if __name__=="__main__":
    unittest.main()
