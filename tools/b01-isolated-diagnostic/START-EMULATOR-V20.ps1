# B01 V20 launch on the user's Windows PC only.
# Requires a previously created/running AVD named PASEKA_B01_ISOLATED_*.
# Nothing is installed on any physical phone; only one attested emulator is targeted.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$here=$PSScriptRoot
$report=Join-Path $here 'B01-RESULT.json'
if(Test-Path -LiteralPath $report){Write-Host 'Existing B01-RESULT.json preserved. Extract a fresh package if another run is needed.';exit 0}
$node=Join-Path $here 'node.exe'
$apk=Join-Path $here 'B01-diagnostic.apk'
$aapt=Join-Path $here 'aapt.exe'
if(-not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath $apk) -or -not (Test-Path -LiteralPath $aapt)){
 Write-Host 'BLOCKED: incomplete package; no device operation attempted';exit 3
}
$adb=$null
foreach($candidate in @(
  (Join-Path $here 'adb.exe'),
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
  (Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk\platform-tools\adb.exe')
)){
 if((Test-Path -LiteralPath $candidate -PathType Leaf) -and $null -eq $adb){$adb=$candidate}
}
if($null -eq $adb){
 $command=Get-Command adb.exe -ErrorAction SilentlyContinue
 if($null -ne $command){$adb=$command.Source}
}
if($null -eq $adb){Write-Host 'BLOCKED: Android SDK adb.exe not found; no device operation attempted';exit 4}
$root=Join-Path $env:USERPROFILE 'PASEKA-B01-KEEP-PRIVATE-CANDIDATES'
Write-Host 'Checking ONLY a fresh isolated PASEKA_B01_ISOLATED_* Android emulator.'
Write-Host 'The original OnePlus and live Paseka package are never modified.'
& $node (Join-Path $here 'transfer-cli.mjs') '--root' $root '--adb' $adb '--apk' $apk '--aapt' $aapt
$exit=$LASTEXITCODE
if($exit -eq 0){
 Write-Host 'Transfer/byte-readback gate complete. Do not delete original files.'
 Write-Host 'To test IndexedDB itself, launch the diagnostic app in this emulator.'
}else{
 Write-Host 'No full backup or IndexedDB restore has been proven; review the local B01-RESULT.json.'
}
exit $exit
