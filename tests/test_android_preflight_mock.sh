#!/usr/bin/env bash
# CI-only fake adb executable: never connects to or changes a physical Android.
set -euo pipefail
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
cat > "$root/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  "devices -l") printf 'List of devices attached\nsynthetic123 device product:test model:NE2213\n' ;;
  "-d shell getprop ro.product.model") echo NE2213 ;;
  "-d shell getprop ro.build.version.sdk") echo 36 ;;
  "-d shell getprop ro.build.version.release") echo 16 ;;
  "-d shell pm path ru.paseka.journal.archive.test") echo 'package:/data/app/test/base.apk' ;;
  "-d shell pidof ru.paseka.journal.archive.test") echo "Export-only mode must not call pidof" >&2; exit 42 ;;
  "-d shell ls -1 /sdcard/Download/Пасека")
    echo 'paseka-full-backup-2026-11-18.paseka'
    echo 'paseka-full-backup-2026-11-19.paseka'
    echo 'paseka-full-backup-2081-09-01.paseka'
    echo 'paseka-full-backup-2087-03-08.paseka'
    echo 'paseka-full-backup-2094-07-13.paseka'
    echo 'paseka-full-backup-2026-11-21.paseka'
    if [[ "$TEST_MODE" == "ambiguous" ]]; then echo 'paseka-full-backup-2026-11-21 (1).paseka'; fi
    ;;
  *"stat -c %F "*) echo 'regular file' ;;
  *"stat -c %s "*) echo 2048 ;;
  *"head -c 8 "*) echo PASEKA01 ;;
  *"sha256sum "*) printf '%064d  archive\n' 0 | tr '0' 'a' ;;
  *) echo "Unexpected test ADB request: $*" >&2; exit 42 ;;
esac
ADB
chmod +x "$root/adb"
export PATH="$root:$PATH"
export TEST_MODE=""
output="$(pwsh -NoProfile -File tools/android_paseka02_preflight.ps1 -CheckNewExport)"
grep -Fq 'STATUS: EXPORT_CHECK_COMPLETE' <<< "$output"
grep -Fq 'NEW_EXPORT_FILENAME: paseka-full-backup-2026-11-21.paseka' <<< "$output"
grep -Fq 'NEW_EXPORT_SHA256_TWICE:' <<< "$output"
grep -Fq 'ARCHIVE_STRUCTURE: NOT TESTED' <<< "$output"
echo "Read-only export inventory mock passed without requesting pidof"
if TEST_MODE=ambiguous pwsh -NoProfile -File tools/android_paseka02_preflight.ps1 -CheckNewExport > "$root/negative.txt" 2>&1; then
  echo 'Ambiguous new exports incorrectly passed' >&2
  exit 1
fi
grep -Fq 'STATUS: BLOCKED' "$root/negative.txt"
echo "Ambiguous export rejection mock passed"
