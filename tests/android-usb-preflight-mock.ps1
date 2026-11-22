# Self-contained Windows test of the isolated Call-Adb function: no actual ADB or phone.
$ErrorActionPreference = 'Stop'
$source = Join-Path (Get-Location) 'tools/android-usb-device-readonly-preflight.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'PREFLIGHT_PARSE_FAILED' }
$fn = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Call-Adb' }, $true))
if ($fn.Count -ne 1) { throw 'CALL_ADB_FUNCTION_UNAVAILABLE' }
Invoke-Expression $fn[0].Extent.Text
$exe = Join-Path $env:RUNNER_TEMP 'paseka-mock-adb.exe'
$code = @'
using System;
public static class MockADB {
  public static int Main(string[] args) {
    string mode = Environment.GetEnvironmentVariable("PASEKA_ADB_MOCK_MODE") ?? "";
    if (mode == "absent") { return 1; }
    if (mode == "present") { Console.WriteLine("package:/data/app/isolated-test/base.apk"); return 0; }
    if (mode == "query-error") { Console.Error.WriteLine("permission denied"); return 1; }
    if (mode == "bad-empty") { return 0; }
    if (mode == "other-failure") { return 1; }
    return 5;
  }
}
'@
Add-Type -TypeDefinition $code -OutputAssembly $exe -OutputType ConsoleApplication
$script:AdbPath = $exe
$pkgArgs = @('-s','TEST_SERIAL','shell','pm','path','ru.paseka.journal')
$testArgs = @('-s','TEST_SERIAL','shell','pm','path','ru.paseka.journal.archive.restoreproof335')
function Assert-Throws([scriptblock]$Action, [string]$Expected) {
  try { & $Action; throw 'UNEXPECTED_SUCCESS' }
  catch {
    if ($_.Exception.Message -notlike ('*' + $Expected + '*')) {
      throw ('UNEXPECTED_ERROR: ' + $_.Exception.Message)
    }
  }
}
try {
  $env:PASEKA_ADB_MOCK_MODE = 'absent'
  if ((Call-Adb $pkgArgs -AllowMissingPackage) -cne '__PACKAGE_ABSENT__') { throw 'MISSING_PACKAGE_NOT_CLASSIFIED' }
  if ((Call-Adb $testArgs -AllowMissingPackage) -cne '__PACKAGE_ABSENT__') { throw 'MISSING_DIAGNOSTIC_PACKAGE_NOT_CLASSIFIED' }
  Assert-Throws { Call-Adb $pkgArgs } 'ADB_COMMAND_FAILED_1'
  $env:PASEKA_ADB_MOCK_MODE = 'present'
  if ((Call-Adb $pkgArgs -AllowMissingPackage) -cne 'package:/data/app/isolated-test/base.apk') { throw 'PACKAGE_PRESENT_NOT_RECOGNIZED' }
  $env:PASEKA_ADB_MOCK_MODE = 'query-error'
  Assert-Throws { Call-Adb $pkgArgs -AllowMissingPackage } 'ADB_COMMAND_FAILED_1'
  $env:PASEKA_ADB_MOCK_MODE = 'other-failure'
  Assert-Throws { Call-Adb @('-s','TEST_SERIAL','shell','getprop','ro.product.model') -AllowMissingPackage } 'ADB_COMMAND_FAILED_1'
  $env:PASEKA_ADB_MOCK_MODE = 'bad-empty'
  if ((Call-Adb $pkgArgs -AllowMissingPackage) -cne '') { throw 'UNEXPECTED_EMPTY_RESULT' }
  Write-Host 'ANDROID_USB_MOCK_ALL_CASES_PASS'
}
finally {
  Remove-Item Env:PASEKA_ADB_MOCK_MODE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $exe -ErrorAction SilentlyContinue
}
