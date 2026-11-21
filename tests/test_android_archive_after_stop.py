import subprocess
from unittest.mock import patch
import unittest
from tools.check_android_archive_after_stop import check, PACKAGE, adb_shell

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


    def test_invalid_sha_or_date_never_touches_device(self):
        for name, digest in [
            ("paseka-full-backup-2026-02-30.paseka", DIGEST),
            (NAME, "A" * 64),
            (NAME, "a" * 63),
            (NAME, "a" * 64 + "0"),
        ]:
            calls = []
            def run(*args):
                calls.append(args)
                raise AssertionError("ADB must not be called for invalid input")
            with self.subTest(name=name, digest=digest):
                with self.assertRaises(ValueError):
                    check(name, digest, run)
                self.assertFalse(calls)

    def test_pidof_malformed_or_diagnostic_stderr_blocks_stop(self):
        for reply in [(0, "321; echo unsafe", ""), (0, "0", ""),
                      (0, "321", "warning"), (0, "", "")]:
            results = self.replies()
            results[0] = reply
            calls, execute = self.scenario(results)
            with self.subTest(reply=reply):
                with self.assertRaises(ValueError):
                    execute()
                self.assertNotIn(("am", "force-stop", PACKAGE), calls)

    def test_missing_or_wrong_second_hash_never_reports_success(self):
        for bad in [(1, "", "missing"), (0, "b" * 64 + "  archive", ""),
                    (0, "", "")]:
            results = self.replies()
            results[6] = bad
            calls, execute = self.scenario(results)
            with self.subTest(reply=bad):
                with self.assertRaises(ValueError):
                    execute()
                self.assertEqual(calls.count(("am", "force-stop", PACKAGE)), 1)


    def test_adb_shell_uses_usb_only_and_quotes_android_filename(self):
        filename = "/sdcard/Download/Пасека/paseka-full-backup-2026-11-21 (1).paseka"
        with patch("tools.check_android_archive_after_stop.subprocess.run") as execute:
            execute.return_value = subprocess.CompletedProcess([], 0, "PASEKA02", "")
            answer = adb_shell("head", "-c", "8", filename)
            args, kwargs = execute.call_args
            self.assertEqual(args[0][:3], ["adb", "-d", "shell"])
            self.assertIn("'"+filename+"'", args[0][3])
            self.assertTrue(kwargs["capture_output"])
            self.assertTrue(kwargs["text"])
            self.assertFalse(kwargs["check"])
            self.assertEqual(kwargs["timeout"], 90)
            self.assertEqual(answer.stdout, "PASEKA02")

    def test_stderr_during_post_stop_read_fails_closed(self):
        results = self.replies()
        results[5] = (0, "PASEKA02", "read warning")
        calls, execute = self.scenario(results)
        with self.assertRaises(ValueError):
            execute()
        self.assertEqual(calls.count(("am", "force-stop", PACKAGE)), 1)
