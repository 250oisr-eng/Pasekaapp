import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import run_public_bee_native_pilot as p
import torch
class NativeTests(unittest.TestCase):
    def test_strict_trainable_allowlist(self):
        self.assertEqual(p.key_kind("model.decoder.layers.2.self_attn.q_proj.weight",2),"decoder")
        self.assertIsNone(p.key_kind("model.decoder.layers.1.self_attn.q_proj.weight",2))
        self.assertIsNone(p.key_kind("model.backbone.class_embed.weight",2))
        self.assertEqual(p.key_kind("class_embed.weight",2),"class")
        self.assertEqual(p.key_kind("bbox_embed.layers.0.weight",2),"box")
        self.assertIsNone(p.key_kind("model.enc_out_class_embed.0.weight",2))
        self.assertIsNone(p.key_kind("model.enc_out_bbox_embed.0.layers.0.weight",2))
    def test_loss_gradients_and_one_to_one(self):
        logits=torch.zeros((1,2,1),requires_grad=True)
        boxes=torch.tensor([[[.2,.2,.1,.1],[.7,.7,.1,.1]]],requires_grad=True)
        loss,stats=p.matched_loss(logits,boxes,[[(.12,.12,.24,.25)]])
        loss.backward()
        self.assertEqual(stats["matched"],1);self.assertTrue(torch.isfinite(logits.grad).all())
        self.assertTrue(boxes.grad.abs().sum()>0)
    def test_empty_targets_and_invalid_class(self):
        logits=torch.zeros((1,2,1),requires_grad=True)
        boxes=torch.tensor([[[.2,.2,.1,.1],[.7,.7,.1,.1]]],requires_grad=True)
        loss,stats=p.matched_loss(logits,boxes,[[]]);self.assertEqual(stats["matched"],0);loss.backward()
        self.assertTrue((logits.grad>0).all())
        with self.assertRaises(ValueError):p.matched_loss(torch.zeros((1,2,2)),boxes,[[]])
    def test_native_partitions_do_not_overlap_named_groups(self):
        fit=set(p.full.EXTERNAL_TRAIN)
        self.assertNotIn(p.transfer.CAL_PREFIX,fit)
        self.assertTrue(fit.isdisjoint(p.transfer.TEST_PREFIXES))
        for name in p.full.EXTERNAL_TEST:
            self.assertFalse(any(name.startswith(g+"_") for g in fit))
    def test_positive_gradient_survives_many_negatives(self):
        logits=torch.zeros((1,300),requires_grad=True);target=torch.zeros_like(logits);target[0,0]=1
        loss=p.balanced_classification(logits,target);loss.backward()
        self.assertAlmostEqual(float(logits.grad[0,0]),-.5,places=6)
        self.assertEqual(int((logits.grad[0,1:]>0).sum()),8)
    def test_low_score_grid_and_summary(self):
        import numpy as np
        rows=[([],np.empty((2,4)),np.array([.002,.03]),{})]
        self.assertIn(.005,p.THRESHOLDS);self.assertAlmostEqual(p.score_summary(rows)["max"],.03)
if __name__=="__main__":unittest.main()
