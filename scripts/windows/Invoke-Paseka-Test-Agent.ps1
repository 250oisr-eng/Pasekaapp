param([switch]$Offline)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Runs only after an explicit Windows double-click. Never schedules or remotely executes tests.
$agentRunId = [guid]::NewGuid().ToString('N')
$testScript = Join-Path $PSScriptRoot 'Run-Paseka-Tests.ps1'
$publisher = Join-Path $PSScriptRoot 'Publish-Paseka-Test-Report.ps1'
$report = Join-Path $PSScriptRoot ('reports\agent-' + $agentRunId + '\report.json')
if (!(Test-Path -LiteralPath $testScript) -or !(Test-Path -LiteralPath $publisher)) {
  Write-Host 'Incomplete local agent kit; no test or upload performed.' -ForegroundColor Red
  exit 1
}
Write-Host 'Paseka local test agent: manual-only USB Android test; sanitized report -> GitHub issue #198'
Write-Host ('Mode: ' + $(if ($Offline) { 'manual-offline' } else { 'normal' }))
$argsForTest = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$testScript,'-AgentRunId',$agentRunId)
if ($Offline) { $argsForTest += '-Offline' }
& powershell.exe @argsForTest
$testCode = $LASTEXITCODE
if (!(Test-Path -LiteralPath $report -PathType Leaf)) {
  Write-Host 'Local device report missing. Nothing is uploaded.' -ForegroundColor Red
  exit 1
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publisher -Action Upload -ReportPath $report
$uploadCode = $LASTEXITCODE
if ($uploadCode -ne 0) {
  Write-Host 'Report retained on this PC. Run RETRY-REPORT-UPLOAD.cmd after checking connection/token.' -ForegroundColor Yellow
}
if ($testCode -ne 0 -or $uploadCode -ne 0) { exit 1 }
Write-Host 'Test result confirmed and sanitized summary published to issue #198.' -ForegroundColor Green
