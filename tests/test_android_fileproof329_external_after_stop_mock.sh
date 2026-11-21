#!/usr/bin/env bash
set -euo pipefail
command -v pwsh >/dev/null || { echo 'PowerShell is required in CI'; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
pwsh -NoProfile -Command '$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile("tools/android-fileproof329-external-after-stop.ps1",[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|ForEach-Object{Write-Error $_.Message};exit 1}'
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
python3 - "$temp" <<'PY'
import hashlib,json,pathlib,sys
p=pathlib.Path(sys.argv[1])
data=b'PASEKA01'+bytes((i*11+7)%256 for i in range(3150))
assert len(data)==3158
sha=hashlib.sha256(data).hexdigest()
record={'proofVersion':1,'phase':'FILE_READBACK_PASS','status':'PASS',
'packageId':'ru.paseka.journal.archive.fileproof329',
'sourceSha256':['794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f','bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'],
'videoCount':2,'archiveBytes':3158,'archiveSha256':sha,'uriType':'content-uri',
'recognitionSucceeded':False,'cleanupAuthorized':False}
raw=json.dumps(record,separators=(',',':')).encode('utf8')
assert len(raw)<466,(len(raw),raw)
report=raw+b' '*(465-len(raw))+b'\n'
assert len(report)==466
(p/'good.paseka').write_bytes(data)
(p/'report.ndjson').write_bytes(report)
(p/'bad.paseka').write_bytes(data[:200]+bytes([data[200]^1])+data[201:])
script=pathlib.Path('tools/android-fileproof329-external-after-stop.ps1').read_text()
script=script.replace('4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186',sha)
script=script.replace('002fbc37d6627e1412f95ad68946388dceeb257fda55b51b8df62b7ba3886ac4',hashlib.sha256(report).hexdigest())
(p/'mock-script.ps1').write_text(script)
PY
cat > "$temp/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FILEPROOF329_ADB_LOG"
case "$*" in
  "devices -l") printf 'List of devices attached\nusb1 device model:NE2213\n' ;;
  "-d shell getprop ro.product.model") echo NE2213 ;;
  "-d shell getprop ro.build.version.sdk") echo 36 ;;
  "-d shell pm path ru.paseka.journal.archive.fileproof329")
    if [[ "$CASE_NAME" != missing-package ]]; then echo 'package:/data/app/fileproof329/base.apk'; fi ;;
  "-d exec-out run-as ru.paseka.journal.archive.fileproof329 cat files/paseka-fileproof329.ndjson")
    cat "$MOCK_FOLDER/report.ndjson" ;;
  "-d shell ls -1 /sdcard/Download/PasekaProof329")
    if [[ "$CASE_NAME" == wrong-name ]]; then echo 'unrelated-user-file.paseka'
    elif [[ "$CASE_NAME" == two-files ]]; then
      echo 'paseka-proof329-11111111-1111-1111-1111-111111111111.paseka'
      echo 'paseka-proof329-22222222-2222-2222-2222-222222222222.paseka'
    else echo 'paseka-proof329-11111111-1111-1111-1111-111111111111.paseka'; fi ;;
  "-d exec-out cat /sdcard/Download/PasekaProof329/paseka-proof329-11111111-1111-1111-1111-111111111111.paseka")
    if [[ "$CASE_NAME" == corrupt-before ]] || [[ "$CASE_NAME" == corrupt-after && -e "$MOCK_FOLDER/stopped" ]]; then
       cat "$MOCK_FOLDER/bad.paseka"
    else
       cat "$MOCK_FOLDER/good.paseka"
    fi ;;
  "-d shell am force-stop ru.paseka.journal.archive.fileproof329")
    touch "$MOCK_FOLDER/stopped" ;;
  *) echo "Unexpected ADB invocation: $*" >&2; exit 31 ;;
esac
ADB
chmod +x "$temp/adb"
export PATH="$temp:$PATH" MOCK_FOLDER="$temp" FILEPROOF329_ADB_LOG="$temp/adb.log"
for case_id in success corrupt-before corrupt-after two-files wrong-name missing-package; do
  export CASE_NAME="$case_id"
  : > "$FILEPROOF329_ADB_LOG"; rm -f "$temp/stopped"
  set +e
  output="$(pwsh -NoProfile -File "$temp/mock-script.ps1" 2>&1)"
  status=$?
  set -e
  if [[ "$case_id" == success ]]; then
    [[ "$status" -eq 0 ]] && grep -F 'STATUS: ISOLATED_FILEPROOF329_POST_STOP_EXTERNAL_SHA_PASS' <<< "$output" >/dev/null || { echo "$case_id: $output"; exit 1; }
    [[ "$(grep -c 'force-stop ru.paseka.journal.archive.fileproof329' "$FILEPROOF329_ADB_LOG")" == 1 ]]
  else
    [[ "$status" -eq 2 ]] && grep -F 'STATUS: BLOCKED' <<< "$output" >/dev/null || { echo "$case_id: $output"; exit 1; }
    if [[ "$case_id" == corrupt-after ]]; then
      [[ -e "$temp/stopped" ]] || { echo "Expected post-stop corruption"; exit 1; }
    else
      [[ ! -e "$temp/stopped" ]] || { echo "Premature stop in $case_id"; exit 1; }
    fi
  fi
  if grep -E '(install|uninstall|pm clear|shell rm|shell mv|delete|monkey)' "$FILEPROOF329_ADB_LOG" >/dev/null; then
    echo "Unsafe ADB mutation in $case_id"; exit 1
  fi
done
echo 'PASS: 6 fileproof329 external-file post-stop ADB mock scenarios'
