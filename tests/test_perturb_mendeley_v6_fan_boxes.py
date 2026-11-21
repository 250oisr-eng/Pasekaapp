from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from perturb_mendeley_v6_fan_boxes import perturb_frames

A = (.1, .2, .2, .3)
B = (.8, .8, .9, .9)


class FanPerturbationTests(unittest.TestCase):
    def test_unperturbed_is_geometry_only_and_non_mutating(self):
        source = [{99: B, 3: A}, {2: A, 8: B}]
        snapshot = [dict(x) for x in source]
        modified = perturb_frames(source)
        self.assertEqual(modified, [{0: A, 1: B}] * 2)
        self.assertEqual(source, snapshot)

    def test_drop_every_two_of_four(self):
        modified = perturb_frames([{8: B, 2: A}, {9: A, 5: B}], drop_every=2)
        self.assertEqual([len(frame) for frame in modified], [1, 1])
        self.assertEqual(modified[0][0], A)
        self.assertEqual(modified[1][0], A)

    def test_clamped_jitter_keeps_dimensions(self):
        source = [{1: (0., 0., .2, .2), 2: (.8, .8, 1., 1.)}]
        modified = perturb_frames(source, jitter_pixels=50)
        for frame in modified:
            for box in frame.values():
                self.assertGreaterEqual(box[0], 0)
                self.assertGreaterEqual(box[1], 0)
                self.assertLessEqual(box[2], 1)
                self.assertLessEqual(box[3], 1)
                self.assertAlmostEqual(box[2] - box[0], .2)
                self.assertAlmostEqual(box[3] - box[1], .2)

    def test_gt_ids_and_insertion_order_cannot_influence_noise(self):
        left = perturb_frames([{4: B, 9: A}], jitter_pixels=4)
        right = perturb_frames([{100: A, 0: B}], jitter_pixels=4)
        self.assertEqual(left, right)

    def test_invalid_inputs_fail(self):
        for kwargs in ({"drop_every": -1}, {"drop_every": 1.5}, {"jitter_pixels": -1},
                       {"jitter_pixels": 51}, {"jitter_pixels": 1.2}, {"image_width": 0}):
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValueError):
                    perturb_frames([{1: A}], **kwargs)
        with self.assertRaises(ValueError):
            perturb_frames([{1: (0, 0, 0, .1)}])


if __name__ == "__main__":
    unittest.main()
