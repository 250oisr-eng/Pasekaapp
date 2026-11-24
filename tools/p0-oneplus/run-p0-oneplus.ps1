# PASEKA 2.0 P0 isolated OnePlus verification. Exact CI artifact is included.
# Only package ru.paseka.journal.disasterproof2; never uninstall/pm clear.
# Windows PowerShell 5.1-compatible. No network, no production read.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Package = 'ru.paseka.journal.disasterproof2'
$ExpectedHead = '3677797d3f83027353a9b7ff8c5cec5f91152a2e'
$ExpectedCheckout = '9092f56f61d81000ceefe965f7a57c9335d75409'
$ExpectedApkHash = '79a6227719debbac7216bc51fd99f3f786b57232d73d232ea7f6524ee355332f'
$ExpectedArtifactId = 14904927140
$Tag = 'PASEKA_P0_DISASTER_PROOF_RESULT'
$Out = Join-Path $PSScriptRoot ('P0-RESULT-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $Out -Force | Out-Null
$report = [ordered]@{
  schema='paseka-p0-pc-oneplus-audit-v2'; generatedAt=(Get-Date -Format 'o')
  expectedSourceSha=$ExpectedHead; artifactId=$ExpectedArtifactId
  packageId=$Package; finalStatus='NOT_STARTED'
  source='CI_VERIFIED_BUNDLED_APK'; originalUserMedia='NOT_ACCESSED'
  productionPackage='NOT_ACCESSED'; secondPhysicalDevice='NOT_VERIFIED'
  cleanup='NOT_ATTEMPTED'; notes=@(); checks=@()
}
function Save-Report {
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $Out 'report.json') -Encoding UTF8
}
function Stop-Safely([string]$code,[string]$message) {
  $report.finalStatus = 'BLOCKED'
  $report.blockCode = $code
  $report.detail = $message
  Save-Report
  throw ("$code : $message")
}
function Add-Check([string]$name,[string]$status,[string]$detail='') {
  $report.checks += [ordered]@{name=$name;status=$status;detail=$detail}
  Save-Report
}
function Invoke-Adb {
  param([Parameter(Mandatory=$true)][string[]]$Arguments)
  if($Arguments.Count -eq 0){ Stop-Safely 'ADB_ARGUMENTS_EMPTY' 'No adb command provided' }
  $old = $ErrorActionPreference
  try {
    # Windows PowerShell 5.1 treats stderr from native tools as an ErrorRecord.
    # Preserve stderr as text; use LASTEXITCODE, not PowerShell's native error.
    $ErrorActionPreference = 'Continue'
    $lines = & $script:AdbPath @Arguments 2>&1
    $status = $LASTEXITCODE
  } catch {
    Stop-Safely 'ADB_INVOCATION_ERROR' $_.Exception.Message
  } finally {
    $ErrorActionPreference = $old
  }
  $output = (@($lines) | ForEach-Object { [string]$_ }) -join "`n"
  if($status -ne 0) { Stop-Safely 'ADB_EXIT_NONZERO' ((($Arguments -join ' ') + " exit=$status " + $output).Trim()) }
  return $output.Trim()
}
function Device-Adb {
  param([Parameter(Mandatory=$true)][string[]]$Arguments)
  if(-not $script:Serial){ Stop-Safely 'DEVICE_NOT_PINNED' 'No unique USB device selected' }
  return Invoke-Adb -Arguments (@('-s',$script:Serial) + $Arguments)
}
function Device-Epoch {
  $raw = Device-Adb -Arguments @('shell','date','+%s')
  if($raw -notmatch '^\d{10,}$'){ Stop-Safely 'DEVICE_TIME_UNAVAILABLE' ('Unexpected device timestamp: '+$raw) }
  return [long]$raw
}
function Get-FreshProof([long]$since,[int]$timeoutSeconds,[string]$expectedCode) {
  $end=(Get-Date).AddSeconds($timeoutSeconds)
  do {
    # Last 7000 epoch-stamped lines, filtered in memory. No full logs on disk.
    $raw = Device-Adb -Arguments @('logcat','-d','-v','epoch','-t','7000')
    foreach($line in @($raw -split "`r?`n")) {
      if ($line -notmatch [regex]::Escape($Tag)) { continue }
      $epochMatch=[regex]::Match($line, '^\s*(\d{10,})\.(\d+)\s+')
      if(-not $epochMatch.Success){ continue }
      $seenAt=[long]$epochMatch.Groups[1].Value
      if($seenAt -lt $since){ continue }
      $payloadMatch=[regex]::Match($line, 'PASEKA_P0_DISASTER_PROOF_RESULT\s+(\{.*\})\s*$')
      if(-not $payloadMatch.Success){ continue }
      $candidate=$payloadMatch.Groups[1].Value
      try { $data=$candidate|ConvertFrom-Json -ErrorAction Stop } catch { continue }
      if($data.packageId -ne $Package){ continue }
      if($data.status -eq 'BLOCKED' -or $data.code -eq $expectedCode){ return $data }
    }
    Start-Sleep -Seconds 2
  } while((Get-Date) -lt $end)
  Stop-Safely 'FRESH_WEBVIEW_RESULT_MISSING' 'No current-boot diagnostic result with matching packageId and timestamp; app may need user confirmation'
}
try {
  Write-Host 'PASEKA 2.0 P0 | VERIFIED OFFLINE ONEPLUS BUNDLE' -ForegroundColor Cyan
  Write-Host 'APK already included. No downloading, no install of production app, no clear/uninstall.'
  $apk=Join-Path $PSScriptRoot 'app-debug.apk'
  $manifestFile=Join-Path $PSScriptRoot 'disaster-proof-manifest.json'
  if(-not (Test-Path -LiteralPath $apk -PathType Leaf) -or -not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
    Stop-Safely 'BUNDLE_INCOMPLETE' 'APK or diagnostic manifest missing from extracted bundle'
  }
  $manifest=Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
  $expected=[ordered]@{
    schema='paseka-disaster-isolated-artifact-v1'
    sourceSha=$ExpectedHead
    sha=$ExpectedCheckout
    packageId=$Package
    originalPackageId='ru.paseka.journal'
    apkFile='app-debug.apk'
    apkSha256=$ExpectedApkHash
    noUserDataAccess=$true
    noCleanup=$true
  }
  foreach($key in $expected.Keys) {
    if($null -eq $manifest.PSObject.Properties[$key] -or $manifest.$key -ne $expected[$key]){
      Stop-Safely 'BUNDLE_MANIFEST_MISMATCH' ("Manifest field $key does not match verified CI artifact")
    }
  }
  $hash=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
  if($hash -ne $ExpectedApkHash){ Stop-Safely 'APK_SHA256_MISMATCH' 'Bundled APK SHA-256 differs from verified CI artifact; stop without install' }
  $report.apkSha256=$hash
  Add-Check 'exactCiManifestAndApkSha256' 'PASS' $hash
  Write-Host ('Exact diagnostic APK verified: '+$hash) -ForegroundColor Green

  $adbCandidates=@()
  $cmd=Get-Command adb -ErrorAction SilentlyContinue
  if($cmd){ $adbCandidates+= $cmd.Source }
  if($env:LOCALAPPDATA){$adbCandidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe')}
  if($env:USERPROFILE){$adbCandidates += (Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk\platform-tools\adb.exe')}
  $adbCandidates += (Join-Path $PSScriptRoot 'platform-tools\adb.exe')
  $adbCandidates += (Join-Path $PSScriptRoot 'adb.exe')
  $script:AdbPath=$null
  foreach($candidate in $adbCandidates){if($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)){$script:AdbPath=$candidate;break}}
  if(-not $script:AdbPath){Stop-Safely 'ADB_NOT_FOUND' 'Android Platform-Tools not found. Get official platform-tools and retry.'}
  $list=Invoke-Adb -Arguments @('devices','-l')
  $deviceLines=@($list -split "`r?`n" | Where-Object { $_ -match '^\S+\s+(device|unauthorized|offline)\b' })
  if($deviceLines.Count -ne 1){
    Stop-Safely 'USB_DEVICE_NOT_READY' ('Expected exactly one authorized USB device; adb devices -l: '+$list)
  }
  $serialMatch=[regex]::Match($deviceLines[0], '^(\S+)\s+device\b')
  if(-not $serialMatch.Success){Stop-Safely 'USB_DEVICE_NOT_READY' ('Device not authorized; adb devices -l: '+$list)}
  $script:Serial=$serialMatch.Groups[1].Value
  $model=Device-Adb -Arguments @('shell','getprop','ro.product.model')
  $api=Device-Adb -Arguments @('shell','getprop','ro.build.version.sdk')
  if($api -notmatch '^\d+$' -or [int]$api -lt 35) { Stop-Safely 'ANDROID_API_UNSUPPORTED' ('Diagnostic requires API35+, got '+$api) }
  if($model.Trim() -ne 'NE2213') { Stop-Safely 'UNEXPECTED_PHONE_MODEL' ('Expected OnePlus NE2213; got '+$model) }
  $report.deviceModel=$model.Trim(); $report.androidApi=[int]$api
  Add-Check 'onePlusUsbApiAndModel' 'PASS' ("$model / API $api")
  Write-Host ("OnePlus $model / Android API $api / authorized") -ForegroundColor Green

  $existing=Device-Adb -Arguments @('shell','pm','path',$Package)
  if($existing -match 'package:') {
    # Do not update, clear, or uninstall an existing test package. Fail closed.
    Stop-Safely 'TEST_PACKAGE_ALREADY_INSTALLED' 'proof2 already installed; preserving test data. Submit report and do not uninstall manually.'
  }
  Write-Host ('Installing only new isolated package '+$Package)
  $install=Device-Adb -Arguments @('install',$apk)
  if($install -notmatch '(?m)^\s*Success\s*$'){
    Stop-Safely 'INSTALL_NOT_CONFIRMED' $install
  }
  $path=Device-Adb -Arguments @('shell','pm','path',$Package)
  if($path -notmatch 'package:'){Stop-Safely 'PACKAGE_NOT_PRESENT_AFTER_INSTALL' 'Android PackageManager has no matching installed proof2 package'}
  Add-Check 'freshIsolatedPackageInstalled' 'PASS' $Package

  $before=Device-Epoch
  $launch=Device-Adb -Arguments @('shell','monkey','-p',$Package,'-c','android.intent.category.LAUNCHER','1')
  $first=Get-FreshProof -since $before -timeoutSeconds 65 -expectedCode 'P0_DISASTER_WEBVIEW_RESTORE_PASS'
  $report.firstCode=$first.code
  $report.firstChecks=$first.checks
  if($first.status -ne 'PASS' -or $first.code -ne 'P0_DISASTER_WEBVIEW_RESTORE_PASS'){
    Stop-Safely 'FIRST_LAUNCH_P0_FAILED' (([string]$first.code) +' '+([string]$first.detail))
  }
  Add-Check 'realAndroidWebViewRestore' 'PASS' ([string]$first.code)
  Write-Host 'First diagnostic restore PASS' -ForegroundColor Green

  $cut=Device-Epoch
  [void](Device-Adb -Arguments @('shell','am','force-stop',$Package))
  [void](Device-Adb -Arguments @('shell','monkey','-p',$Package,'-c','android.intent.category.LAUNCHER','1'))
  $second=Get-FreshProof -since $cut -timeoutSeconds 65 -expectedCode 'P0_DISASTER_PHYSICAL_RESTART_PASS'
  $report.secondCode=$second.code
  $report.secondChecks=$second.checks
  if($second.status -ne 'PASS' -or $second.code -ne 'P0_DISASTER_PHYSICAL_RESTART_PASS'){
    Stop-Safely 'RESTART_CHECK_FAILED' (([string]$second.code)+' '+([string]$second.detail))
  }
  Add-Check 'processRestartMediaDurability' 'PASS' ([string]$second.code)
  $report.finalStatus='PASS_ISOLATED_ONLY'
  Save-Report
  Write-Host 'PASS_ISOLATED_ONLY - fresh restore and force-stop/relaunch confirmed.' -ForegroundColor Green
  Write-Host ('Report: '+(Join-Path $Out 'report.json'))
  Write-Host 'Send ONLY report.json to ChatGPT. Do not send user media.'
} catch {
  if($report.finalStatus -ne 'BLOCKED') {
    $report.finalStatus='BLOCKED'
    $report.blockCode='UNEXPECTED_SCRIPT_ERROR'
    $report.detail=$_.Exception.Message
    Save-Report
  }
  Write-Host ('BLOCKED: '+$report.blockCode) -ForegroundColor Red
  Write-Host ($_.Exception.Message)
  Write-Host ('Result folder: '+$Out)
  exit 1
}
