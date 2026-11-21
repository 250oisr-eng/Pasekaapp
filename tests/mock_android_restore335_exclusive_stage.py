"""The retired command must block both default and explicitly supplied ADB."""
import os
from pathlib import Path
import subprocess
import tempfile

script = Path(__file__).resolve().parents[1] / "tools/android-restore335-modern-adb-exclusive-stage.ps1"
with tempfile.TemporaryDirectory() as temp:
    directory = Path(temp)
    adb = directory / "adb"
    marker = directory / "device-command-called"
    adb.write_text('#!/bin/sh\ntouch "$ADB_CALL_MARKER"\nexit 1\n', encoding="utf8")
    adb.chmod(0o755)
    env = {**os.environ, "ADB_CALL_MARKER": str(marker),
           "PATH": temp + os.pathsep + os.environ["PATH"]}
    for args in ([], ["-AdbPath", str(adb)]):
        result = subprocess.run(["pwsh", "-NoProfile", "-File", str(script), *args],
                                capture_output=True, text=True, env=env, timeout=15)
        assert result.returncode == 2, result
        assert "STATUS: BLOCKED" in result.stdout
        assert "RESTORE335_DD_CONV_EXCL_REJECTED_ON_NE2213" in result.stdout
        assert "ANDROID_PRIVATE_WRITE: NOT_ATTEMPTED" in result.stdout
        assert not marker.exists(), "retired script invoked adb"
