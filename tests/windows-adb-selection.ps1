Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Exercise the production PowerShell functions without any real device/network.
$path = Join-Path $PSScriptRoot '..\scripts\windows\Run-Paseka-Tests.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'Cannot parse launcher' }
$names = @('Test-PrivateWifiEndpoint', 'Find-TestDevice')
$definitions = @($ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
  $names -contains $node.Name
}, $true))
if ($definitions.Count -ne 2) { throw 'Missing ADB selection functions' }
foreach ($definition in $definitions) { . ([scriptblock]::Create($definition.Extent.Text)) }
foreach ($endpoint in @('192.168.1.42:37123', '10.1.2.3:5555', '172.20.0.4:12345')) {
  if (!(Test-PrivateWifiEndpoint $endpoint)) { throw ('Rejected private address: ' + $endpoint) }
}
foreach ($endpoint in @('8.8.8.8:5555', '172.32.1.2:5555', '192.168.1.256:5555', '192.168.1.3:0', '192.168.1.3:99999', '192.168.1.3:5555;rm', 'localhost:5555')) {
  if (Test-PrivateWifiEndpoint $endpoint) { throw ('Accepted unsafe endpoint: ' + $endpoint) }
}
$testDir = Join-Path $env:RUNNER_TEMP ('paseka-adb-selection-' + [guid]::NewGuid().ToString('N'))
[void](New-Item -Path $testDir -ItemType Directory -Force)
$Adb = Join-Path $testDir 'fake-adb.cmd'
$batch = @'
@echo off
echo List of devices attached
if "%PASEKA_FAKE_MODE%"=="usb" echo R52NUSB123 device
if "%PASEKA_FAKE_MODE%"=="both" (
 echo R52NUSB123 device
 echo 192.168.1.42:37123 device
)
if "%PASEKA_FAKE_MODE%"=="wifi" echo 192.168.1.42:37123 device
if "%PASEKA_FAKE_MODE%"=="two-usb" (
 echo R52NUSB123 device
 echo R52NUSB456 device
)
exit /b 0
'@
try {
  [System.IO.File]::WriteAllText($Adb, $batch, [System.Text.Encoding]::ASCII)
  $env:PASEKA_FAKE_MODE = 'both'
  if ((Find-TestDevice '192.168.1.42:37123') -cne 'R52NUSB123') { throw 'USB must win over Wi-Fi' }
  $env:PASEKA_FAKE_MODE = 'wifi'
  if ((Find-TestDevice '192.168.1.42:37123') -cne '192.168.1.42:37123') { throw 'Explicitly paired Wi-Fi not selected' }
  if (Find-TestDevice '') { throw 'Wi-Fi without opt-in must not be selected' }
  if (Find-TestDevice '192.168.1.99:37123') { throw 'Unmatched Wi-Fi endpoint selected' }
  $env:PASEKA_FAKE_MODE = 'two-usb'
  $refused = $false
  try { $null = Find-TestDevice '192.168.1.42:37123' } catch { $refused = $true }
  if (!$refused) { throw 'Multiple USB devices must fail closed' }
  Write-Host 'Windows PowerShell 5.1 ADB selection: private Wi-Fi, USB priority, opt-in and ambiguous-device refusal PASS'
} finally {
  Remove-Item Env:PASEKA_FAKE_MODE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $testDir -Recurse -Force -ErrorAction SilentlyContinue
}
