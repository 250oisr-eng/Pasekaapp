import hashlib
import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import unittest
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("verify_voice_model", ROOT / "scripts" / "verify-voice-model.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
source = json.loads((ROOT / "android-native" / "voice-model-source.json").read_text())


class VoiceModelSourceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.archive = Path(self.temp.name) / "model.zip"
        self.entries = [(source["model"] + "/" + name, b"synthetic") for name in source["requiredFiles"]]

    def make(self, entries):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(self.archive, "w") as archive:
                for name, value in entries:
                    archive.writestr(name, value)
        return {**source, "sha256": hashlib.sha256(self.archive.read_bytes()).hexdigest()}

    def test_exact_source_and_dynamic_graph_layout(self):
        self.assertEqual(source["model"], "vosk-model-small-ru-0.22")
        self.assertEqual(source["license"], "Apache-2.0")
        self.assertTrue(source["officialUrl"].startswith("https://alphacephei.com/"))
        self.assertEqual(len(source["sha256"]), 64)
        m = self.make(self.entries)
        report = module.verify(self.archive, m)
        self.assertTrue(report["zipCrcVerified"])
        self.assertFalse(report["speechRecognitionTested"])
        self.assertFalse(report["deviceTested"])

    def test_mismatch_digest_rejected(self):
        m = self.make(self.entries)
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            module.verify(self.archive, {**m, "sha256": "0"*64})

    def test_hclg_alone_is_not_expected_small_ru_layout(self):
        entries = [(p, v) for p, v in self.entries if not p.endswith(("HCLr.fst", "Gr.fst"))]
        entries.append((source["model"] + "/graph/HCLG.fst", b"wrong graph"))
        with self.assertRaisesRegex(ValueError, "missing or empty model files"):
            module.verify(self.archive, self.make(entries))

    def test_empty_model_file_rejected(self):
        entries = [*self.entries[:-1], (self.entries[-1][0], b"")]
        with self.assertRaisesRegex(ValueError, "missing or empty"):
            module.verify(self.archive, self.make(entries))

    def test_traversal_absolute_and_backslash_rejected(self):
        for bad in ["../escape", "/absolute", source["model"] + "/../escape", source["model"] + "\\escape"]:
            with self.subTest(path=bad):
                with self.assertRaisesRegex(ValueError, "ZIP path"):
                    module.verify(self.archive, self.make([*self.entries, (bad, b"x")]))

    def test_duplicate_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            module.verify(self.archive, self.make([*self.entries, self.entries[0]]))

    def test_symlink_rejected(self):
        info = zipfile.ZipInfo(source["model"] + "/link")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.assertRaisesRegex(ValueError, "nonregular"):
            module.verify(self.archive, self.make([*self.entries, (info, b"elsewhere")]))

    def test_size_limits_rejected(self):
        m = self.make(self.entries)
        for override in [{"maxArchiveBytes": 1}, {"maxExpandedBytes": 1}, {"maxEntries": 1}]:
            with self.subTest(override=override), self.assertRaises(ValueError):
                module.verify(self.archive, {**m, **override})


if __name__ == "__main__":
    unittest.main()
