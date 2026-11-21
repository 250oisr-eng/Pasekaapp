#!/usr/bin/env bash
set -euo pipefail
command -v pwsh >/dev/null
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
python3 - "$tmp/proof.zip" <<'PY'
import sys,zipfile
with zipfile.ZipFile(sys.argv[1],"w",compression=zipfile.ZIP_STORED) as z:
    z.writestr("app-debug.apk",b"X"*4096)
PY
sha="$(sha256sum "$tmp/proof.zip" | awk '{print $1}')"
cat > "$tmp/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$PROOF_ADB_LOG"
case "$*" in
  "devices -l") printf 'List of devices attached\nusb123 device product:OnePlus model:NE2213\n' ;;
  "-d shell getprop ro.product.model") echo NE2213 ;;
  "-d shell getprop ro.build.version.sdk") echo 36 ;;
  "-d shell pm path ru.paseka.journal.archive.proof325")
    if [[ -f "$PROOF_INSTALLED" ]]; then echo package:/data/app/proof325/base.apk; fi ;;
  "-d install "*)
    touch "$PROOF_INSTALLED"
    echo Success ;;
  "-d shell monkey -p ru.paseka.journal.archive.proof325 -c android.intent.category.LAUNCHER 1")
    count=0; [[ -f "$PROOF_LAUNCHES" ]] && count="$(cat "$PROOF_LAUNCHES")"
    echo "$((count+1))" >"$PROOF_LAUNCHES"
    echo 'Events injected: 1' ;;
  "-d shell am force-stop ru.paseka.journal.archive.proof325") : ;;
  "-d shell run-as ru.paseka.journal.archive.proof325 cat files/paseka-two-mp4-proof.ndjson")
    count=0; [[ -f "$PROOF_LAUNCHES" ]] && count="$(cat "$PROOF_LAUNCHES")"
    if [[ "$count" -ge 1 ]]; then
      printf '%s\n' '{"proofVersion":1,"status":"INITIAL_PASS","packageId":"ru.paseka.journal.archive.proof325","videoCount":2,"archiveVersion":1,"archiveSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceSha256":["794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f","bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff"],"recognitionSucceeded":false,"cleanupAuthorized":false}'
    fi
    if [[ "$count" -ge 2 ]]; then
      printf '%s\n' '{"proofVersion":1,"status":"RELAUNCH_PASS","packageId":"ru.paseka.journal.archive.proof325","videoCount":2,"archiveVersion":1,"archiveSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","sourceSha256":["794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f","bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff"],"recognitionSucceeded":false,"cleanupAuthorized":false}'
    fi ;;
  *) echo "UNEXPECTED_ADB_COMMAND:$*" >&2; exit 12 ;;
esac
ADB
chmod +x "$tmp/adb"
export PATH="$tmp:$PATH" PROOF_ADB_LOG="$tmp/log" PROOF_INSTALLED="$tmp/installed" PROOF_LAUNCHES="$tmp/launches"
set +e
output="$(pwsh -NoProfile -File "$root/tools/android-two-mp4-proof-device.ps1" -ExpectedZipSha256 "$sha" -ZipPath "$tmp/proof.zip" 2>&1)"
code=$?
set -e
if [[ "$code" -ne 0 ]]; then printf '%s\n' "$output"; echo "mock proof failed exit=$code" >&2; exit 1; fi
grep -F 'STATUS: ISOLATED_ANDROID_TWO_MP4_EXPORT_PASS' <<< "$output" >/dev/null
grep -F 'INITIAL_INDEXEDDB_APP_EXPORT: INITIAL_PASS' <<< "$output" >/dev/null
grep -F 'RELAUNCH_INDEXEDDB_APP_EXPORT: RELAUNCH_PASS' <<< "$output" >/dev/null
[[ "$(grep -c -- '^-d shell am force-stop ru.paseka.journal.archive.proof325$' "$PROOF_ADB_LOG")" -eq 1 ]]
[[ "$(grep -c -- '^-d install ' "$PROOF_ADB_LOG")" -eq 1 ]]
if grep -E 'uninstall|pm clear|shell rm|shell delete|shell am force-stop ru.paseka.journal$' "$PROOF_ADB_LOG"; then echo 'unsafe adb in success path' >&2; exit 1; fi
echo 'Positive two-report Windows PowerShell mock: PASS'
