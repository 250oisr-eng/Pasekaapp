import tempfile
import unittest
import zipfile
from pathlib import Path
from inspect_bee_archive import ArchiveRejected,inspect_archive

class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.td=tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.path=Path(self.td.name)/'test.zip'
    def make_zip(self,files):
        with zipfile.ZipFile(self.path,'w',zipfile.ZIP_DEFLATED) as z:
            for name,value in files:
                z.writestr(name,value)
    def test_readonly_inventory_and_no_permissions(self):
        self.make_zip([('LICENSE.txt','CC BY 4.0'),('images/a.jpg',b'fake jpg')])
        r=inspect_archive(self.path)
        self.assertEqual(r['fileCount'],2)
        self.assertEqual(r['licenseDocumentCandidates'],['LICENSE.txt'])
        for k in ('licenseVerified','trainingAuthorized','modelApproved','recognitionSucceeded','cleanupAuthorized'):
            self.assertFalse(r[k])
        self.assertTrue(self.path.exists())
        self.assertFalse((Path(self.td.name)/'images').exists())
    def test_traversal_absolute_and_backslash_rejected(self):
        for bad in ('../secret.txt','/root/test','images/../test','x\\y','C:drive.txt'):
            self.make_zip([(bad,'secret')])
            with self.assertRaisesRegex(ArchiveRejected,'unsafe_entry_name'):
                inspect_archive(self.path)
    def test_duplicate_casefold_rejected(self):
        self.make_zip([('img/A.JPG','x'),('img/a.jpg','y')])
        with self.assertRaisesRegex(ArchiveRejected,'duplicate_or_case_conflicting_name'):
            inspect_archive(self.path)
    def test_symlink_rejected(self):
        zinfo=zipfile.ZipInfo('images/link')
        zinfo.create_system=3
        zinfo.external_attr=(0o120777<<16)
        with zipfile.ZipFile(self.path,'w') as z:
            z.writestr(zinfo,'target')
        with self.assertRaisesRegex(ArchiveRejected,'symlink_not_allowed'):
            inspect_archive(self.path)
    def test_compression_bomb_rejected(self):
        self.make_zip([('many-zeroes.bin',b'0'*(2*1024*1024))])
        with self.assertRaisesRegex(ArchiveRejected,'compression_ratio_excessive'):
            inspect_archive(self.path)
    def test_bad_zip_rejected(self):
        self.path.write_bytes(b'bad zip')
        with self.assertRaisesRegex(ArchiveRejected,'not_zip_archive'):
            inspect_archive(self.path)

if __name__=='__main__':
    unittest.main()
