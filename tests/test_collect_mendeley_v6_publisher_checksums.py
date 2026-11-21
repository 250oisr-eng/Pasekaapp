import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from collect_mendeley_v6_publisher_checksums import collect, publish, repository_requests

ROOT, GROUP, FOLDER, FILE, CONTENT = [str(UUID(int=i)) for i in range(1, 6)]
GROUP_NAME = "_bee_20230609a"
NAME = "20230609a1002.jpg"
BASE = "https://data.mendeley.com/public-files/datasets/8gb9r2yhfc/files/"


class PublisherCollectorTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.folders = [
            {"id": ROOT, "name": "detection"},
            {"id": GROUP, "parent_id": ROOT, "name": GROUP_NAME},
            {"id": FOLDER, "parent_id": GROUP, "name": "images"},
        ]
        self.item = {"id": FILE, "folder_id": FOLDER, "filename": NAME, "status": "COMPLETED",
                     "size": 5, "content_details": {"id": CONTENT, "size": 5,
                     "sha256_hash": "f" * 64, "download_url": BASE + FILE + "/file_downloaded",
                     "view_url": "https://example.invalid/private?token=secret"}}
        self.wanted = {FILE: (GROUP_NAME, "images", NAME)}
        self.write("folders.json", self.folders)
        self.page = FOLDER + "-0.json"
        self.write(self.page, [self.item])

    def write(self, name, data):
        (self.root / name).write_text(json.dumps(data))

    def test_projection_and_atomic_no_overwrite(self):
        rows = collect(self.root, self.wanted)
        self.assertEqual(rows, [(FILE, NAME, FOLDER, CONTENT, 5, "f" * 64, "listed_v6")])
        path = self.root / "publisher.csv"
        publish(rows, path)
        result = path.read_bytes()
        self.assertNotIn(b"token", result)
        self.assertNotIn(b"https:", result)
        with self.assertRaises(FileExistsError):
            publish([], path)
        self.assertEqual(path.read_bytes(), result)

    def test_ambiguous_folder_and_absent_detection_root(self):
        for changed in (self.folders + [dict(self.folders[-1], id=str(UUID(int=99)))],
                        [dict(self.folders[0], name="segmentation"), *self.folders[1:]]):
            with self.subTest(changed=changed):
                self.write("folders.json", changed)
                with self.assertRaises((ValueError, KeyError)):
                    collect(self.root, self.wanted)

    def test_wrong_folder_filename_and_duplicate_or_missing_file(self):
        for items in ([dict(self.item, folder_id=GROUP)], [dict(self.item, filename="other.jpg")],
                      [dict(self.item, status="PENDING")], [self.item, self.item], []):
            with self.subTest(items=items):
                self.write(self.page, items)
                with self.assertRaises(ValueError):
                    collect(self.root, self.wanted)

    def test_reject_bad_content_metadata(self):
        for patch in ({"id": "broken"}, {"sha256_hash": "G" * 64}, {"size": 4},
                      {"size": True}, {"download_url": BASE + GROUP + "/file_downloaded"}):
            with self.subTest(patch=patch):
                item = copy.deepcopy(self.item)
                item["content_details"].update(patch)
                self.write(self.page, [item])
                with self.assertRaises(ValueError):
                    collect(self.root, self.wanted)

    def test_requested_file_on_second_page(self):
        unrelated = [dict(self.item, id=str(UUID(int=100 + i))) for i in range(1000)]
        self.write(self.page, unrelated)
        with self.assertRaises(FileNotFoundError):
            collect(self.root, self.wanted)
        self.write(FOLDER + "-1000.json", [self.item])
        self.assertEqual(collect(self.root, self.wanted)[0][0], FILE)

    def test_symlink_input_rejected(self):
        path = self.root / self.page
        real = path.rename(self.root / "elsewhere")
        try:
            path.symlink_to(real)
        except OSError:
            self.skipTest("symlinks unavailable")
        with self.assertRaises(ValueError):
            collect(self.root, self.wanted)

    def test_registry_includes_quarantined_and_historical_files(self):
        wanted = repository_requests()
        self.assertEqual(len(wanted), 192)
        self.assertEqual(len({info[2] for info in wanted.values()}), 192)


if __name__ == "__main__":
    unittest.main()
