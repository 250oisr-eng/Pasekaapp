import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import io
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import verify_public_bee_pilot_inputs as pilot

class Response(io.BytesIO):
    headers = {}
    def geturl(self):
        return "https://example.invalid/public"

class PilotTests(unittest.TestCase):
    def test_digest_and_size_must_match(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            with patch.object(pilot, "urlopen", return_value=Response(b"abc")):
                out = pilot.download("https://example.invalid/file", root/"ok", 4,
                                     hashlib.sha256(b"abc").hexdigest(), 3)
                self.assertEqual(out["bytes"], 3)
            with patch.object(pilot, "urlopen", return_value=Response(b"bad")):
                with self.assertRaisesRegex(ValueError, "SHA"):
                    pilot.download("https://example.invalid/file", root/"bad", 4, "0"*64, 3)
            with patch.object(pilot, "urlopen", return_value=Response(b"12345")):
                with self.assertRaisesRegex(ValueError, "cap"):
                    pilot.download("https://example.invalid/file", root/"large", 4)

    def test_safetensors_header_requires_complete_nonoverlapping_data(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/"model.safetensors"
            def write(tensors):
                header = json.dumps(tensors).encode()
                path.write_bytes(struct.pack("<Q", len(header)) + header + b"12345678")
            write({"a":{"shape":[2],"dtype":"F32","data_offsets":[0,8]}})
            self.assertEqual(pilot.verify_safetensors(path)["tensorCount"], 1)
            write({"a":{"shape":[1],"dtype":"F32","data_offsets":[0,4]},
                   "b":{"shape":[2],"dtype":"F32","data_offsets":[2,8]}})
            with self.assertRaisesRegex(ValueError, "overlap"):
                pilot.verify_safetensors(path)
            write({"a":{"shape":[1],"dtype":"F32","data_offsets":[0,4]}})
            with self.assertRaisesRegex(ValueError, "unreferenced"):
                pilot.verify_safetensors(path)

    def test_tracks_reject_duplicate_and_nonfinite_boxes(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/"tracks.txt"
            path.write_text("1,1,0.2,0.2,0.1,0.1\n2,1,0.3,0.2,0.1,0.1\n")
            self.assertEqual(pilot.parse_tracks(path)["annotatedFrames"], 2)
            path.write_text("1,1,0.2,0.2,0.1,0.1\n1,1,0.3,0.2,0.1,0.1\n")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                pilot.parse_tracks(path)
            path.write_text("1,1,nan,0.2,0.1,0.1\n")
            with self.assertRaisesRegex(ValueError, "invalid"):
                pilot.parse_tracks(path)

    def test_catalog_pairs_exact_recording_stem_not_independence(self):
        parent = "1"*8+"-"+"1"*4+"-"+"1"*4+"-"+"1"*4+"-"+"1"*12
        def file(name, uid):
            return {"filename":name,"id":uid,"folder_id":parent,"size":10,"status":"COMPLETED",
                    "content_details":{"size":10,"sha256_hash":"1"*64}}
        rows = [file("one.mp4",parent.replace("1","2")),file("tracks_one.txt",parent.replace("1","3")),
                file("two.mp4",parent.replace("1","4"))]
        with patch.object(pilot, "fetch_json", side_effect=[[{"name":"tracking_and_behavior","id":parent}], rows]):
            result = pilot.tracking_catalog()
        self.assertEqual([x["recording"] for x in result["pairs"]], ["one"])
        self.assertEqual(result["unpairedVideos"], ["two"])
        self.assertIs(result["independentPhysicalHivesVerified"], False)

if __name__ == "__main__":
    unittest.main()
