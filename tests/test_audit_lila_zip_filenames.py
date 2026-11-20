import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
from audit_lila_zip_filenames import audit_entries


def item(name):
    return {"name":name}


class FilenameAuditTests(unittest.TestCase):
    def test_all_same_stem_jpg_and_xml_are_paired(self):
        files=[item(f"hive/A{i}.xml") for i in range(5)]
        files.extend(item(f"hive/A{i}.jpg") for i in range(5))
        r=audit_entries(files)
        self.assertEqual(r["vocCount"],5)
        self.assertEqual(r["jpegCount"],5)
        self.assertEqual(r["exactPairCount"],5)
        self.assertEqual(r["xmlWithoutExactJpegCount"],0)
        self.assertEqual(r["jpegWithoutExactXmlCount"],0)
        self.assertEqual([x["matchingJpegEntries"] for x in r["fiveSelectedXmlEntries"]],[1]*5)
        for k in ("originalVideoIdentityVerified","filenameGroupingVerified","trainingSplitAvailable",
                  "archiveDownloaded","licenseVerified","trainingAuthorized",
                  "recognitionSucceeded","cleanupAuthorized"):
            self.assertFalse(r[k])

    def test_detect_missing_jpeg_for_one_xml(self):
        files=[item(f"hive/A{i}.xml") for i in range(5)]
        files.extend(item(f"hive/A{i}.jpg") for i in range(4))
        r=audit_entries(files)
        self.assertEqual(r["exactPairCount"],4)
        self.assertEqual(r["xmlWithoutExactJpegCount"],1)
        self.assertEqual(r["unmatchedXmlExamples"],["hive/A4.xml"])

    def test_detect_jpeg_without_xml(self):
        files=[item(f"hive/A{i}.xml") for i in range(5)]
        files.extend(item(f"hive/A{i}.jpg") for i in range(5))
        files.append(item("hive/no_ann.jpg"))
        r=audit_entries(files)
        self.assertEqual(r["jpegWithoutExactXmlCount"],1)
        self.assertEqual(r["unmatchedJpegExamples"],["hive/no_ann.jpg"])

    def test_two_jpeg_extensions_for_same_stem_are_ambiguous(self):
        files=[item(f"hive/A{i}.xml") for i in range(5)]
        files.extend(item(f"hive/A{i}.jpg") for i in range(5))
        files.append(item("hive/A1.jpeg"))
        r=audit_entries(files)
        self.assertEqual(r["xmlWithAmbiguousJpegCount"],1)
        self.assertEqual(r["ambiguousXmlExamples"],["hive/A1.xml"])

    def test_returned_examples_are_bounded(self):
        files=[item(f"hive/A{i:03d}.xml") for i in range(30)]
        r=audit_entries(files)
        self.assertEqual(len(r["unmatchedXmlExamples"]),12)
        self.assertEqual(r["xmlWithoutExactJpegCount"],30)
        self.assertFalse(r["trainingAuthorized"])


if __name__=="__main__":
    unittest.main()
