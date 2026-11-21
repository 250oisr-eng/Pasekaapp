#!/usr/bin/env bash
set -euo pipefail
command -v pwsh >/dev/null
root="$(cd "$(dirname "$0")/.." && pwd)"
pwsh -NoProfile -Command '$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile("tools/android-two-mp4-fileproof329-device.ps1",[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|ForEach-Object{Write-Error $_.Message};exit 1}'
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
python3 - "$tmp/proof.zip" <<'PY'
import sys,zipfile
with zipfile.ZipFile(sys.argv[1],'w',compression=zipfile.ZIP_STORED) as z:
 z.writestr('app-debug.apk',b'P'*4096)
PY
sha="$(sha256sum "$tmp/proof.zip" | cut -d' ' -f1)"
cat > "$tmp/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$FILEPROOF329_ADB_LOG"
case "$*" in
 "devices -l") echo 'List of devices attached'; echo 'usb123 device model:NE2213' ;;
 "-d shell getprop ro.product.model") echo NE2213 ;;
 "-d shell getprop ro.build.version.sdk") echo 36 ;;
 "-d shell pm path ru.paseka.journal.archive.fileproof329")
   if [[ "$FILEPROOF329_CASE" == installed || -f "$FILEPROOF329_INSTALLED" ]]; then echo package:/data/app/fileproof329/base.apk; fi ;;
 "-d install "*)
   touch "$FILEPROOF329_INSTALLED"; echo Success ;;
 "-d shell monkey -p ru.paseka.journal.archive.fileproof329 -c android.intent.category.LAUNCHER 1")
   touch "$FILEPROOF329_LAUNCHED"; echo 'Events injected: 1' ;;
 "-d exec-out run-as ru.paseka.journal.archive.fileproof329 cat files/paseka-fileproof329.ndjson")
   if [[ -f "$FILEPROOF329_LAUNCHED" ]]; then
     echo 'noise on stderr' >&2
     echo '{"proofVersion":1,"phase":"FILE_READBACK_PASS","status":"PASS","packageId":"ru.paseka.journal.archive.fileproof329","sourceSha256":["794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f","bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff"],"videoCount":2,"archiveBytes":2212,"archiveSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","uriType":"content-uri","recognitionSucceeded":false,"cleanupAuthorized":false}'
   fi ;;
 *) echo "UNEXPECTED_ADB:$*" >&2; exit 14 ;;
esac
ADB
chmod +x "$tmp/adb"
export PATH="$tmp:$PATH" FILEPROOF329_ADB_LOG="$tmp/adb-log" FILEPROOF329_INSTALLED="$tmp/installed" FILEPROOF329_LAUNCHED="$tmp/launched"
for case_id in missing installed positive; do
 : > "$FILEPROOF329_ADB_LOG"; rm -f "$FILEPROOF329_INSTALLED" "$FILEPROOF329_LAUNCHED"
 export FILEPROOF329_CASE="$case_id"
 zipfile="$tmp/proof.zip"; [[ "$case_id" == missing ]] && zipfile="$tmp/not-there.zip"
 set +e
 output="$(pwsh -NoProfile -File "$root/tools/android-two-mp4-fileproof329-device.ps1" -ExpectedZipSha256 "$sha" -ZipPath "$zipfile" 2>&1)"
 status=$?
 set -e
 if [[ "$case_id" == positive ]]; then
   [[ "$status" -eq 0 ]] || { echo "$output"; exit 1; }
   grep -F 'STATUS: ISOLATED_FILEPROOF329_MEDIASTORE_PASS' <<< "$output" >/dev/null || { echo "$output";exit 1; }
   grep -F 'MEDIASTORE_FILE_READBACK: PASS' <<< "$output" >/dev/null
   [[ "$(grep -c -- '^-d install ' "$FILEPROOF329_ADB_LOG")" -eq 1 ]]
 else
   [[ "$status" -eq 2 ]] || { echo "$output";exit 1; }
   grep -F 'STATUS: BLOCKED' <<< "$output" >/dev/null
   if grep -E -- '(^| )install( |$)|force-stop|uninstall|pm clear' "$FILEPROOF329_ADB_LOG"; then
     echo "unsafe action in $case_id"; exit 1
   fi
 fi
 if grep -E -- 'force-stop|uninstall|pm clear|shell rm|delete ' "$FILEPROOF329_ADB_LOG"; then
    echo 'destructive adb command detected';exit 1
 fi
done
echo 'Fileproof329 Windows USB preflight, missing/installed/positive: PASS'
