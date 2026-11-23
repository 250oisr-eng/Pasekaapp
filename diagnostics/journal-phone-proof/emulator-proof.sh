#!/usr/bin/env bash
set -euo pipefail
package='ru.paseka.journal.journalproof'
apk="$(find diagnostic-artifact -type f -name app-debug.apk -print -quit)"
test -n "$apk" && test -f "$apk" || { echo 'DIAGNOSTIC_APK_NOT_FOUND'; exit 1; }
adb install -r "$apk"
adb shell pm path "$package" | grep -F 'package:'
adb shell monkey -p "$package" -c android.intent.category.LAUNCHER 1
sleep 35
adb exec-out screencap -p > journal-emulator-after-webview-reload.png
adb shell am force-stop "$package"
adb shell monkey -p "$package" -c android.intent.category.LAUNCHER 1
sleep 12
adb exec-out screencap -p > journal-emulator-after-process-restart.png
adb logcat -d -v brief > journal-emulator-log.txt
grep -F 'PASEKA_JOURNAL_PHYSICAL_RESULT' journal-emulator-log.txt | tail -n 8 > journal-emulator-proof-lines.txt || true
cat journal-emulator-proof-lines.txt
grep -F 'ISOLATED_JOURNAL_ANDROID_RESTART_ONLY' journal-emulator-proof-lines.txt | grep -F '"status":"PASS"' >/dev/null || { echo 'JOURNAL_EMULATOR_NOT_VERIFIED'; exit 1; }
echo 'PASS_JOURNAL_EMULATOR_DURABLE_RESTART'
