# Run ONLY from the extracted isolated Windows 11 Android test kit.
# Never publishes raw JSON/screenshots: delegate strict sanitization to publisher.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$kit = $PSScriptRoot
$reports = Join-Path $kit 'reports'
$publisher = Join-Path $kit 'Publish-Paseka-Test-Report.ps1'
if (!(Test-Path -LiteralPath $publisher -PathType Leaf)) {
  Write-Host 'ERROR: Missing isolated report publisher. Nothing was uploaded.' -ForegroundColor Red
  exit 1
}
if (!(Test-Path -LiteralPath $reports -PathType Container)) {
  Write-Host 'No local reports directory. Nothing was uploaded.' -ForegroundColor Yellow
  exit 1
}
# Only canonical report.json produced by the test runner is eligible.
# Do not search arbitrary user directories or send screenshots.
$matches = @(Get-ChildItem -LiteralPath $reports -Filter 'report.json' -File -Recurse |
  Sort-Object LastWriteTime -Descending)
if ($matches.Count -eq 0) {
  Write-Host 'No report.json in kit reports. Nothing was uploaded.' -ForegroundColor Yellow
  exit 1
}
if ($matches.Count -gt 1) {
  Write-Host ('Multiple report.json files (' + $matches.Count + '). Select a specific report manually; no automatic upload.') -ForegroundColor Yellow
  exit 1
}
$report = $matches[0]
Write-Host 'Found one local report. Publishing sanitized synthetic-only summary; no screenshots.'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publisher -Action Upload -ReportPath $report.FullName
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Upload unconfirmed. Report remains on PC. Do not rerun device test.' -ForegroundColor Yellow
  exit 1
}
Write-Host 'Summary submitted. Original report and screenshots remain on PC.'
exit 0
