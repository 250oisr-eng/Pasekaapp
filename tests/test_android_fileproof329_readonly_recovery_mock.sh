#!/usr/bin/env bash
set -euo pipefail
command -v pwsh >/dev/null || { echo 'pwsh missing'; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
pwsh -NoProfile -Command '$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile("tools/android-fileproof329-readonly-recovery.ps1",[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|ForEach-Object{Write-Error $_.Message};exit 1}'
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$PROOF329_DIAG_ADB_LOG"
one='{"proofVersion":1,"phase":"FILE_READBACK_PASS","status":"PASS","packageId":"ru.paseka.journal.archive.fileproof329","sourceSha256":["794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f","bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff"],"videoCount":2,"archiveBytes":2212,"archiveSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","uriType":"content-uri","recognitionSucceeded":false,"cleanupAuthorized":false}'
case "$*" in
  "devices -l") printf 'List of devices attached\nusb1 device model:NE2213\n' ;;
  "-d shell getprop ro.product.model") echo NE2213 ;;
  "-d shell getprop ro.build.version.sdk") echo 36 ;;
  "-d shell pm path ru.paseka.journal.archive.fileproof329") echo 'package:/data/app/fileproof329/base.apk' ;;
  "-d exec-out run-as ru.paseka.journal.archive.fileproof329 cat files/paseka-fileproof329.ndjson")
    echo 'stderr from adb' >&2
    case "$PROOF329_DIAG_CASE" in
      newline) printf '%s\n' "$one" ;;
      literal) printf '%s\\n' "$one" ;;
      blocked) printf '%s\n' '{"proofVersion":1,"phase":"FILE_READBACK","status":"BLOCKED","code":"NATIVE_MEDIASTORE_BLOCKED","recognitionSucceeded":false,"cleanupAuthorized":false}' ;;
      malformed) printf '{"proofVersion":1,unquoted}\n' ;;
      double) printf '%s\n%s\n' "$one" "$one" ;;
      *) exit 14 ;;
    esac ;;
  *) echo "UNEXPECTED_ADB:$*" >&2; exit 22 ;;
esac
ADB
chmod +x "$tmp/adb"
export PATH="$tmp:$PATH" PROOF329_DIAG_ADB_LOG="$tmp/adb.log"
for case_id in newline literal blocked malformed double; do
 : > "$PROOF329_DIAG_ADB_LOG"
 export PROOF329_DIAG_CASE="$case_id"
 set +e
 output="$(pwsh -NoProfile -File "$root/tools/android-fileproof329-readonly-recovery.ps1" 2>&1)"
 status=$?
 set -e
 if [[ "$case_id" == newline || "$case_id" == literal ]]; then
   [[ "$status" -eq 0 ]] || { echo "$case_id: $output"; exit 1; }
   grep -F 'STATUS: ISOLATED_FILEPROOF329_MEDIASTORE_PASS' <<< "$output" >/dev/null || { echo "$output"; exit 1; }
 else
   [[ "$status" -eq 2 ]] || { echo "$case_id expected blocked: $output"; exit 1; }
   grep -F 'STATUS: BLOCKED' <<< "$output" >/dev/null
 fi
 if grep -E -- '(install|uninstall|force-stop|pm clear|shell rm|delete|shell monkey)' "$PROOF329_DIAG_ADB_LOG" >/dev/null; then
   echo "Forbidden Android action in $case_id"; exit 1
 fi
done
echo 'Fileproof329 read-only diagnostics 5 mocked reports PASS'
