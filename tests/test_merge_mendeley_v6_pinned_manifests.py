"""No-network manifest-inventory tests; all generated data is metadata only."""
import csv
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from prepare_mendeley_v6_yolo_unassigned import GROUP_COUNTS
from merge_mendeley_v6_pinned_manifests import (
    InventoryRejected, MAX_CHUNKS, MAX_ROWS, build_metadata_inventory,
    load_manifest_chunks, publish_new_inventory,
)

BASE="https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/"
COLUMNS=("hive_group","image_filename","image_url","label_filename","label_url",
         "image_sha256","label_sha256")


def url(n):
    return BASE + f"{n:08x}-0011-4000-8000-{n:012x}/file_downloaded"


def rows(count=16):
    out=[]
    groups=list(GROUP_COUNTS)
    for i in range(count):
        group=groups[i % len(groups)]
        stem=group.removeprefix("_bee_")+str(1000 + i)
        out.append({
            "group":group, "image":stem+".jpg", "label":stem+".txt",
            "image_url":url(i*2+1), "label_url":url(i*2+2),
            "image_sha256":f"{i+1:064x}", "label_sha256":f"{i+15000:064x}"
        })
    return out


def as_csv(entries):
    buf=io.StringIO()
    w=csv.DictWriter(buf,fieldnames=COLUMNS,lineterminator="\n")
    w.writeheader()
    for r in entries:
        w.writerow({
            "hive_group":r["group"],"image_filename":r["image"],
            "image_url":r["image_url"],"label_filename":r["label"],
            "label_url":r["label_url"],
            "image_sha256":r["image_sha256"],
            "label_sha256":r["label_sha256"],
        })
    return buf.getvalue()


class MergeMendeleyInventoryTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        self.root=Path(t.name)

    def write(self,name,entries):
        p=self.root / name
        p.write_text(as_csv(entries), encoding="utf-8")
        return p

    def test_two_chunks_merge_16_no_training_claim(self):
        src=rows()
        a=self.write("a.csv",src[:8])
        b=self.write("b.csv",src[8:])
        inv=build_metadata_inventory(load_manifest_chunks([a,b]))
        self.assertEqual(inv["inventoryPairs"],16)
        self.assertEqual(inv["publishedExpectedPairs"],7200)
        self.assertEqual(inv["missingPairsRelativeToPublication"],7184)
        self.assertEqual(len(inv["publishedGroupCounts"]),8)
        self.assertTrue(all(i["inventoryPairs"]==2 for i in inv["publishedGroupCounts"]))
        self.assertFalse(inv["countCoverageCompleteButNotIntegrityEvidence"])
        self.assertFalse(inv["originalSourceBytesDownloadedInThisStep"])
        self.assertFalse(inv["trainValTestSplitCreated"])
        self.assertFalse(inv["independentHiveAndSessionHoldoutVerified"])
        self.assertFalse(inv["trainingAuthorized"])
        self.assertFalse(inv["cleanupAuthorized"])
        self.assertEqual(inv["files"][0]["sourceVideoSha256"], None)

    def test_exact_original_fixture_is_metadata_only_16(self):
        f=Path(__file__).resolve().parents[1] / "tests/fixtures/mendeley-v6-user-16-pairs-pinned.csv"
        inv=build_metadata_inventory(load_manifest_chunks([f]))
        self.assertEqual(inv["inventoryPairs"],16)
        self.assertEqual(inv["missingPairsRelativeToPublication"],7184)
        self.assertEqual(inv["sourceDoi"],"10.17632/8gb9r2yhfc.6")

    def test_reject_unpinned_rows(self):
        r=rows(1)
        for key in ("image_sha256","label_sha256"):
            row=dict(r[0]);row[key]=None
            with self.assertRaisesRegex(InventoryRejected,"sha256_pins_required"):
                build_metadata_inventory([row])

    def test_duplicate_identical_filename_across_chunks_rejected(self):
        r=rows(1)[0]
        other={**r,"image_url":url(99),"label_url":url(100),
               "image_sha256":"f"*64}
        with self.assertRaisesRegex(InventoryRejected,"same_frame_repeated_across_csv_chunks"):
            build_metadata_inventory([r,other])

    def test_duplicate_original_jpeg_hash_under_another_name_rejected(self):
        a,b=rows(2)
        b["image_sha256"]=a["image_sha256"]
        with self.assertRaisesRegex(InventoryRejected,"same_jpeg_sha_across_csv_chunks"):
            build_metadata_inventory([a,b])

    def test_reusing_public_jpg_url_under_another_filename_rejected(self):
        a,b=rows(2)
        b["image_url"]=a["image_url"]
        with self.assertRaisesRegex(InventoryRejected,"public_file_uuid_reused_across_chunks"):
            build_metadata_inventory([a,b])

    def test_more_than_published_per_group_fail_closed(self):
        from itertools import islice
        grp=list(GROUP_COUNTS)[0]
        entries=[]
        for i in range(GROUP_COUNTS[grp]+1):
            z=rows(1)[0]
            z["image"]=f"20230609a{i}.jpg"
            z["label"]=f"20230609a{i}.txt"
            z["image_sha256"]=f"{i+1:064x}"
            z["image_url"]=url(2*i+1)
            z["label_url"]=url(2*i+2)
            entries.append(z)
        with self.assertRaisesRegex(InventoryRejected,"more_frames_than_published_for_group"):
            build_metadata_inventory(entries)

    def test_cannot_exceed_overall_published_limit(self):
        with self.assertRaisesRegex(InventoryRejected,"inventory_row_count_invalid"):
            build_metadata_inventory(rows(MAX_ROWS+1))

    def test_cannot_input_same_manifest_twice(self):
        a=self.write("same.csv",rows(1))
        with self.assertRaisesRegex(InventoryRejected,"duplicate_input_manifest_path"):
            load_manifest_chunks([a,a])

    def test_source_csv_symlink_and_hardlink_fail_closed(self):
        a=self.write("a.csv",rows(1))
        link=self.root / "symlink.csv"
        link.symlink_to(a)
        with self.assertRaisesRegex(Exception,"csv_missing_or_symlink"):
            load_manifest_chunks([link])
        link.unlink()
        os.link(a,link)
        with self.assertRaisesRegex(Exception,"csv_link_or_size_invalid"):
            load_manifest_chunks([a])

    def test_atomic_json_publication_no_overwrite(self):
        inv=build_metadata_inventory(rows())
        output=self.root / "inventory.json"
        publish_new_inventory(inv,output)
        disk=json.loads(output.read_text())
        self.assertEqual(disk["inventoryPairs"],16)
        with self.assertRaisesRegex(InventoryRejected,"inventory_output_already_exists"):
            publish_new_inventory(inv,output)
        self.assertEqual(json.loads(output.read_text())["inventoryPairs"],16)

    def test_chunk_count_limit_and_empty_list_rejected(self):
        for n in (0,MAX_CHUNKS+1):
            with self.assertRaisesRegex(InventoryRejected,"manifest_chunk_count_invalid"):
                load_manifest_chunks(["x"]*n)

    def test_output_contains_pins_but_no_claim_about_video_provenance(self):
        inv=build_metadata_inventory(rows())
        encoded=json.dumps(inv)
        self.assertNotIn('"sourceVideoSha256": "all"',encoded)
        self.assertTrue(all(e["sourcePhysicalHiveIdentity"] is None for e in inv["files"]))
        self.assertFalse(inv["allRecordingBytesAndFrameProvenanceVerified"])
        self.assertFalse(inv["independentHiveAndSessionHoldoutVerified"])
        self.assertFalse(inv["modelApproved"])
        self.assertFalse(inv["recognitionSucceeded"])
        self.assertFalse(inv["cleanupAuthorized"])

if __name__=="__main__":
    unittest.main()
