#!/usr/bin/env bash
# CI-only fake adb executable: never connects to or changes a physical Android.
set -euo pipefail
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
export TEST_ARCHIVE_FIXTURE="$root/fixture.paseka"
python3 - <<'PY'
import hashlib, json, os, struct
state = json.dumps({"app":"Paseka","state":{"meta":{"schemaVersion":5},"hives":[{"id":"fixture-hive"}]}}, separators=(',', ':')).encode()
videos = [b"synthetic-video-one-not-a-real-recording", b"synthetic-video-two-not-a-real-recording"]
entries = [{"path":"state.json","kind":"state","size":len(state),
            "mimeType":"application/json","chunkSize":1048576,
            "chunkSha256":[hashlib.sha256(state).hexdigest()]}]
for i, blob in enumerate(videos, 1):
    entries.append({
        "path":f"entrance-media/{i:06d}.blob","kind":"entrance_video",
        "size":len(blob),"mimeType":"video/mp4","chunkSize":1048576,
        "chunkSha256":[hashlib.sha256(blob).hexdigest()],
        "metadata":{"id":f"synthetic-video-{i}","hiveId":"fixture-hive",
                    "capturedAt":"2026-11-21T17:00:00Z","durationSec":1,
                    "width":32,"height":32,"bytes":len(blob),
                    "mimeType":"video/mp4","name":f"synthetic-{i}.mp4"}
    })
manifest = {
    "format":"paseka-archive", "version":1,
    "backupId":"synthetic-fixture-2026-11-21", "createdAt":"2026-11-21T17:00:00Z",
    "schemaVersion":5, "entries":entries
}
raw = json.dumps(manifest,separators=(',',':')).encode()
with open(os.environ["TEST_ARCHIVE_FIXTURE"],'wb') as fp:
    fp.write(b'PASEKA01'+struct.pack('<I',len(raw))+raw+state+b''.join(videos))
PY
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
  *"stat -c %s "*) wc -c < "$TEST_ARCHIVE_FIXTURE" ;;
  *"head -c 8 "*) echo PASEKA01 ;;
  *"sha256sum "*) sha256sum "$TEST_ARCHIVE_FIXTURE" ;;
  "-d pull "*)
    echo "5 KB/s (5124 bytes in 1.000s)" >&2
    if [[ "$TEST_MODE" == "pull_fail" ]]; then echo "adb: remote read error" >&2; exit 17; fi
    cp "$TEST_ARCHIVE_FIXTURE" "$4"
    ;;
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
# Full structural verification uses a scratch-only copy and never writes to the fake Android source.
if ! pwsh -NoProfile -File tools/android_paseka02_preflight.ps1 -VerifyContents > "$root/verified.txt" 2>&1; then
  cat "$root/verified.txt" >&2
  exit 1
fi
verified="$(cat "$root/verified.txt")"
grep -Fq 'STATUS: ARCHIVE_STRUCTURE_VERIFIED' <<< "$verified"
grep -Fq 'ARCHIVE_CHUNKS_SHA256: PASS' <<< "$verified"
grep -Fq 'ARCHIVE_VIDEO_ENTRIES: 2' <<< "$verified"
echo "Synthetic PASEKA01 manifest and chunk hash verification passed even with adb stderr progress"
if TEST_MODE=pull_fail pwsh -NoProfile -File tools/android_paseka02_preflight.ps1 -VerifyContents > "$root/pull_failed.txt" 2>&1; then
    echo 'Failed adb pull incorrectly verified' >&2
    exit 1
fi
grep -Fq 'STATUS: BLOCKED' "$root/pull_failed.txt"
grep -Fq 'exit 17' "$root/pull_failed.txt"
echo "Nonzero adb pull exits fail closed"
python3 - <<'PY'
import os
p=os.environ["TEST_ARCHIVE_FIXTURE"]
with open(p, 'r+b') as f:
    f.seek(-1, 2)
    c=f.read(1)
    f.seek(-1, 2)
    f.write(bytes([c[0]^1]))
PY
if pwsh -NoProfile -File tools/android_paseka02_preflight.ps1 -VerifyContents > "$root/tampered.txt" 2>&1; then
    echo 'Corrupt archive payload incorrectly verified' >&2
    exit 1
fi
grep -Fq 'STATUS: BLOCKED' "$root/tampered.txt"
echo "Tampered PASEKA01 payload correctly rejected"
