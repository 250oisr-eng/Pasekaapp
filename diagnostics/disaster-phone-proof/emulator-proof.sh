#!/usr/bin/env bash
set -euo pipefail
package='ru.paseka.journal.disasterproof'
apk="$(find diagnostic-artifact -type f -name app-debug.apk -print -quit)"
test -n "$apk" && test -f "$apk" || { echo 'P0_APK_MISSING'; exit 1; }
adb install -r "$apk"
adb shell pm path "$package" | grep -F 'package:'
adb shell monkey -p "$package" -c android.intent.category.LAUNCHER 1
sleep 25
adb exec-out screencap -p > disaster-emulator-first.png
adb logcat -d -v brief > disaster-emulator-before.log
grep -F 'PASEKA_P0_DISASTER_PROOF_RESULT' disaster-emulator-before.log | tail -n 5 > disaster-emulator-first-result.txt || true
grep -F 'P0_DISASTER_WEBVIEW_RESTORE_PASS' disaster-emulator-first-result.txt | grep -F '"status":"PASS"' >/dev/null || { cat disaster-emulator-first-result.txt; echo P0_EMULATOR_RESTORE_BLOCKED; exit 1; }
adb shell am force-stop "$package"
adb shell monkey -p "$package" -c android.intent.category.LAUNCHER 1
sleep 15
adb exec-out screencap -p > disaster-emulator-restart.png
adb logcat -d -v brief > disaster-emulator-after.log
grep -F 'PASEKA_P0_DISASTER_PROOF_RESULT' disaster-emulator-after.log | tail -n 8 > disaster-emulator-restart-result.txt || true
grep -F 'P0_DISASTER_PHYSICAL_RESTART_PASS' disaster-emulator-restart-result.txt | grep -F '"status":"PASS"' >/dev/null || { cat disaster-emulator-restart-result.txt; echo P0_EMULATOR_RESTART_BLOCKED; exit 1; }
echo PASS_P0_ANDROID_EMULATOR_DISASTER_RESTORE_AND_RESTART
