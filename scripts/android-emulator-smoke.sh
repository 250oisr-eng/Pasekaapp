#!/usr/bin/env bash
set -euo pipefail

# P0 non-destructive Android emulator startup/offline/restart smoke.
# This MUST NOT run on a physical device, including a connected user phone.
APK="${1:-android/app/build/outputs/apk/debug/app-debug.apk}"
PACKAGE="ru.paseka.journal"
if [[ ! -f "$APK" ]]; then
  echo "BLOCKED: emulator APK is missing: $APK" >&2; exit 2
fi
if ! command -v adb >/dev/null 2>&1; then
  echo "BLOCKED: adb unavailable" >&2; exit 2
fi

mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')
if [[ "${#DEVICES[@]}" -ne 1 ]]; then
  echo "BLOCKED: exactly one test emulator is required; detected ${#DEVICES[@]} devices" >&2; exit 2
fi
SERIAL="${DEVICES[0]}"
if [[ ! "$SERIAL" =~ ^emulator-[0-9]+$ ]]; then
  echo "BLOCKED: non-emulator serial; refusing all device actions" >&2; exit 2
fi
adb_safe() { adb -s "$SERIAL" "$@"; }
QEMU="$(adb_safe shell getprop ro.kernel.qemu | tr -d '\r')"
API="$(adb_safe shell getprop ro.build.version.sdk | tr -d '\r')"
if [[ "$QEMU" != "1" || "$API" != "35" ]]; then
  echo "BLOCKED: not a verified Android 15 (API 35) emulator (qemu=$QEMU api=$API)" >&2
  exit 2
fi
echo "VERIFIED_TEST_EMULATOR=$SERIAL API=$API"
adb_safe install -r "$APK" >/dev/null

launch_and_verify() {
  local scenario="$1" output pid
  adb_safe shell am force-stop "$PACKAGE"
  output="$(adb_safe shell am start -W -n "${PACKAGE}/.MainActivity" 2>&1)"
  echo "$output"
  if ! grep -Eq 'Status: ok|Status: timeout' <<<"$output"; then
    echo "FAIL: cannot launch app ($scenario)" >&2; exit 1
  fi
  sleep 8
  pid="$(adb_safe shell pidof "$PACKAGE" | tr -d '\r' || true)"
  if [[ ! "$pid" =~ ^[0-9]+([[:space:]][0-9]+)*$ ]]; then
    echo "FAIL: app process exited after startup ($scenario)" >&2; exit 1
  fi
  echo "PASS: $scenario package_alive=true"
}

# Clear emulator-only logs for accurate app-process fatal checking.
adb_safe logcat -c
launch_and_verify "COLD_START_ON_EMULATOR"

# Simulate disconnected device with no host or user data access.
adb_safe shell svc wifi disable
adb_safe shell svc data disable
launch_and_verify "OFFLINE_RESTART_ON_EMULATOR"

if adb_safe logcat -d -s AndroidRuntime:E | grep -A 8 -B 2 "FATAL EXCEPTION" | grep -Fq "$PACKAGE"; then
  echo "FAIL: app AndroidRuntime fatal exception" >&2
  exit 1
fi
printf '%s\n' 'PASS: EMULATOR_ANDROID_35_LAUNCH_AND_OFFLINE_RESTART' \
  'UNVERIFIED: physical_device, indexeddb_byte_integrity, Gallery_Downloads_MediaStore, camera_permissions, original_deletion'
