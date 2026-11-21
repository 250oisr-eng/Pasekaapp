import subprocess
import unittest
from tools.check_android_archive_after_stop import check, PACKAGE

NAME = "paseka-full-backup-2026-11-21 (1).paseka"
DIGEST = "a" * 64


class StopCheckTests(unittest.TestCase):
    def scenario(self, results, name=NAME):
        calls = []
        def run(*args):
            calls.append(args)
            code, stdout, stderr = results.pop(0)
            return subprocess.CompletedProcess(args, code, stdout, stderr)
        return calls, lambda: check(name, DIGEST, run)

    def replies(self):
        return [(0, "321", ""), (0, "PASEKA02", ""), (0, DIGEST + "  archive", ""),
                (0, "", ""), (1, "", ""), (0, "PASEKA02", ""),
                (0, DIGEST + "  archive", ""), (1, "", "")]

    def test_hashes_same_external_file_on_both_sides_of_stop(self):
        calls, execute = self.scenario(self.replies())
        self.assertFalse(execute()["indexedDbRestoreTested"])
        path = "/sdcard/Download/Пасека/" + NAME
        self.assertEqual(calls, [("pidof", PACKAGE), ("head", "-c", "8", path),
            ("sha256sum", path), ("am", "force-stop", PACKAGE), ("pidof", PACKAGE),
            ("head", "-c", "8", path), ("sha256sum", path), ("pidof", PACKAGE)])

    def test_bad_name_never_touches_device(self):
        calls, execute = self.scenario([], "../" + NAME)
        with self.assertRaises(ValueError):
            execute()
        self.assertFalse(calls)

    def test_failed_prerequisite_never_stops_app(self):
        for index, reply in [(0, (1, "", "")), (1, (0, "PASEKA01", "")), (2, (0, "wrong", ""))]:
            results = self.replies()
            results[index] = reply
            calls, execute = self.scenario(results)
            with self.assertRaises(ValueError):
                execute()
            self.assertNotIn(("am", "force-stop", PACKAGE), calls)

    def test_stop_failure_restart_changed_bytes_or_disconnect_cannot_pass(self):
        for index, reply in [(3, (1, "", "")), (4, (0, "322", "")), (4, (1, "", "offline")),
                             (5, (1, "", "")), (6, (0, "changed", "")), (7, (0, "323", ""))]:
            results = self.replies()
            results[index] = reply
            _, execute = self.scenario(results)
            with self.assertRaises(ValueError):
                execute()
