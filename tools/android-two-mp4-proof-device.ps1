# USB-only proof for NEW package ru.paseka.journal.archive.proof325.
# No pm clear/uninstall, no user video, no Downloads writes or reads.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedZipSha256,
  [string]$ZipPath = (Join-Path $env:USERPROFILE 'Downloads\paseka-two-mp4-proof-isolated-apk.zip')
)
$ErrorActionPreference = 'Stop'
$package = 'ru.paseka.journal.archive.proof325'
$expectedSource = @(
 '794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
 'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'
)
function NativeAdb([string[]]$argv) {
  $old = $ErrorActionPreference
  try {
    # Windows PowerShell 5.1 maps harmless native stderr to ErrorRecord.
    $ErrorActionPreference = 'Continue'
    $reply = (& adb @argv 2>&1 | Out-String).Trim()
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $old }
  return [pscustomobject]@{ Code=$code; Text=[string]$reply }
}
function RequireAdb([string[]]$argv) {
  $response = NativeAdb $argv
  if ($response.Code -ne 0) { throw ('ADB_EXIT_' + $response.Code + ': ' + ($argv[0..([Math]::Min($argv.Count-1,2))] -join ' ')) }
  return $response.Text
}
function Reports() {
  $result = NativeAdb @('-d','shell',('run-as ' + $package + ' cat files/paseka-two-mp4-proof.ndjson'))
  if ($result.Code -ne 0) { return @() }
  $parsed = @()
  foreach ($line in @($result.Text -split "[\r\n]+" | Where-Object { $_.Trim() })) {
    try {
      $entry = ConvertFrom-Json -InputObject $line -ErrorAction Stop
    } catch { throw 'PROOF_REPORT_INVALID_JSON' }
    if ($entry.proofVersion -ne 1 -or $entry.packageId -ne $package -or
      $entry.cleanupAuthorized -ne $false -or $entry.recognitionSucceeded -ne $false -or
      $entry.videoCount -ne 2 -or $entry.archiveVersion -ne 1 -or
      @($entry.sourceSha256).Count -ne 2 -or
      $entry.sourceSha256[0] -ne $expectedSource[0] -or
      $entry.sourceSha256[1] -ne $expectedSource[1]) {
      throw 'PROOF_REPORT_CONTENT_MISMATCH'
    }
    $parsed += $entry
  }
  # Enumerate reports as pipeline items: @(... ) at the caller must count 0, 1, or 2 records.
  return $parsed
}
function WaitReport([string]$wanted,[int]$count) {
  for ($i=0; $i -lt 40; $i++) {
    $all = @(Reports)
    if ($all.Count -gt $count) { throw 'PROOF_REPORT_UNEXPECTED_EXTRA_RESULTS' }
    if ($all.Count -eq $count) {
      if ($all[$count-1].status -eq 'BLOCKED') { throw ('PROOF_APP_BLOCKED: ' + $all[$count-1].code) }
      if ($all[$count-1].status -ne $wanted) { throw 'PROOF_REPORT_WRONG_STAGE' }
      return $all
    }
    Start-Sleep -Milliseconds 750
  }
  throw ('PROOF_REPORT_TIMEOUT_' + $wanted)
}
function StartApp() {
  $response = RequireAdb @('-d','shell',('monkey -p ' + $package + ' -c android.intent.category.LAUNCHER 1'))
  if ($response -notmatch 'Events injected:\s*1') { throw 'PROOF_APP_LAUNCH_NOT_CONFIRMED' }
}
$scratch = $null
try {
  $null = Get-Command adb -CommandType Application -ErrorAction Stop
  $devices = RequireAdb @('devices','-l')
  $authorized = @($devices -split "[\r\n]+" | Where-Object { $_ -match '^\S+\s+device\s+' })
  $other = @($devices -split "[\r\n]+" | Where-Object { $_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)\b' })
  if ($authorized.Count -ne 1 -or $other.Count -gt 0) { throw 'ONE_AUTHORIZED_USB_DEVICE_REQUIRED' }
  if ((RequireAdb @('-d','shell','getprop ro.product.model')) -ne 'NE2213' -or
      (RequireAdb @('-d','shell','getprop ro.build.version.sdk')) -ne '36') {
    throw 'EXPECTED_ONEPLUS_NE2213_ANDROID_API36'
  }
  $installed = NativeAdb @('-d','shell',('pm path ' + $package))
  if ($installed.Text -match 'package:' ) { throw 'PROOF_PACKAGE_ALREADY_INSTALLED_NO_OVERWRITE' }
  if ($installed.Code -ne 0 -and $installed.Text) { throw 'CANNOT_VERIFY_PROOF_PACKAGE_ABSENT' }
  if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) { throw 'VERIFIED_ARTIFACT_ZIP_NOT_FOUND' }
  $file = Get-Item -LiteralPath $ZipPath
  if ($file.Length -lt 1024 -or $file.Length -gt 16777216) { throw 'ZIP_SIZE_LIMIT' }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $ZipPath).Hash.ToLowerInvariant()
  if ($actual -ne $ExpectedZipSha256.ToLowerInvariant()) { throw 'ZIP_SHA256_MISMATCH' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $scratch = Join-Path ([IO.Path]::GetTempPath()) ('paseka-proof-' + [guid]::NewGuid().ToString('N'))
  $null = New-Item -Path $scratch -ItemType Directory -ErrorAction Stop
  $apk = Join-Path $scratch 'app-debug.apk'
  $zip = [IO.Compression.ZipFile]::OpenRead($file.FullName)
  try {
    if ($zip.Entries.Count -ne 1 -or $zip.Entries[0].FullName -ne 'app-debug.apk') { throw 'ZIP_ENTRY_SET_INVALID' }
    if ($zip.Entries[0].Length -lt 1024 -or $zip.Entries[0].Length -gt 16777216) { throw 'APK_SIZE_LIMIT' }
    $source = $zip.Entries[0].Open()
    $target = [IO.File]::Open($apk,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $source.CopyTo($target) } finally { $target.Dispose(); $source.Dispose() }
  } finally { $zip.Dispose() }
  $installedNow = RequireAdb @('-d','install',$apk)
  if ($installedNow -notmatch 'Success') { throw 'TEST_PACKAGE_INSTALL_NOT_CONFIRMED' }
  if ((RequireAdb @('-d','shell',('pm path ' + $package))) -notmatch '^package:') { throw 'NEW_PROOF_PACKAGE_NOT_FOUND' }
  Write-Host 'PACKAGE: NEW_ISOLATED_PROOF325_INSTALLED'
  StartApp
  $first = @(WaitReport 'INITIAL_PASS' 1)
  Write-Host ('INITIAL_INDEXEDDB_APP_EXPORT: ' + $first[0].status)
  $null = RequireAdb @('-d','shell',('am force-stop ' + $package))
  StartApp
  $second = @(WaitReport 'RELAUNCH_PASS' 2)
  Write-Host ('RELAUNCH_INDEXEDDB_APP_EXPORT: ' + $second[1].status)
  Write-Host ('VIDEO_1_SHA256: ' + $second[1].sourceSha256[0])
  Write-Host ('VIDEO_2_SHA256: ' + $second[1].sourceSha256[1])
  Write-Host 'EXTERNAL_DOWNLOADS_AND_USER_MEDIA: NOT TOUCHED'
  Write-Host 'RECOGNITION_AND_CLEANUP: NOT TESTED / NOT AUTHORIZED'
  Write-Host 'STATUS: ISOLATED_ANDROID_TWO_MP4_EXPORT_PASS'
} catch {
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: ' + $_.Exception.Message)
  Write-Host 'NO_ANDROID_FILES_DELETED; NO_PACKAGE_UNINSTALL_OR_CLEAR'
  exit 2
} finally {
  if ($scratch -and (Test-Path -LiteralPath $scratch)) {
    # Only scratch created under TEMP during this invocation.
    Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
  }
}
