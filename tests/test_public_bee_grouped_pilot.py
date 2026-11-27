import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_grouped_pilot as p
class GroupTests(unittest.TestCase):
    def test_pollenbee_and_drone_included_wasp_excluded(self):
        rows=b"0 .5 .5 .1 .1\n1 .4 .4 .1 .1\n2 .3 .3 .1 .1\n3 .2 .2 .1 .1"
        boxes,counts=p.boxes(rows);self.assertEqual(len(boxes),3);self.assertEqual(counts["3"],1)
    def test_fixed_group_partition(self):
        groups={g:[f"dataset/train/images/{g}{n}.jpg" for n in range(1,17)] for g in (*p.TRAIN_GROUPS,p.CAL_GROUP,"20230711a")}
        out=p.select(groups)
        self.assertEqual(len(out),4);self.assertNotIn("20230711a",out)
        self.assertTrue(all(len(v)==4 for v in out.values()))
        self.assertNotIn(p.CAL_GROUP,p.TRAIN_GROUPS)
    def test_scheme(self):
        self.assertEqual(p.paired_label("dataset/train/images/a.jpg"),"dataset/train/labels [bee-pollenbee-drone-wasp]/a.txt")
if __name__=="__main__":unittest.main()
