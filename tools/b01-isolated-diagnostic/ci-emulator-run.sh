#!/usr/bin/env bash
# CI only: synthetic Android emulator, no user files.
set -euo pipefail
test -f diagnostic-apk/app-debug.apk
adb_bin="$ANDROID_HOME/platform-tools/adb"
aapt_bin="$(find "$ANDROID_HOME/build-tools" -maxdepth 2 -name aapt -type f | sort -V | tail -n 1)"
test -x "$adb_bin"
test -x "$aapt_bin"
export B01_CI_ADB="$adb_bin"
export B01_CI_AAPT="$aapt_bin"
export B01_CI_APK="$GITHUB_WORKSPACE/diagnostic-apk/app-debug.apk"
node tools/b01-isolated-diagnostic/ci-real-adb-smoke.mjs
