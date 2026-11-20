import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
sys.path.insert(0,str(Path(__file__).resolve().parent))
from sample_lila_five_pairs import inspect_representative_pairs,spread_indices,NETWORK_BUDGET
from sample_lila_voc_range import SampleRejected
from test_sample_lila_voc_range import FakeOpener,archive,XML,JPEG


def fixture():
    contents=[]
    for i in range(6):
        stem=f"ML-Data/Hive_{i:02d}"
        contents.append((stem+".xml",XML))
        contents.append((stem+".jpg",JPEG))
    return archive(contents)


class FivePairsTests(unittest.TestCase):
    def test_selected_indices_deterministic_and_well_spaced(self):
        self.assertEqual(spread_indices(6),[0,1,2,3,5])
        self.assertEqual(spread_indices(10),[0,2,4,6,9])
        with self.assertRaisesRegex(SampleRejected,"insufficient_sample_population"):
            spread_indices(4)

    def test_five_real_format_zip_pairs_are_audited_without_training_claim(self):
        client=FakeOpener(fixture())
        report=inspect_representative_pairs(client)
        self.assertEqual(report["populationXmlCandidates"],6)
        self.assertEqual(len(report["samplePairs"]),5)
        self.assertEqual(report["observedObjectsByClass"],{"bee":5})
        self.assertEqual(report["sampleXmlIndices"],[0,1,2,3,5])
        self.assertLess(report["rangeBytesFetched"],NETWORK_BUDGET)
        for x in report["samplePairs"]:
            self.assertEqual(x["width"],100)
            self.assertEqual(x["height"],80)
            self.assertEqual(x["objectsByClass"],{"bee":1})
            self.assertEqual(len(x["jpegSha256"]),64)
        for key in ("sourceVideoIdentityVerified","independentTrainTestSplitAvailable",
                    "jpegFullyDecoded","entireArchiveDownloaded","entireArchiveShaVerified",
                    "licenseVerified","trainingAuthorized","modelApproved",
                    "recognitionSucceeded","cleanupAuthorized"):
            self.assertFalse(report[key])

    def test_missing_jpeg_in_any_spaced_sample_rejected(self):
        entries=[]
        for i in range(5):
            stem=f"images/test_{i:02d}"
            entries.append((stem+".xml",XML))
            if i!=3:entries.append((stem+".jpg",JPEG))
        with self.assertRaisesRegex(SampleRejected,"jpeg_pair_missing"):
            inspect_representative_pairs(FakeOpener(archive(entries)))

    def test_wrong_jpeg_size_rejected_for_any_sample(self):
        bad=JPEG.replace(b"\x00\x64",b"\x00\x65")
        entries=[]
        for i in range(5):
            stem=f"images/test_{i:02d}"
            entries.extend([(stem+".xml",XML),(stem+".jpg",bad if i==2 else JPEG)])
        with self.assertRaisesRegex(SampleRejected,"jpeg_voc_dimensions_mismatch"):
            inspect_representative_pairs(FakeOpener(archive(entries)))

    def test_unsafe_pascal_filename_field_rejected(self):
        xml=XML.replace(b"<annotation>",b"<annotation><filename>different.jpg</filename>",1)
        entries=[]
        for i in range(5):
            stem=f"images/test_{i:02d}"
            entries.extend([(stem+".xml",xml if i==0 else XML),(stem+".jpg",JPEG)])
        with self.assertRaisesRegex(SampleRejected,"voc_filename_mismatch"):
            inspect_representative_pairs(FakeOpener(archive(entries)))

    def test_http_200_for_any_range_not_read(self):
        client=FakeOpener(fixture(),ignore_range=True)
        with self.assertRaisesRegex(SampleRejected,"range_response_not_partial"):
            inspect_representative_pairs(client)
        self.assertEqual(client.last.bytes_requested,0)


if __name__=="__main__":
    unittest.main()
