#!/usr/bin/env bash
set -euo pipefail

APK_PATH="${1:?Usage: android-emulator-smoke.sh <apk-path> <api-level>}"
API_LEVEL="${2:?Usage: android-emulator-smoke.sh <apk-path> <api-level>}"
PACKAGE_NAME="ru.paseka.journal"

adb install "$APK_PATH"
adb logcat -c
adb shell monkey -p "$PACKAGE_NAME" 1
sleep 20

APP_PID="$(adb shell pidof "$PACKAGE_NAME" | tr -d '\r' || true)"
if [[ -z "$APP_PID" ]]; then
  echo "Paseka process is not running after launch"
  adb logcat -d -t 5000
  exit 1
fi

CRASH_LOG="$(adb logcat -d -t 5000 | grep -E 'FATAL EXCEPTION|Fatal signal [0-9]+ \(' | grep -E 'ru\.paseka\.journal|Process: ru\.paseka\.journal' || true)"
if [[ -n "$CRASH_LOG" ]]; then
  printf '%s\n' "$CRASH_LOG"
  echo "Fatal app crash detected"
  exit 1
fi

echo "Paseka launch smoke test passed on API $API_LEVEL (pid $APP_PID)"
