Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Execute the real report-polling functions with a fake native ADB executable
# on Windows PowerShell 5.1. This test never connects to an Android device.
$path = Join-Path $PSScriptRoot '..\scripts\windows\Run-Paseka-Tests.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Unable to parse device launcher' }
$functions = @($ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
  ($node.Name -eq 'Read-DeviceReport' -or $node.Name -eq 'Wait-Report')
}, $true))
if ($functions.Count -ne 2) { throw 'Missing report reader and retry functions' }
foreach ($definition in $functions) {
  . ([scriptblock]::Create($definition.Extent.Text))
}

$testDir = Join-Path $env:RUNNER_TEMP ('paseka-report-probe-' + [guid]::NewGuid().ToString('N'))
[void](New-Item -Path $testDir -ItemType Directory -Force)
$Adb = Join-Path $testDir 'fake-adb.cmd'
$Package = 'ru.paseka.journal.device.r123456789a1'
$RunId = 'ci-report-probe'
$env:PASEKA_FAKE_ADB_COUNTER = Join-Path $testDir 'retry-marker.txt'
$batch = @'
@echo off
if "%PASEKA_FAKE_ADB_MODE%"=="missing" goto missing
if "%PASEKA_FAKE_ADB_MODE%"=="delayed" (
  if not exist "%PASEKA_FAKE_ADB_COUNTER%" (
    echo first > "%PASEKA_FAKE_ADB_COUNTER%"
    goto missing
  )
)
echo {"runId":"ci-report-probe","phase":"awaiting_restart","pass":true}
exit /b 0
:missing
echo cat: files/paseka-device-report.json: No such file or directory 1>&2
exit /b 1
'@
try {
  [System.IO.File]::WriteAllText($Adb, $batch, [System.Text.Encoding]::ASCII)

  $env:PASEKA_FAKE_ADB_MODE = 'missing'
  $first = Read-DeviceReport -Serial 'mock-serial'
  if ($null -ne $first) { throw 'A missing report must return null, not an error or a report' }
  if ($ErrorActionPreference -ne 'Stop') { throw 'Report probe changed the caller error policy' }

  $env:PASEKA_FAKE_ADB_MODE = 'ready'
  $ready = Read-DeviceReport -Serial 'mock-serial'
  if ($null -eq $ready -or $ready.runId -ne $RunId -or $ready.phase -ne 'awaiting_restart') {
    throw 'Reader did not decode a valid JSON report'
  }

  $env:PASEKA_FAKE_ADB_MODE = 'delayed'
  $retried = Wait-Report -Serial 'mock-serial' -Phases @('awaiting_restart') -TimeoutSec 8
  if ($null -eq $retried -or $retried.pass -ne $true) {
    throw 'Missing report was not retried successfully'
  }
  Write-Host 'Windows PowerShell 5.1 native stderr handling: missing, valid and delayed report PASS'
} finally {
  Remove-Item Env:PASEKA_FAKE_ADB_MODE -ErrorAction SilentlyContinue
  Remove-Item Env:PASEKA_FAKE_ADB_COUNTER -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $testDir -Recurse -Force -ErrorAction SilentlyContinue
}
