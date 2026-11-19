param([switch]$Run)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Kit = $PSScriptRoot
$PackageFile = Join-Path $Kit 'device-package.txt'
$Apk = Join-Path $Kit 'paseka-device-test.apk'
$Checksum = Join-Path $Kit 'paseka-device-test.sha256'
$Launcher = Join-Path $Kit 'Run-Paseka-Tests.ps1'
$Adb = Join-Path $Kit 'platform-tools\adb.exe'
$Reports = Join-Path $Kit 'reports'

function Assert-ApprovedKit {
  if (!(Test-Path -LiteralPath $PackageFile) -or !(Test-Path -LiteralPath $Apk) -or
      !(Test-Path -LiteralPath $Checksum) -or !(Test-Path -LiteralPath $Launcher) -or
      !(Test-Path -LiteralPath $Adb) -or !(Test-Path -LiteralPath $Reports)) {
    throw 'Missing kit files or reports. First run START-TESTS.cmd manually.'
  }
  $package = (Get-Content -LiteralPath $PackageFile -Raw).Trim()
  if ($package -cnotmatch '^ru\.paseka\.journal\.device\.r[0-9]{6,20}a[1-9][0-9]{0,3}$') {
    throw 'Refusing non-isolated package.'
  }
  $expected = ((Get-Content -LiteralPath $Checksum -Raw).Trim() -split '\s+')[0]
  if ($expected -notmatch '^[a-fA-F0-9]{64}$') { throw 'Missing or invalid APK SHA-256.' }
  if ((Get-FileHash -LiteralPath $Apk -Algorithm SHA256).Hash -ine $expected) {
    throw 'APK changed since packaging. Refusing unattended execution.'
  }
  # Exact same test-only package must have completed a manual full PASS in
  # this kit directory. A new ZIP never auto-upgrades an existing installation.
  $approved = $false
  foreach ($file in @(Get-ChildItem -LiteralPath $Reports -Recurse -Filter 'report.json' -File)) {
    try {
      $report = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
      if ($report.format -eq 'paseka-windows-test-report-v1' -and
          $report.testedPackage -ceq $package -and $report.status -eq 'PASS' -and
          $report.final.phase -eq 'complete' -and $report.final.pass -eq $true -and
          @($report.final.checks).Count -eq 8 -and
          @($report.final.checks | Where-Object { $_.result -ne 'PASS' }).Count -eq 0) {
        $approved = $true
        break
      }
    } catch {
      # Malformed old report cannot authorize a test run.
    }
  }
  if (!$approved) { throw 'No matching 8/8 manual PASS for this isolated package. Run START-TESTS.cmd first.' }
  return $package
}

try {
  $package = Assert-ApprovedKit
  if (!$Run) {
    Write-Host ('DRY RUN: approved local kit for ' + $package)
    Write-Host 'No ADB commands, installs or scheduled tasks were executed.'
    exit 0
  }
  # USB only for unattended runs. Wi-Fi pairing/port is never persisted here.
  $env:PASEKA_ADB_WIFI_ENDPOINT = ''
  $env:PASEKA_SCHEDULED_NO_INSTALL = '1'
  # A dedicated child process preserves the existing runner's exit code.
  # It launches ONLY the existing pinned local script and installed test app.
  & (Join-Path $PSHOME 'powershell.exe') -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $Launcher
  exit $LASTEXITCODE
} catch {
  Write-Host ('Paseka scheduled selftest refused: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
