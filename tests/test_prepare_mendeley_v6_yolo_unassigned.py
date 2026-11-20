import json
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from prepare_mendeley_v6_yolo_unassigned import (
    GROUP_COUNTS, MendeleyRejected, build_unassigned,
    parse_yolo_labels, publish_unassigned,
)

JPEG = (b"\xff\xd8\xff\xe0\x00\x04AB" +
        b"\xff\xc0\x00\x0b\x08\x00\x50\x00\x64\x01\x01\x11\x00" + b"\xff\xd9")
IHDR = b"IHDR" + struct.pack(">IIBBBBB", 100, 80, 8, 6, 0, 0, 0)
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0d" + IHDR + struct.pack(">I", zlib.crc32(IHDR))
GROUPS = list(GROUP_COUNTS)


class MendeleyV6Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "detection"
        self.root.mkdir()
        self.group = self.new_group(GROUPS[0])
        (self.group / "images" / "one.jpg").write_bytes(JPEG)
        (self.group / "labels" / "one.txt").write_text(
            "0 0.25 0.5 0.3 0.4\n", encoding="ascii")

    def new_group(self, name):
        group = self.root / name
        (group / "images").mkdir(parents=True)
        (group / "labels").mkdir()
        return group

    def test_one_group_yolo_converts_to_unassigned_coco_with_published_folder(self):
        result = build_unassigned(self.root)
        self.assertEqual(result["info"]["sourceDoi"], "10.17632/8gb9r2yhfc.6")
        self.assertEqual(result["info"]["split"], "unassigned")
        self.assertFalse(result["info"]["completeAgainstPublication"])
        self.assertFalse(result["info"]["trainingAuthorized"])
        self.assertFalse(result["info"]["sourceVideosVerified"])
        self.assertEqual(result["images"][0]["hiveCollectionFolder"], GROUPS[0])
        self.assertIsNone(result["images"][0]["sourceRecordingSha256"])
        self.assertEqual(result["images"][0]["width"], 100)
        self.assertEqual(result["images"][0]["height"], 80)
        ann = result["annotations"][0]
        self.assertEqual(ann["category_id"], 1)
        self.assertEqual(ann["bbox"], [10., 24., 30., 32.])
        self.assertEqual(ann["area"], 960.)
        self.assertEqual(result["sourceCollectionGroups"][0]["publishedExpectedImages"], 700)

    def test_empty_yolo_label_keeps_negative_frame(self):
        (self.group / "labels" / "one.txt").write_bytes(b"")
        result = build_unassigned(self.root)
        self.assertEqual(result["annotations"], [])
        self.assertEqual(len(result["images"]), 1)
        self.assertFalse(result["info"]["trainingAuthorized"])

    def test_png_yolo_pair_is_valid_but_unassigned(self):
        (self.group / "images" / "one.jpg").unlink()
        (self.group / "images" / "one.png").write_bytes(PNG)
        result = build_unassigned(self.root)
        self.assertEqual(result["images"][0]["file_name"],
                         f"{GROUPS[0]}/images/one.png")
        self.assertEqual(len(result["annotations"]), 1)

    def test_rejects_unknown_class_and_wrong_field_count(self):
        for label in (b"1 .5 .5 .2 .2", b"bee .5 .5 .2 .2", b"0 .5 .5 .2"):
            with self.assertRaisesRegex(MendeleyRejected, "non_bee_class_or_label_shape"):
                parse_yolo_labels(label, 100, 80)

    def test_rejects_invalid_and_nonfinite_yolo_coordinates(self):
        for label in (b"0 NaN .5 .2 .2", b"0 .1 .5 .5 .2",
                      b"0 .5 .5 0 .2", b"0 .5 .5 .2 2",
                      b"0 inf .5 .2 .2", b"0 .5 .5 -.1 .2"):
            with self.subTest(label=label):
                with self.assertRaises(MendeleyRejected):
                    parse_yolo_labels(label, 100, 80)

    def test_missing_and_duplicate_image_label_pairs_rejected(self):
        (self.group / "labels" / "one.txt").unlink()
        with self.assertRaisesRegex(MendeleyRejected, "missing_or_ambiguous_yolo_label"):
            build_unassigned(self.root)
        (self.group / "labels" / "one.txt").write_text("0 .5 .5 .2 .2\n")
        (self.group / "images" / "one.png").write_bytes(PNG)
        with self.assertRaisesRegex(MendeleyRejected, "missing_or_ambiguous_yolo_label"):
            build_unassigned(self.root)

    def test_duplicate_identical_image_across_collection_groups_is_not_silently_merged(self):
        other = self.new_group(GROUPS[1])
        (other / "images" / "two.jpg").write_bytes(JPEG)
        (other / "labels" / "two.txt").write_text("0 .5 .5 .2 .2\n")
        with self.assertRaisesRegex(MendeleyRejected, "duplicate_image_across_hives"):
            build_unassigned(self.root)

    def test_unknown_group_and_unexpected_structure_are_rejected(self):
        (self.root / "unpublished").mkdir()
        with self.assertRaisesRegex(MendeleyRejected, "unknown_or_missing_hive_group"):
            build_unassigned(self.root)
        (self.root / "unpublished").rmdir()
        (self.group / "unexpected").mkdir()
        with self.assertRaisesRegex(MendeleyRejected, "expected_images_labels_directories"):
            build_unassigned(self.root)

    def test_symlink_input_files_are_rejected(self):
        src = self.group / "images" / "one.jpg"
        src.unlink()
        external = Path(self.tmp.name) / "external.jpg"
        external.write_bytes(JPEG)
        src.symlink_to(external)
        with self.assertRaisesRegex(MendeleyRejected, "missing_or_linked_file"):
            build_unassigned(self.root)

    def test_does_not_overwrite_output_or_publish_inside_source(self):
        before = (self.group / "images" / "one.jpg").read_bytes()
        out = Path(self.tmp.name) / "inventory.json"
        summary = publish_unassigned(self.root, out)
        self.assertTrue(summary["ok"])
        self.assertFalse(summary["trainingAuthorized"])
        self.assertFalse(summary["cleanupAuthorized"])
        self.assertEqual((self.group / "images" / "one.jpg").read_bytes(), before)
        self.assertEqual(json.loads(out.read_text())["info"]["split"], "unassigned")
        with self.assertRaisesRegex(MendeleyRejected, "output_exists"):
            publish_unassigned(self.root, out)
        with self.assertRaisesRegex(MendeleyRejected, "output_overlaps_source"):
            publish_unassigned(self.root, self.root / "invent.json")
        self.assertFalse((self.root / "invent.json").exists())

    def test_rejects_bad_jpeg_header_and_corrupt_png_crc(self):
        src = self.group / "images" / "one.jpg"
        src.write_bytes(b"\xff\xd8badimage")
        with self.assertRaisesRegex(MendeleyRejected, "image_header_invalid"):
            build_unassigned(self.root)
        src.unlink()
        (self.group / "images" / "one.png").write_bytes(PNG[:-1] + bytes([PNG[-1] ^ 1]))
        with self.assertRaisesRegex(MendeleyRejected, "image_header_invalid"):
            build_unassigned(self.root)


if __name__ == "__main__":
    unittest.main()
