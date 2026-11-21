"""Mock-only tests: cannot access physical phone or write Android user files."""
import subprocess
import unittest
from tools.test_android_synthetic_archive_force_stop import (
    PACKAGE, NAME, CheckBlocked, generate_archive, digest, execute_test,
)


class FakeADB:
    def __init__(self, *, device_ok=True, sha_index_failure=None, launch_ok=True):
        self.calls = []
        self.device_ok = device_ok
        self.sha_index_failure = sha_index_failure
        self.launch_ok = launch_ok
        self.hash_calls = 0
        self.expected = digest(generate_archive()[0])

    def __call__(self, args, timeout=60):
        self.calls.append(tuple(args))
        if args == ["adb", "devices", "-l"]:
            answer = "List of devices attached\nfake123 device model:NE2213\n"
            if not self.device_ok:
                answer += "fake456 device model:other\n"
            return subprocess.CompletedProcess(args, 0, answer, "")
        if args[:4] == ["adb", "-d", "shell", "getprop ro.product.model"]:
            return subprocess.CompletedProcess(args, 0, "NE2213\n", "")
        if args[:4] == ["adb", "-d", "shell", "getprop ro.build.version.sdk"]:
            return subprocess.CompletedProcess(args, 0, "36\n", "")
        if args[:3] == ["adb", "-d", "shell"] and args[3] == "pm path " + PACKAGE:
            return subprocess.CompletedProcess(args, 0, f"package:/data/app/{PACKAGE}/base.apk\n", "")
        if args[:3] == ["adb", "-d", "shell"] and args[3].startswith("test -e "):
            return subprocess.CompletedProcess(args, 1, "", "")
        if args[:3] == ["adb", "-d", "shell"] and args[3].startswith("mkdir -p "):
            return subprocess.CompletedProcess(args, 0, "", "")
        if args[:3] == ["adb", "-d", "push"] and args[4].endswith(NAME):
            return subprocess.CompletedProcess(args, 0, "", "500 KB/s (500 bytes)\n")
        if args[:3] == ["adb", "-d", "shell"] and args[3].startswith("sha256sum "):
            self.hash_calls += 1
            sha = self.expected
            if self.hash_calls == self.sha_index_failure:
                sha = "0" * 64
            return subprocess.CompletedProcess(args, 0, f"{sha}  archive\n", "")
        if args[:3] == ["adb", "-d", "shell"] and args[3] == "am force-stop " + PACKAGE:
            return subprocess.CompletedProcess(args, 0, "", "")
        if args[:3] == ["adb", "-d", "shell"] and args[3].startswith("monkey -p " + PACKAGE):
            return subprocess.CompletedProcess(args, 0,
                "Events injected: 1\n" if self.launch_ok else "Events injected: 0\n", "")
        raise AssertionError(f"Unexpected ADB command {args!r}")

    @property
    def actions(self):
        return " ".join(" ".join(cmd) for cmd in self.calls)


class IsolatedSyntheticArchiveTests(unittest.TestCase):
    TOKEN = "d" * 32

    def test_two_distinct_synthetic_video_blob_hashes_and_paseka01(self):
        archive, video_shas = generate_archive()
        self.assertTrue(archive.startswith(b"PASEKA01"))
        self.assertEqual(len(video_shas), 2)
        self.assertNotEqual(video_shas[0], video_shas[1])
        self.assertIn(b"synthetic-stand-in-1.mp4", archive)
        self.assertIn(b"synthetic-stand-in-2.mp4", archive)

    def test_one_unique_remote_archive_survives_stop_and_restart(self):
        fake = FakeADB()
        result = execute_test(execute=fake, token=self.TOKEN)
        self.assertEqual(result["status"], "EXTERNAL_TWO_BLOB_SHA_PASS")
        self.assertEqual(result["syntheticVideoBlobs"], 2)
        self.assertEqual(fake.hash_calls, 3)
        self.assertEqual(fake.actions.count("am force-stop "), 1)
        self.assertEqual(fake.actions.count("adb -d push "), 1)
        self.assertTrue(result["remoteTestArchive"].endswith(f"/{self.TOKEN}/{NAME}"))
        self.assertFalse(result["indexedDbRestoreTested"])
        self.assertFalse(result["appExportWithVideosTested"])
        self.assertFalse(result["videoBytesArePlayable"])
        self.assertFalse(result["removedAndroidFiles"])
        for forbidden in ("pm clear", "uninstall", " shell rm ", "delete", "recovery", "wipe"):
            self.assertNotIn(forbidden, fake.actions)

    def test_multi_device_fails_before_any_android_write(self):
        fake = FakeADB(device_ok=False)
        with self.assertRaises(CheckBlocked):
            execute_test(execute=fake, token=self.TOKEN)
        self.assertNotIn("mkdir -p", fake.actions)
        self.assertNotIn("force-stop", fake.actions)

    def test_invalid_token_blocks_without_any_android_action(self):
        fake = FakeADB()
        with self.assertRaises(CheckBlocked):
            execute_test(execute=fake, token="../escape")
        self.assertNotIn("mkdir -p", fake.actions)
        self.assertNotIn("force-stop", fake.actions)

    def test_bad_source_digest_pre_stop_never_stops_app(self):
        fake = FakeADB(sha_index_failure=1)
        with self.assertRaises(CheckBlocked):
            execute_test(execute=fake, token=self.TOKEN)
        self.assertNotIn("force-stop", fake.actions)

    def test_changed_remote_bytes_after_stop_cannot_pass(self):
        fake = FakeADB(sha_index_failure=2)
        with self.assertRaises(CheckBlocked):
            execute_test(execute=fake, token=self.TOKEN)
        self.assertEqual(fake.hash_calls, 2)
        self.assertNotIn("monkey -p", fake.actions)

    def test_failed_relaunch_not_reported_as_success(self):
        fake = FakeADB(launch_ok=False)
        with self.assertRaises(CheckBlocked):
            execute_test(execute=fake, token=self.TOKEN)
        self.assertEqual(fake.hash_calls, 2)


if __name__ == "__main__":
    unittest.main()
