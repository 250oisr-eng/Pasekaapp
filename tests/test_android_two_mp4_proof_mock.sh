#!/usr/bin/env bash
set -euo pipefail
command -v pwsh >/dev/null || { echo "pwsh missing" >&2; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
pwsh -NoProfile -Command '$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile("tools/android-two-mp4-proof-device.ps1",[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{Write-Error $_.Message};exit 1}'
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
cat >"$temp/adb" <<'ADB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PASEKA_TEST_ADB_LOG"
case "$*" in
"devices -l")
  if [[ "$PASEKA_MOCK_CASE" == multi ]]; then
    printf 'List of devices attached\nfirst device model:NE2213\nsecond device model:NE2213\n'
  else
    printf 'List of devices attached\nfirst device model:NE2213\n'
  fi
  ;;
"-d shell getprop ro.product.model") echo NE2213 ;;
"-d shell getprop ro.build.version.sdk") echo 36 ;;
"-d shell pm path ru.paseka.journal.archive.proof325")
  if [[ "$PASEKA_MOCK_CASE" == installed ]]; then echo package:/data/app/example/base.apk; fi
  ;;
*) echo "unexpected adb invocation: $*" >&2; exit 20 ;;
esac
ADB
chmod +x "$temp/adb"
export PATH="$temp:$PATH" PASEKA_TEST_ADB_LOG="$temp/adb-calls"
for case_id in multi installed missingzip; do
  : >"$PASEKA_TEST_ADB_LOG"
  export PASEKA_MOCK_CASE="$case_id"
  set +e
  output="$(pwsh -NoProfile -File "$root/tools/android-two-mp4-proof-device.ps1" -ExpectedZipSha256 "$(printf 'a%.0s' {1..64})" -ZipPath "$temp/missing.zip" 2>&1)"
  status=$?
  set -e
  [[ "$status" -eq 2 ]] || { echo "expected exit 2 for $case_id, got $status: $output" >&2; exit 1; }
  grep -F 'STATUS: BLOCKED' <<<"$output" >/dev/null || { echo "missing BLOCKED for $case_id: $output" >&2; exit 1; }
  if grep -E -- '(^| )install( |$)|force-stop|uninstall|pm clear' "$PASEKA_TEST_ADB_LOG" >/dev/null; then
    echo "unsafe ADB action in $case_id" >&2; exit 1
  fi
  case "$case_id" in
    multi) grep -F ONE_AUTHORIZED_USB_DEVICE_REQUIRED <<<"$output" >/dev/null ;;
    installed) grep -F PROOF_PACKAGE_ALREADY_INSTALLED_NO_OVERWRITE <<<"$output" >/dev/null ;;
    missingzip) grep -F VERIFIED_ARTIFACT_ZIP_NOT_FOUND <<<"$output" >/dev/null ;;
  esac || { echo "wrong diagnostic for $case_id" >&2; exit 1; }
done
echo 'PowerShell syntax and 3 negative ADB cases: PASS; no install/stop/delete'
