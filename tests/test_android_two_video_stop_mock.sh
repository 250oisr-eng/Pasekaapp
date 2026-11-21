#!/usr/bin/env bash
# All ADB calls simulated: this CI test never contacts a physical phone.
set -euo pipefail
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
export MOCK_REMOTE_FILE="$scratch/remote.paseka"
export MOCK_AUDIT_FILE="$scratch/adb_calls.txt"
export MOCK_STOP_MARKER="$scratch/stopped"
export MOCK_MODE=""
cat > "$scratch/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$MOCK_AUDIT_FILE"
case "$*" in
  "devices -l")
    printf 'List of devices attached\nmock123 device product:test model:NE2213\n'
    if [[ "$MOCK_MODE" == "two_devices" ]]; then
      echo 'mock456 device model:other'
    fi
    ;;
  "-d shell getprop ro.product.model") echo NE2213 ;;
  "-d shell getprop ro.build.version.sdk") echo 36 ;;
  "-d shell pm path ru.paseka.journal.archive.test")
    echo 'package:/data/app/mock/ru.paseka.journal.archive.test/base.apk' ;;
  "-d shell test -e "*) exit 1 ;;
  "-d shell mkdir -p "*) : ;;
  "-d push "*)
    if [[ "$#" -ne 4 || ! -f "$3" ]]; then echo 'Bad ADB push arguments' >&2; exit 14; fi
    cp "$3" "$MOCK_REMOTE_FILE"
    echo "12 KB/s (2222 bytes in 0.100s)" >&2
    ;;
  "-d shell sha256sum "*)
    if [[ ! -f "$MOCK_REMOTE_FILE" ]]; then exit 15; fi
    if [[ "$MOCK_MODE" == "changed_after_stop" && -f "$MOCK_STOP_MARKER" ]]; then
       printf '%064d  mock\n' 0
    else
       sha256sum "$MOCK_REMOTE_FILE"
    fi
    ;;
  "-d shell monkey -p ru.paseka.journal.archive.test -c android.intent.category.LAUNCHER 1")
    echo 'Events injected: 1' ;;
  "-d shell am force-stop ru.paseka.journal.archive.test")
    touch "$MOCK_STOP_MARKER" ;;
  "-d shell pidof ru.paseka.journal.archive.test") exit 1 ;;
  *) echo "Unexpected ADB command: $*" >&2; exit 77 ;;
esac
ADB
chmod +x "$scratch/adb"
export PATH="$scratch:$PATH"
if ! timeout 25s pwsh -NoProfile -File tools/android_synthetic_two_video_stop.ps1 > "$scratch/pass.txt" 2>&1; then
    echo "Mock ADB calls before failure:" >&2
    tail -30 "$MOCK_AUDIT_FILE" >&2 || true
    cat "$scratch/pass.txt" >&2
    exit 1
fi
grep -Fq 'STATUS: EXTERNAL_TWO_BLOB_SHA_PASS' "$scratch/pass.txt"
grep -Fq 'SYNTHETIC_BLOBS: 2 (NOT playable videos)' "$scratch/pass.txt"
grep -Fq 'ANDROID_COPY_AFTER_STOP: PASS' "$scratch/pass.txt"
grep -Fq 'INDEXEDDB_AND_APP_EXPORT_WITH_VIDEOS: NOT TESTED' "$scratch/pass.txt"
if grep -Ei '(^| )rm |pm clear|uninstall|wipe' "$MOCK_AUDIT_FILE"; then
    echo 'Disallowed destructive Android command observed' >&2
    exit 1
fi
echo 'Synthetic two-blob external stop/restart mock PASS'
: > "$MOCK_AUDIT_FILE"
export MOCK_MODE=two_devices
if timeout 25s pwsh -NoProfile -File tools/android_synthetic_two_video_stop.ps1 > "$scratch/two.txt" 2>&1; then
    echo 'Two Android devices incorrectly passed' >&2
    exit 1
fi
grep -Fq 'STATUS: BLOCKED' "$scratch/two.txt"
if grep -Fq 'mkdir -p' "$MOCK_AUDIT_FILE"; then
    echo 'Two devices wrote Android test directory' >&2
    exit 1
fi
echo 'Two-device fail-closed mock PASS'
export MOCK_MODE=changed_after_stop
rm -f "$MOCK_STOP_MARKER"
: > "$MOCK_AUDIT_FILE"
if timeout 25s pwsh -NoProfile -File tools/android_synthetic_two_video_stop.ps1 > "$scratch/changed.txt" 2>&1; then
    echo 'Changed remote content incorrectly passed' >&2
    exit 1
fi
grep -Fq 'STATUS: BLOCKED' "$scratch/changed.txt"
grep -Fq 'am force-stop ru.paseka.journal.archive.test' "$MOCK_AUDIT_FILE"
echo 'Changed-after-stop fail-closed mock PASS'
