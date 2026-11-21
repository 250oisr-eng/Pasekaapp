"""Isolated Android PASEKA01 external-archive force-stop test; synthetic bytes only.

Creates exactly one fresh, non-overwriting archive in a dedicated USB test folder.
No IndexedDB interaction; no video deletion; never addresses the production app.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import uuid

PACKAGE = "ru.paseka.journal.archive.test"
ROOT = "/sdcard/Download/Пасека/isolated-archive-synthetic-tests"
NAME = "synthetic-two-video.paseka"
CHUNK = 1024 * 1024
VIDEO_BYTES = (
    b"PASEKA SYNTHETIC VIDEO BLOB A -- NOT A CAMERA VIDEO\n" * 5,
    b"PASEKA SYNTHETIC VIDEO BLOB B -- NOT A CAMERA VIDEO\n" * 7,
)
# Bytes above are distinct synthetic stand-ins for original videos, not decodable MP4.
SHA_PATTERN = re.compile(r"^[a-f0-9]{64}$")


class CheckBlocked(Exception):
    pass


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def generate_archive() -> tuple[bytes, tuple[str, str]]:
    state = json.dumps(
        {"app": "Paseka", "state": {"meta": {"schemaVersion": 15}, "hives": []}},
        separators=(",", ":"), ensure_ascii=False,
    ).encode("utf-8")
    created_at = "2026-11-21T00:00:00.000Z"
    entries = [{
        "path": "state.json", "kind": "state", "size": len(state),
        "mimeType": "application/json", "chunkSize": CHUNK,
        "chunkSha256": [digest(state)],
    }]
    for index, video in enumerate(VIDEO_BYTES, 1):
        entries.append({
            "path": f"entrance-media/{index:06d}.blob", "kind": "entrance_video",
            "size": len(video), "mimeType": "video/mp4", "chunkSize": CHUNK,
            "chunkSha256": [digest(video)],
            "metadata": {
                "id": f"isolated-synthetic-video-{index}",
                "hiveId": "isolated-synthetic-hive",
                "capturedAt": created_at, "durationSec": 1,
                "width": 16, "height": 16, "bytes": len(video),
                "mimeType": "video/mp4", "name": f"synthetic-stand-in-{index}.mp4",
                "status": "waiting_for_server",
            }
        })
    manifest = {
        "format": "paseka-archive", "version": 1,
        "backupId": "isolated-synthetic-two-video-fixture",
        "createdAt": created_at, "schemaVersion": 15, "entries": entries,
    }
    encoded = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    archive = b"PASEKA01" + len(encoded).to_bytes(4, "little") + encoded + state + b"".join(VIDEO_BYTES)
    assert len(VIDEO_BYTES) == 2 and digest(VIDEO_BYTES[0]) != digest(VIDEO_BYTES[1])
    assert len(archive) < 1048576
    return archive, (digest(VIDEO_BYTES[0]), digest(VIDEO_BYTES[1]))


def run_command(args: list[str], *, timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8",
                          errors="replace", check=False, timeout=timeout)


def adb_shell(command: str, execute=run_command) -> subprocess.CompletedProcess:
    return execute(["adb", "-d", "shell", command])


def require_ok(args: list[str], execute=run_command, timeout: int = 60) -> str:
    reply = execute(args, timeout=timeout)
    if reply.returncode != 0:
        raise CheckBlocked(f"Command failed (exit {reply.returncode}): {args[1:4]!r}")
    # Native ADB may report progress on stderr even with exit=0.
    return reply.stdout.strip()


def verify_devices(execute=run_command):
    reply = execute(["adb", "devices", "-l"], timeout=30)
    if reply.returncode:
        raise CheckBlocked("adb devices failed")
    devices = [line for line in reply.stdout.splitlines()
               if re.match(r"^\S+\s+(?:device|offline|unauthorized|recovery|sideload)\b", line)]
    if len(devices) != 1 or not re.match(r"^\S+\s+device\b", devices[0]):
        raise CheckBlocked("Exactly one authorized USB Android device is required")
    model = require_ok(["adb", "-d", "shell", "getprop ro.product.model"], execute)
    api = require_ok(["adb", "-d", "shell", "getprop ro.build.version.sdk"], execute)
    if not api.isdecimal() or int(api) < 35:
        raise CheckBlocked("Android API 35+ required")
    pkg = require_ok(["adb", "-d", "shell", f"pm path {PACKAGE}"], execute)
    if not pkg.startswith("package:/data/app/"):
        raise CheckBlocked("Expected isolated Android archive test APK not installed")
    return model, api


def shell_required(command: str, execute=run_command) -> str:
    return require_ok(["adb", "-d", "shell", command], execute)


def check_sha(path: str, expected: str, execute=run_command) -> None:
    response = shell_required("sha256sum " + shlex.quote(path), execute)
    first = response.split()
    if not first or not SHA_PATTERN.fullmatch(first[0]) or first[0] != expected:
        raise CheckBlocked("Remote file SHA-256 does not equal pre-upload fixture SHA")


def execute_test(execute=run_command, token: str | None = None) -> dict:
    # Fail before any Android write if fixture cannot be generated or device is ambiguous.
    archive, video_shas = generate_archive()
    source_sha = digest(archive)
    model, api = verify_devices(execute)
    token = token or uuid.uuid4().hex
    if not re.fullmatch(r"[a-f0-9]{32}", token):
        raise CheckBlocked("Invalid synthetic test directory token")
    test_dir = ROOT + "/" + token
    remote = test_dir + "/" + NAME
    # Do not reuse any existing directory or overwrite any file.
    exists = adb_shell("test -e " + shlex.quote(test_dir), execute)
    if exists.returncode != 1 or exists.stdout.strip() or exists.stderr.strip():
        raise CheckBlocked("Test destination already exists or could not be checked")
    with tempfile.TemporaryDirectory(prefix="paseka-synthetic-test-") as scratch:
        local = Path(scratch) / NAME
        local.write_bytes(archive)
        if digest(local.read_bytes()) != source_sha:
            raise CheckBlocked("Local synthetic fixture changed before transfer")
        # This is the first write to Android: a new dedicated test directory only.
        shell_required("mkdir -p " + shlex.quote(test_dir), execute)
        require_ok(["adb", "-d", "push", str(local), remote], execute, timeout=120)
        check_sha(remote, source_sha, execute)
        # Only the uniquely named isolated test process is stopped.
        shell_required("am force-stop " + PACKAGE, execute)
        check_sha(remote, source_sha, execute)
        # Relaunch explicitly identified isolated test package, then verify again.
        launch = require_ok(["adb", "-d", "shell",
                             "monkey -p " + PACKAGE + " -c android.intent.category.LAUNCHER 1"], execute)
        if "Events injected: 1" not in launch:
            raise CheckBlocked("Isolated test app relaunch was not confirmed")
        check_sha(remote, source_sha, execute)
    return {
        "status": "EXTERNAL_TWO_BLOB_SHA_PASS",
        "device": model, "api": api,
        "package": PACKAGE, "format": "PASEKA01",
        "syntheticVideoBlobs": 2,
        "syntheticBlobSHA256": list(video_shas),
        "archiveSHA256BeforeUpload": source_sha,
        "archiveSHA256AfterStopAndRelaunch": source_sha,
        "remoteTestArchive": remote,
        "indexedDbRestoreTested": False,
        "appExportWithVideosTested": False,
        "videoBytesArePlayable": False,
        "externalGalleryCopiesTested": False,
        "removedAndroidFiles": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", choices=["json"], default="json")
    parser.parse_args()
    try:
        print(json.dumps(execute_test(), ensure_ascii=False, sort_keys=True))
    except (CheckBlocked, OSError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({"status": "BLOCKED", "reason": str(exc),
                          "androidDataDeleted": False}, ensure_ascii=False))
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
