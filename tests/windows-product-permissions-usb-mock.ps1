# Windows PowerShell simulation: execute the real one-shot installer against fake adb.cmd.
# No Android SDK, connected device, GitHub download, user files or installed APK required.
$ErrorActionPreference='Stop'
$repoRoot=Split-Path -Parent $PSScriptRoot
$installer=Join-Path $repoRoot 'tools/android-product-permissions-one-shot.ps1'
if(-not (Test-Path -LiteralPath $installer)){throw 'INSTALLER_MISSING'}
$dir=Join-Path ([IO.Path]::GetTempPath()) ('paseka-usb-mock-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -Path $dir -ItemType Directory
$originalPath=$env:PATH
$worker=Join-Path $dir 'worker.ps1'
$adb=Join-Path $dir 'adb.cmd'
$apk=Join-Path $dir 'dummy.apk'
try {
 # Only a dummy size fixture, never a real artifact; mock digest is limited to worker.
 $bytes=New-Object byte[] 1000001
 [IO.File]::WriteAllBytes($apk,$bytes)
 @'
@echo off
echo %*>>"%MOCK_ADB_LOG%"
if "%~1"=="devices" (
 if "%MOCK_SCENARIO%"=="no-device" (
  echo List of devices attached
  exit /b 0
 )
 if "%MOCK_SCENARIO%"=="unauthorized" (
  echo List of devices attached
  echo MOCK123 unauthorized usb:1-1
  exit /b 0
 )
 echo List of devices attached
 echo MOCK123 device product:mock usb:1-1
 exit /b 0
)
if "%~1"=="-d" if "%~2"=="shell" if "%~3"=="pm" if "%~4"=="path" (
 if "%~5"=="ru.paseka.journal" (
  if "%MOCK_SCENARIO%"=="no-product" (exit /b 0)
  echo package:/data/app/ru.paseka.journal/base.apk
  exit /b 0
 )
 if "%~5"=="ru.paseka.journal.diagnostic.productpermsv1" (
  if "%MOCK_SCENARIO%"=="preinstalled" (
   echo package:/data/app/ru.paseka.journal.diagnostic.productpermsv1/base.apk
   exit /b 0
  )
  if exist "%MOCK_INSTALLED_FLAG%" (
   echo package:/data/app/ru.paseka.journal.diagnostic.productpermsv1/base.apk
  )
  exit /b 0
 )
 exit /b 3
)
if "%~1"=="-d" if "%~2"=="install" (
 if "%MOCK_SCENARIO%"=="install-fail" (
  echo Failure [INSTALL_FAILED_INVALID_APK]
  exit /b 1
 )
 type nul > "%MOCK_INSTALLED_FLAG%"
 echo Success
 exit /b 0
)
if "%~1"=="-d" if "%~2"=="shell" if "%~3"=="monkey" (
 if not "%~4"=="-p" (exit /b 7)
 if not "%~5"=="ru.paseka.journal.diagnostic.productpermsv1" (exit /b 8)
 if "%MOCK_SCENARIO%"=="launch-fail" (exit /b 9)
 echo Events injected: 1
 exit /b 0
)
echo UNEXPECTED_COMMAND 1>&2
exit /b 90
'@ | Set-Content -LiteralPath $adb -Encoding ASCII
 # A worker-scoped fake digest tests control flow, never actual APK integrity.
 @'
param([string]$Installer,[string]$DummyApk)
function global:MockGetFileHash {
 param([string]$LiteralPath,[string]$Algorithm)
 Write-Host ('MOCK_HASH_INVOCATION: '+$env:MOCK_SCENARIO)
 if($LiteralPath -cne $DummyApk -or $Algorithm -cne 'SHA256'){throw 'UNEXPECTED_HASH_CALL'}
 if($env:MOCK_SCENARIO -eq 'bad-hash'){
  return [pscustomobject]@{Hash=('0'*64)}
 }
 return [pscustomobject]@{Hash='04fdba8e71f57bf896ca2af43149437d101d5ffc15f24d30c6f7bcf351bf1216'}
}
Set-Alias -Name Get-FileHash -Value MockGetFileHash -Scope Global -Force
Write-Host ('WORKER_HASH_RESOLUTION: '+(Get-Command Get-FileHash).CommandType)
Write-Host ('WORKER_HASH_TEST: '+(Get-FileHash -LiteralPath $DummyApk -Algorithm SHA256).Hash)
& $Installer -ApkPath $DummyApk
if($null -ne $LASTEXITCODE){exit $LASTEXITCODE}
'@ | Set-Content -LiteralPath $worker -Encoding UTF8
 $env:PATH=$dir+[IO.Path]::PathSeparator+$originalPath
 $shell=(Get-Command powershell.exe -CommandType Application -ErrorAction Stop).Source
 $cases=@(
  @{Name='no-device';Expected=2;Install=$false;Launch=$false;Reason='EXACTLY_ONE_AUTHORIZED_USB_DEVICE_REQUIRED'},
  @{Name='unauthorized';Expected=2;Install=$false;Launch=$false;Reason='EXACTLY_ONE_AUTHORIZED_USB_DEVICE_REQUIRED'},
  @{Name='no-product';Expected=2;Install=$false;Launch=$false;Reason='PRODUCT_NOT_INSTALLED_NO_TEST'},
  @{Name='preinstalled';Expected=2;Install=$false;Launch=$false;Reason='DIAGNOSTIC_ALREADY_PRESENT_NO_REINSTALL'},
  @{Name='bad-hash';Expected=2;Install=$false;Launch=$false;Reason='PINNED_APK_SHA256_MISMATCH'},
  @{Name='install-fail';Expected=2;Install=$true;Launch=$false;Reason='INSTALL_NOT_CONFIRMED'},
  @{Name='launch-fail';Expected=2;Install=$true;Launch=$true;Reason='DIAGNOSTIC_LAUNCH_NOT_CONFIRMED'},
  @{Name='success';Expected=0;Install=$true;Launch=$true;Reason='PASS_DIAGNOSTIC_INSTALLED_AND_LAUNCHED_ONLY'}
 )
 foreach($case in $cases){
  $name=$case.Name
  $log=Join-Path $dir ($name+'.log')
  $flag=Join-Path $dir ($name+'.installed')
  $env:MOCK_SCENARIO=$name
  $env:MOCK_ADB_LOG=$log
  $env:MOCK_INSTALLED_FLAG=$flag
  $output=& $shell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $worker -Installer $installer -DummyApk $apk 2>&1
  $exit=$LASTEXITCODE
  $result=($output -join [Environment]::NewLine)
  if($exit -ne $case.Expected){throw "CASE_$($name)_EXIT_$($exit): $result"}
  if(-not $result.Contains($case.Reason)){throw "CASE_$($name)_MISSING_REASON: $result"}
  if(-not $result.Contains('PHYSICAL_PERMISSION_AUDIT: NOT_TESTED')){throw "CASE_$($name)_PHYSICAL_STATUS_MISSING"}
  $lines=if(Test-Path -LiteralPath $log){@(Get-Content -LiteralPath $log)}else{@()}
  $installs=@($lines | Where-Object {$_ -match '^-d install '})
  $launches=@($lines | Where-Object {$_ -match '^-d shell monkey '})
  if(($installs.Count -eq 1) -ne $case.Install){throw "CASE_$($name)_INSTALL_COUNT_$($installs.Count)"}
  if(($launches.Count -eq 1) -ne $case.Launch){throw "CASE_$($name)_LAUNCH_COUNT_$($launches.Count)"}
  if($lines -match 'uninstall|force-stop|pm clear|install -r|run-as|exec-out|pull|push'){
   throw "CASE_$($name)_FORBIDDEN_ANDROID_COMMAND"
  }
  Write-Host ("MOCK_USB_{0}: PASS expected exit={1}, installs={2}, launches={3}" -f $name,$exit,$installs.Count,$launches.Count)
 }
 Write-Host 'WINDOWS_POWERSHELL_USB_MOCK_MATRIX: PASS 8/8'
}finally{
 $env:PATH=$originalPath
 Remove-Item Env:MOCK_SCENARIO -ErrorAction SilentlyContinue
 Remove-Item Env:MOCK_ADB_LOG -ErrorAction SilentlyContinue
 Remove-Item Env:MOCK_INSTALLED_FLAG -ErrorAction SilentlyContinue
 if(Test-Path -LiteralPath $dir){Remove-Item -LiteralPath $dir -Recurse -Force}
}
