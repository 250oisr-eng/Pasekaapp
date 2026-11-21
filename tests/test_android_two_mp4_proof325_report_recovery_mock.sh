#!/usr/bin/env bash
set -euo pipefail
command -v pwsh >/dev/null
root="$(cd "$(dirname "$0")/.." && pwd)"
pwsh -NoProfile -Command '$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile("tools/android-two-mp4-proof325-report-recovery.ps1",[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|ForEach-Object{Write-Error $_.Message};exit 1}'
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
cat > "$temp/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$PROOF_RECOVERY_ADB_LOG"
one='{"proofVersion":1,"status":"INITIAL_PASS","packageId":"ru.paseka.journal.archive.proof325","videoCount":2,"archiveVersion":1,"archiveSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceSha256":["794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f","bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff"],"recognitionSucceeded":false,"cleanupAuthorized":false}'
two='{"proofVersion":1,"status":"RELAUNCH_PASS","packageId":"ru.paseka.journal.archive.proof325","videoCount":2,"archiveVersion":1,"archiveSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","sourceSha256":["794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f","bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff"],"recognitionSucceeded":false,"cleanupAuthorized":false}'
case "$*" in
"devices -l") printf 'List of devices attached\nusb123 device model:NE2213\n' ;;
"-d shell getprop ro.product.model") echo NE2213 ;;
"-d shell getprop ro.build.version.sdk") echo 36 ;;
"-d shell pm path ru.paseka.journal.archive.proof325") echo package:/data/app/proof325/base.apk ;;
"-d exec-out run-as ru.paseka.journal.archive.proof325 cat files/paseka-two-mp4-proof.ndjson")
  # stderr noise must never corrupt JSON read through stdout.
  echo 'ADB notice on stderr' >&2
  case "$PROOF_RECOVERY_CASE" in
    corrupt) printf 'bad-json\n' ;;
    initial|resume) printf '%s\n' "$one"
      if [[ -f "$PROOF_RECOVERY_STOP_FILE" ]]; then printf '%s\n' "$two"; fi ;;
    two) printf '%s\n%s\n' "$one" "$two" ;;
    literal) printf '%s\\n%s\\n' "$one" "$two" ;;
    *) exit 14 ;;
  esac
  ;;
"-d shell am force-stop ru.paseka.journal.archive.proof325") touch "$PROOF_RECOVERY_STOP_FILE" ;;
"-d shell monkey -p ru.paseka.journal.archive.proof325 -c android.intent.category.LAUNCHER 1") echo 'Events injected: 1' ;;
*) echo "UNEXPECTED_ADB:$*" >&2; exit 25 ;;
esac
ADB
chmod +x "$temp/adb"
export PATH="$temp:$PATH" PROOF_RECOVERY_ADB_LOG="$temp/adb.log" PROOF_RECOVERY_STOP_FILE="$temp/stopped"
for case_id in corrupt initial two literal resume; do
  : > "$PROOF_RECOVERY_ADB_LOG"
  rm -f "$PROOF_RECOVERY_STOP_FILE"
  export PROOF_RECOVERY_CASE="$case_id"
  flags=()
  [[ "$case_id" == resume ]] && flags=(-Resume)
  set +e
  output="$(pwsh -NoProfile -File "$root/tools/android-two-mp4-proof325-report-recovery.ps1" "${flags[@]}" 2>&1)"
  exit_code=$?
  set -e
  if [[ "$case_id" == corrupt ]]; then
    [[ "$exit_code" -eq 2 ]] || { echo "corrupt expected blocked: $output"; exit 1; }
    grep -F 'DETAIL: REPORT_JSON_INVALID' <<<"$output" >/dev/null || { echo "$output"; exit 1; }
  else
    [[ "$exit_code" -eq 0 ]] || { echo "case $case_id failure: $output"; exit 1; }
    expected_status='ISOLATED_ANDROID_TWO_MP4_EXPORT_PASS'
    [[ "$case_id" == initial ]] && expected_status='INITIAL_ANDROID_TWO_MP4_EXPORT_VERIFIED'
    grep -F "STATUS: $expected_status" <<<"$output" >/dev/null || { echo "$output"; exit 1; }
  fi
  if [[ "$case_id" == resume ]]; then
    [[ "$(grep -c 'am force-stop' "$PROOF_RECOVERY_ADB_LOG")" -eq 1 ]] || { echo "$output"; exit 1; }
  else
    if grep -E 'force-stop|install|uninstall|pm clear|rm ' "$PROOF_RECOVERY_ADB_LOG"; then
      echo "Read-only violation in $case_id" >&2; exit 1
    fi
  fi
done
echo 'Proof325 existing-package read-only/relaunch mock 5 scenarios: PASS'
