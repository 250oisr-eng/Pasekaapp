import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
from convert_bee_voc_unassigned import ConversionRejected, build_unassigned, publish_unassigned, parse_annotation

JPEG=(b"\xff\xd8"+b"\xff\xe0\x00\x04AB"+
      b"\xff\xc0\x00\x0b\x08\x00\x50\x00\x64\x01\x01\x11\x00"+b"\xff\xd9")
XML=b"""<annotation><filename>bee.jpg</filename>
<size><width>100</width><height>80</height></size>
<object><name>bee</name><bndbox><xmin>10</xmin><ymin>20</ymin>
<xmax>40</xmax><ymax>50</ymax></bndbox></object></annotation>"""


class ConvertVocTests(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.root=Path(self.t.name)/"source"
        self.root.mkdir()
        (self.root/"bee.jpg").write_bytes(JPEG)
        (self.root/"bee.xml").write_bytes(XML)

    def test_coco_has_correct_absolute_pixel_bbox_but_no_split(self):
        r=build_unassigned(self.root)
        self.assertEqual(r["info"]["split"],"unassigned")
        self.assertFalse(r["info"]["trainingAuthorized"])
        self.assertEqual(r["images"][0]["file_name"],"bee.jpg")
        self.assertEqual(r["images"][0]["width"],100)
        self.assertEqual(r["images"][0]["height"],80)
        self.assertEqual(r["annotations"][0]["bbox"],[10.,20.,30.,30.])
        self.assertEqual(r["annotations"][0]["category_id"],1)

    def test_no_training_from_unknown_source_groups(self):
        out=Path(self.t.name)/"unassigned.json"
        before=(self.root/"bee.jpg").read_bytes()
        summary=publish_unassigned(self.root,out)
        self.assertTrue(summary["ok"])
        self.assertFalse(summary["trainingAuthorized"])
        self.assertFalse(summary["cleanupAuthorized"])
        self.assertEqual(before,(self.root/"bee.jpg").read_bytes())
        self.assertEqual(json.loads(out.read_text())["info"]["split"],"unassigned")
        with self.assertRaisesRegex(ConversionRejected,"output_already_exists"):
            publish_unassigned(self.root,out)

    def test_unknown_object_class_rejected_not_dropped(self):
        bad=XML.replace(b"<name>bee</name>",b"<name>wasp</name>")
        with self.assertRaisesRegex(ConversionRejected,"unknown_object_class"):
            parse_annotation(bad,"bee.jpg",100,80)

    def test_invalid_bbox_and_nan_rejected(self):
        for value in (b"140",b"-2",b"NaN"):
            bad=XML.replace(b"<xmax>40</xmax>",b"<xmax>"+value+b"</xmax>")
            with self.assertRaises(ConversionRejected):
                parse_annotation(bad,"bee.jpg",100,80)

    def test_xml_filename_and_jpeg_size_mismatch_rejected(self):
        with self.assertRaisesRegex(ConversionRejected,"xml_filename_mismatch"):
            parse_annotation(XML,"different.jpg",100,80)
        with self.assertRaisesRegex(ConversionRejected,"xml_jpeg_dimensions_mismatch"):
            parse_annotation(XML,"bee.jpg",101,80)

    def test_missing_pair_or_extra_unannotated_jpeg_rejected(self):
        (self.root/"bee.jpg").unlink()
        with self.assertRaises(ConversionRejected):
            build_unassigned(self.root)
        (self.root/"bee.jpg").write_bytes(JPEG)
        (self.root/"extra.jpg").write_bytes(JPEG)
        with self.assertRaisesRegex(ConversionRejected,"image_xml_count_mismatch"):
            build_unassigned(self.root)

    def test_doctype_and_xml_entities_rejected(self):
        payload=b'<!DOCTYPE annotation [<!ENTITY x "danger">]><annotation>&x;</annotation>'
        with self.assertRaisesRegex(ConversionRejected,"xml_unsafe"):
            parse_annotation(payload,"bee.jpg",100,80)

    def test_output_in_source_folder_is_forbidden(self):
        with self.assertRaisesRegex(ConversionRejected,"output_overlaps_source"):
            publish_unassigned(self.root,self.root/"unassigned.json")
        self.assertFalse((self.root/"unassigned.json").exists())


if __name__=="__main__":
    unittest.main()
