Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 mock: no real phone, no network and no GitHub writes.
$root = Join-Path $PSScriptRoot '..\scripts\windows'
foreach ($name in @('Run-Paseka-Tests.ps1','Invoke-Paseka-Test-Agent.ps1','Publish-Paseka-Test-Report.ps1')) {
  $path = Join-Path $root $name
  $tokens = $null
  $errors = $null
  [Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors) | Out-Null
  if ($errors.Count -gt 0) {
    foreach ($error in $errors) { Write-Host $error.ToString() }
    throw ('Windows PowerShell 5.1 parse failure: ' + $name)
  }
  $bytes = [IO.File]::ReadAllBytes($path)
  if ($bytes.Length -lt 3 -or $bytes[0] -ne 239 -or $bytes[1] -ne 187 -or $bytes[2] -ne 191) {
    throw ('PowerShell 5.1 requires BOM: ' + $name)
  }
}
$dir = Join-Path $env:RUNNER_TEMP ('paseka-agent-mock-' + [guid]::NewGuid().ToString('N'))
[void](New-Item -Path (Join-Path $dir 'reports\agent-mock') -ItemType Directory -Force)
try {
  Copy-Item -LiteralPath (Join-Path $root 'Publish-Paseka-Test-Report.ps1') -Destination $dir
  Set-Content -LiteralPath (Join-Path $dir 'paseka-device-test.apk') -Value 'synthetic APK never installed' -Encoding ASCII
  $hash = (Get-FileHash -LiteralPath (Join-Path $dir 'paseka-device-test.apk') -Algorithm SHA256).Hash
  Set-Content -LiteralPath (Join-Path $dir 'paseka-device-test.sha256') -Value $hash
  Set-Content -LiteralPath (Join-Path $dir 'device-build-sha.txt') -Value '2181e56faeca7cd56ffb00ae92b12054a14fd526'
  Set-Content -LiteralPath (Join-Path $dir 'device-package.txt') -Value 'ru.paseka.journal.device.r44602022835a1'
  $names = @(
    'app_startup_and_webview','hive_card_last_event_and_empty_hive',
    'archive_export_preflight_commit_rollback',
    'native_downloads_reject_incomplete_and_oversize',
    'native_downloads_archive_hash_and_cleanup',
    'archive_rejects_unconfirmed_treatment',
    'archive_revision_guard_preserves_new_treatment',
    'real_android_restart_persists_indexeddb',
    'real_card_renderer_after_restart'
  )
  $checks = @($names | ForEach-Object { @{ name = $_; result = 'PASS'; durationMs = 0; error = 'PRIVATE-APIARY-DATA-NEVER-SEND' } })
  $runId = '1234567890abcdefabcd'
  $report = @{
    format = 'paseka-windows-test-report-v1'; status = 'PASS'; mode = 'normal'; runId = $runId
    testedPackage = 'ru.paseka.journal.device.r44602022835a1'
    error = 'PRIVATE-APIARY-DATA-NEVER-SEND'
    phaseOne = @{ format = 'paseka-device-test-v1'; mode = 'normal'; runId = $runId
      phase = 'awaiting_restart'; pass = $true; checks = @($checks | Select-Object -First 7) }
    final = @{ format = 'paseka-device-test-v1'; mode = 'normal'; runId = $runId
      phase = 'complete'; pass = $true; checks = $checks }
  }
  $path = Join-Path $dir 'reports\agent-mock\report.json'
  $report | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $path -Encoding UTF8
  $publisher = Join-Path $dir 'Publish-Paseka-Test-Report.ps1'
  $safe = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publisher -Action DryRun -ReportPath $path | Out-String)
  if ($LASTEXITCODE -ne 0 -or $safe -notmatch '9/9' -or $safe -notmatch 'paseka-test-agent:1234567890abcdefabcd') {
    throw 'Valid synthetic 9/9 report was not safely formatted.'
  }
  if ($safe -match 'PRIVATE-APIARY-DATA-NEVER-SEND' -or $safe -match 'durationMs|error.*PRIVATE') {
    throw 'Sensitive raw report field leaked into public summary.'
  }
  $report.testedPackage = 'ru.paseka.journal'
  $report | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $path -Encoding UTF8
  $rejected = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publisher -Action DryRun -ReportPath $path | Out-String)
  if ($LASTEXITCODE -eq 0 -or $rejected -notmatch 'refusing') { throw 'Production package was not rejected.' }
  $report.testedPackage = 'ru.paseka.journal.device.r44602022835a1'
  $report | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $path -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $dir 'paseka-device-test.sha256') -Value ('f' * 64)
  $rejected = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publisher -Action DryRun -ReportPath $path | Out-String)
  if ($LASTEXITCODE -eq 0 -or $rejected -notmatch 'hash mismatch') { throw 'Tampered APK was not rejected.' }
  Set-Content -LiteralPath (Join-Path $dir 'paseka-device-test.sha256') -Value $hash
  $outside = Join-Path $dir 'report-outside.json'
  Copy-Item -LiteralPath $path -Destination $outside
  $rejected = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publisher -Action DryRun -ReportPath $outside | Out-String)
  if ($LASTEXITCODE -eq 0 -or $rejected -notmatch 'not inside') { throw 'External report path was not rejected.' }
  $source = Get-Content -LiteralPath (Join-Path $root 'Invoke-Paseka-Test-Agent.ps1') -Raw
  if ($source -match 'Register-ScheduledTask|Invoke-Expression|DownloadFile|pm clear|uninstall|adb tcpip') {
    throw 'Agent contains forbidden scheduler or remote execution commands.'
  }
  $publishSource = Get-Content -LiteralPath (Join-Path $root 'Publish-Paseka-Test-Report.ps1') -Raw
  if ($publishSource -notmatch 'ConvertFrom-SecureString' -or
      $publishSource -notmatch 'ZeroFreeBSTR' -or
      $publishSource -notmatch 'paseka-test-agent:' -or
      $publishSource -match 'github\.com/.*/releases') {
    throw 'DPAPI or upload guards are missing.'
  }
  Write-Host 'PASS: Windows PS 5.1 parsed agent, sanitized PASS, rejected production package, tampered APK and report outside kit.'
} finally {
  Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
}
