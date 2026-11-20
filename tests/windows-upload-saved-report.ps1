$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot '..\scripts\windows\Upload-Saved-Report.ps1'
$source = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $script).Path)
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { throw 'Upload-Saved-Report syntax failed in PowerShell 5.1.' }
foreach ($required in @('Publish-Paseka-Test-Report.ps1', "-Action Upload", "Filter 'report.json'", 'Multiple report.json files', 'sanitized')) {
  if (!$source.Contains($required)) { throw ('Missing safe saved-report upload guard: ' + $required) }
}
if ($source -match 'Invoke-RestMethod|Invoke-WebRequest|Remove-Item|Content.*Get-Content|Send-') {
  throw 'Upload wrapper must not read raw report, send a network request, or delete local files.'
}
$cmd = Join-Path $PSScriptRoot '..\scripts\windows\UPLOAD-SAVED-REPORT.cmd'
$cmdSource = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $cmd).Path)
if (!$cmdSource.Contains('%~dp0Upload-Saved-Report.ps1')) {
  throw 'CMD must launch the companion script from the flat ZIP root.'
}
$temp = Join-Path $env:TEMP ('paseka-report-uploader-test-' + [Guid]::NewGuid().ToString('N'))
try {
  [void](New-Item -Path $temp -ItemType Directory)
  Copy-Item -LiteralPath $script -Destination (Join-Path $temp 'Upload-Saved-Report.ps1')
  $reports = Join-Path $temp 'reports'
  [void](New-Item -Path $reports -ItemType Directory)
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $temp 'Upload-Saved-Report.ps1') | Out-Null
  if ($LASTEXITCODE -ne 1) { throw 'Missing report must not trigger upload.' }
  [void](New-Item -Path (Join-Path $reports 'first') -ItemType Directory)
  [void](New-Item -Path (Join-Path $reports 'second') -ItemType Directory)
  [System.IO.File]::WriteAllText((Join-Path $reports 'first\report.json'), '{}')
  [System.IO.File]::WriteAllText((Join-Path $reports 'second\report.json'), '{}')
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $temp 'Upload-Saved-Report.ps1') | Out-Null
  if ($LASTEXITCODE -ne 1) { throw 'Ambiguous reports must not trigger upload.' }
  if (!(Test-Path (Join-Path $reports 'first\report.json')) -or !(Test-Path (Join-Path $reports 'second\report.json'))) {
    throw 'A source report was unexpectedly deleted.'
  }
} finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
Write-Host 'PASS: PowerShell 5.1 saved-report launcher rejects zero/multiple reports, no raw upload, no file deletion.'
exit 0
