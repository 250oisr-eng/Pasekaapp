Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1-only test; never contacts an Android device or registers tasks.
$root = Join-Path $PSScriptRoot '..\scripts\windows'
foreach ($file in @('Run-Local-Scheduled.ps1', 'Register-Local-Scheduled.ps1')) {
  $tokens = $null
  $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $root $file), [ref]$tokens, [ref]$errors)
  if ($errors.Count -ne 0 -or $null -eq $ast) { throw ('Parser errors in ' + $file) }
}
$dir = Join-Path $env:RUNNER_TEMP ('paseka-scheduled-mock-' + [guid]::NewGuid().ToString('N'))
[void](New-Item -Path (Join-Path $dir 'platform-tools') -ItemType Directory -Force)
try {
  Copy-Item -LiteralPath (Join-Path $root 'Run-Local-Scheduled.ps1') -Destination $dir
  Copy-Item -LiteralPath (Join-Path $root 'Register-Local-Scheduled.ps1') -Destination $dir
  Set-Content -LiteralPath (Join-Path $dir 'platform-tools\adb.exe') -Value 'no real adb'
  Set-Content -LiteralPath (Join-Path $dir 'Run-Paseka-Tests.ps1') -Value 'throw "This must not be invoked by dry-run"'
  Set-Content -LiteralPath (Join-Path $dir 'paseka-device-test.apk') -Value 'mock APK, never installed'
  $hash = (Get-FileHash -LiteralPath (Join-Path $dir 'paseka-device-test.apk') -Algorithm SHA256).Hash
  Set-Content -LiteralPath (Join-Path $dir 'paseka-device-test.sha256') -Value $hash
  $pkg = 'ru.paseka.journal.device.r44526817635a1'
  Set-Content -LiteralPath (Join-Path $dir 'device-package.txt') -Value $pkg
  [void](New-Item -ItemType Directory -Path (Join-Path $dir 'reports\manual') -Force)
  $runner = Join-Path $dir 'Run-Local-Scheduled.ps1'
  $register = Join-Path $dir 'Register-Local-Scheduled.ps1'
  & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $runner 2>$null
  if ($LASTEXITCODE -eq 0) { throw 'Unapproved kit was permitted' }
  $report = @{
    format = 'paseka-windows-test-report-v1'
    status = 'PASS'
    testedPackage = $pkg
    final = @{ phase = 'complete'; pass = $true; checks = @(
      1..9 | ForEach-Object { @{ name = ('test-' + $_); result = 'PASS' } }
    ) }
  } | ConvertTo-Json -Depth 8
  Set-Content -LiteralPath (Join-Path $dir 'reports\manual\report.json') -Value $report
  & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $runner
  if ($LASTEXITCODE -ne 0) { throw 'Approved kit rejected the no-ADB preview' }
  & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $register -DailyAt '20:30'
  if ($LASTEXITCODE -ne 0) { throw 'Task preview failed' }
  # A changed isolated package requires a new manual PASS.
  Set-Content -LiteralPath (Join-Path $dir 'device-package.txt') -Value 'ru.paseka.journal.device.r44526817635a2'
  & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $runner 2>$null
  if ($LASTEXITCODE -eq 0) { throw 'Changed package reused old approval' }
  # A changed APK also invalidates a previously approved local kit.
  Set-Content -LiteralPath (Join-Path $dir 'device-package.txt') -Value $pkg
  Set-Content -LiteralPath (Join-Path $dir 'paseka-device-test.apk') -Value 'tampered'
  & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $runner 2>$null
  if ($LASTEXITCODE -eq 0) { throw 'APK hash mismatch was not rejected' }
  Write-Host 'Windows PowerShell 5.1 local scheduler: fail-closed approval, preview, hash and package pin PASS'
} finally {
  Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
}
# Negative mock cases deliberately leave a child process nonzero.
# The test itself passed all assertions; do not leak that exit code into CI.
exit 0
