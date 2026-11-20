"""No-network, no-video tests for structural grouping and immutable fail-closed gates."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from prepare_mendeley_v6_yolo_unassigned import GROUP_COUNTS
from audit_mendeley_v6_grouped_split_proposal import (
    SplitProposalRejected, assess_split_structure, read_limited_json,
)


GROUPS=list(GROUP_COUNTS)
def inventory():
    return {
        "sourceDoi":"10.17632/8gb9r2yhfc.6",
        "stage":"metadata_only_source_url_sha_inventory",
        "inventoryPairs":8,
        "files":[{
            "hiveCollectionFolder":grp,
            "filename":grp.removeprefix("_bee_")+"1002.jpg",
            "imageSha256PinnedNotRecheckedHere":f"{i+1:064x}",
            "sourceVideoSha256":None,
            "sourceVideoFrameIndex":None,
        } for i,grp in enumerate(GROUPS)]
    }

def proposal():
    return {
        "train":GROUPS[:5],
        "validation":GROUPS[5:6],
        "test":GROUPS[6:],
    }


class SplitProposalTests(unittest.TestCase):
    def test_structurally_disjoint_candidate_never_authorizes_training(self):
        result=assess_split_structure(inventory(),proposal())
        self.assertTrue(result["publishedFoldersStructurallyDisjoint"])
        self.assertFalse(result["splitProposalWasAppliedToData"])
        self.assertEqual(result["inventoryImages"],8)
        self.assertEqual(result["publishedExpectedImages"],7200)
        self.assertEqual(result["missingImages"],7192)
        self.assertEqual(result["perProposedSplit"]["train"]["inventoryImages"],5)
        self.assertEqual(result["perProposedSplit"]["validation"]["inventoryImages"],1)
        self.assertEqual(result["perProposedSplit"]["test"]["inventoryImages"],2)
        for key in ("sourceVideoRecordingHashesVerified","frameToRecordingProvenanceVerified",
                    "actualPhysicalHivesIndependenceVerified","independentHoldoutVerified",
                    "splitReadyForTraining","trainingAuthorized","modelApproved",
                    "recognitionSucceeded","cleanupAuthorized"):
            self.assertFalse(result[key],key)

    def test_duplicate_group_across_train_test_rejected(self):
        p=proposal()
        p["test"].append(p["train"][0])
        with self.assertRaisesRegex(SplitProposalRejected,"same_published_hive_group_in_multiple_splits"):
            assess_split_structure(inventory(),p)

    def test_duplicate_group_inside_train_rejected(self):
        p=proposal()
        p["train"].append(p["train"][0])
        with self.assertRaisesRegex(SplitProposalRejected,"duplicate_group_inside_split"):
            assess_split_structure(inventory(),p)

    def test_unknown_group_and_missing_group_rejected(self):
        p=proposal()
        p["train"][0]="_bee_not_from_source"
        with self.assertRaisesRegex(SplitProposalRejected,"unknown_hive_group_in_proposal"):
            assess_split_structure(inventory(),p)
        p=proposal()
        p["train"].pop()
        with self.assertRaisesRegex(SplitProposalRejected,"published_groups_not_covered_exactly_once"):
            assess_split_structure(inventory(),p)

    def test_empty_or_missing_split_rejected(self):
        p=proposal()
        p["validation"]=[]
        with self.assertRaisesRegex(SplitProposalRejected,"empty_or_invalid_split"):
            assess_split_structure(inventory(),p)
        p=proposal()
        p.pop("test")
        with self.assertRaisesRegex(SplitProposalRejected,"expected_three_split_names"):
            assess_split_structure(inventory(),p)

    def test_dataset_and_stage_must_match_original_v6(self):
        a=inventory()
        a["sourceDoi"]="10.17632/8gb9r2yhfc.5"
        with self.assertRaisesRegex(SplitProposalRejected,"not_original_v6_inventory"):
            assess_split_structure(a,proposal())
        a=inventory()
        a["stage"]="validated_training_manifest"
        with self.assertRaisesRegex(SplitProposalRejected,"not_original_v6_inventory"):
            assess_split_structure(a,proposal())

    def test_source_video_hex_claim_does_not_bypass_provenance(self):
        a=inventory()
        for record in a["files"]:
            record["sourceVideoSha256"]="f"*64
            record["sourceVideoFrameIndex"]=234
            record["recordingIndependenceVerified"]=True
        a["independentHiveAndSessionHoldoutVerified"]=True
        a["trainingAuthorized"]=True
        result=assess_split_structure(a,proposal())
        self.assertFalse(result["sourceVideoRecordingHashesVerified"])
        self.assertFalse(result["frameToRecordingProvenanceVerified"])
        self.assertFalse(result["actualPhysicalHivesIndependenceVerified"])
        self.assertFalse(result["trainingAuthorized"])

    def test_duplicate_sha_or_filename_rejected(self):
        a=inventory()
        a["files"][1]["imageSha256PinnedNotRecheckedHere"]=a["files"][0]["imageSha256PinnedNotRecheckedHere"]
        with self.assertRaisesRegex(SplitProposalRejected,"inventory_duplicate_frame_or_jpeg"):
            assess_split_structure(a,proposal())
        a=inventory()
        a["files"].append(dict(a["files"][0]))
        a["inventoryPairs"]+=1
        with self.assertRaisesRegex(SplitProposalRejected,"inventory_duplicate_frame_or_jpeg"):
            assess_split_structure(a,proposal())

    def test_inconsistent_manifest_count_rejected(self):
        a=inventory()
        a["inventoryPairs"]=10
        with self.assertRaisesRegex(SplitProposalRejected,"inventory_count_conflict"):
            assess_split_structure(a,proposal())

    def test_symlink_and_hardlink_json_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            f=root/"source.json"
            f.write_text(json.dumps(inventory()))
            self.assertEqual(read_limited_json(f,100000)["inventoryPairs"],8)
            alias=root/"alias.json"
            alias.symlink_to(f)
            with self.assertRaisesRegex(SplitProposalRejected,"missing_or_symlink_json"):
                read_limited_json(alias,100000)
            alias.unlink()
            os.link(f,alias)
            with self.assertRaisesRegex(SplitProposalRejected,"json_link_or_size_invalid"):
                read_limited_json(f,100000)

    def test_oversized_json_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t)/"large.json"
            f.write_bytes(b"x"*99)
            with self.assertRaisesRegex(SplitProposalRejected,"json_link_or_size_invalid"):
                read_limited_json(f,32)

    def test_not_connected_to_runtime_or_video_cleanup(self):
        result=assess_split_structure(inventory(),proposal())
        s=json.dumps(result)
        self.assertNotIn('"recognitionSucceeded": true',s)
        self.assertNotIn('"trainingAuthorized": true',s)
        source=(Path(__file__).resolve().parents[1] /
                "tools/audit_mendeley_v6_grouped_split_proposal.py").read_text()
        for forbidden in ("MediaStore","IndexedDB","deleteVideo","model.fit(", "torch.load"):
            self.assertNotIn(forbidden,source)


if __name__=="__main__":
    unittest.main()
