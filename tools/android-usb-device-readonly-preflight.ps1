# Physical OnePlus device preflight. Read-only: no install, launch, push, pull, restore, deletion or user-media access.
# Exits 0 only when pinned ADB and exactly one expected authorized phone are confirmed.
[CmdletBinding()]
param(
  [string]$AdbPath = (Join-Path $env:TEMP 'paseka-offline-platformtools-43f92107c17d47d7a2853a42348efe9b\platform-tools\adb.exe')
)
$ErrorActionPreference = 'Stop'
$expectedAdbSha256 = 'bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee'
$report = [ordered]@{
  stage = 'ANDROID_USB_READONLY_PREFLIGHT_V1'
  status = 'BLOCKED'
  adb = 'NOT_TESTED'
  device = 'NOT_TESTED'
  model = 'NOT_TESTED'
  sdk = 'NOT_TESTED'
  diagnosticPackage = 'NOT_TESTED'
  productionPackage = 'NOT_TESTED'
  adbSha256 = 'NOT_TESTED'
  installs = 'NOT_ATTEMPTED'
  writes = 'NOT_ATTEMPTED'
  mediaRead = 'NOT_ATTEMPTED'
  cleanup = 'NOT_AUTHORIZED'
  detail = 'NOT_STARTED'
}
function Call-Adb([string[]]$Arguments) {
  $lines = @(& $script:AdbPath @Arguments 2>&1 | ForEach-Object { [string]$_ })
  $code = $LASTEXITCODE
  if ($code -ne 0) { throw ('ADB_COMMAND_FAILED_' + $code) }
  return ($lines -join "`n").Trim()
}
try {
  if (-not (Test-Path -LiteralPath $AdbPath -PathType Leaf)) { throw 'PINNED_ADB_MISSING' }
  $hash = (Get-FileHash -LiteralPath $AdbPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -cne $expectedAdbSha256) { throw 'ADB_BINARY_HASH_MISMATCH' }
  $report.adbSha256 = 'PASS_PINNED'
  $version = Call-Adb @('version')
  if ($version -notmatch '(?m)^Android Debug Bridge version 1[.]0[.](\d+)\s*$') { throw 'ADB_VERSION_UNRECOGNIZED' }
  if ([int]$Matches[1] -lt 41) { throw 'ADB_VERSION_TOO_OLD' }
  $report.adb = 'PASS'
  $deviceOutput = Call-Adb @('devices','-l')
  $ready = @($deviceOutput -split '[\r\n]+' | Where-Object { $_ -match '^(\S+)\s+device(?:\s|$)' })
  $all = @($deviceOutput -split '[\r\n]+' | Where-Object { $_ -match '^\S+\s+(device|offline|unauthorized|recovery|sideload)(?:\s|$)' })
  if ($ready.Count -ne 1 -or $all.Count -ne 1) { throw 'ONE_AUTHORIZED_DEVICE_REQUIRED' }
  $serial = [regex]::Match($ready[0], '^(\S+)\s+device').Groups[1].Value
  if ($serial -notmatch '^[A-Za-z0-9._:-]+$') { throw 'UNEXPECTED_ADB_SERIAL' }
  $report.device = 'PASS_ONE_AUTHORIZED'
  $model = Call-Adb @('-s',$serial,'shell','getprop','ro.product.model')
  $sdk = Call-Adb @('-s',$serial,'shell','getprop','ro.build.version.sdk')
  if ($model -cne 'NE2213') { throw 'NOT_PINNED_ONEPLUS_NE2213' }
  $report.model = 'PASS_NE2213'
  if ($sdk -cne '36') { throw 'NOT_PINNED_API_36' }
  $report.sdk = 'PASS_API36'
  $pkg = Call-Adb @('-s',$serial,'shell','pm','path','ru.paseka.journal')
  $report.productionPackage = $(if ($pkg -match '(?m)^package:') { 'PRESENT_UNTOUCHED' } else { 'ABSENT' })
  $testPkg = Call-Adb @('-s',$serial,'shell','pm','path','ru.paseka.journal.archive.restoreproof335')
  $report.diagnosticPackage = $(if ($testPkg -match '(?m)^package:') { 'PRESENT_UNTOUCHED' } else { 'ABSENT' })
  $report.status = 'PASS'
  $report.detail = 'READ_ONLY_DEVICE_IDENTIFIED'
}
catch {
  $report.status = 'BLOCKED'
  $report.detail = [string]$_.Exception.Message
}
finally {
  $report | ConvertTo-Json -Depth 3
}
if ($report.status -ne 'PASS') { exit 2 }
