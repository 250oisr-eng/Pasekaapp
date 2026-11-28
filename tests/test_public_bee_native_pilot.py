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
if __name__=="__main__":unittest.main()
