$ErrorActionPreference='Stop'
$adb=Get-Command adb.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if(-not $adb){
 $candidate=Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
 if(Test-Path $candidate){$adb=$candidate}
}
if(-not $adb){Write-Host 'BLOCKED: ADB unavailable';exit 1}
$node=Join-Path $PSScriptRoot 'node.exe'
$script=Join-Path $PSScriptRoot 'scripts\probe-oneplus-encoded-shell.mjs'
if(-not (Test-Path $node) -or -not (Test-Path $script)){Write-Host 'BLOCKED: incomplete kit';exit 1}
$env:PASEKA_ADB=$adb
Write-Host 'READ-ONLY BASE64 COMMAND PROBE: public test string only.'
Write-Host 'No backup, no TAR, no app-private files, no stop/install/delete.'
& $node $script
$rc=$LASTEXITCODE
if($rc -ne 0){Write-Host 'READ-ONLY PROBE BLOCKED'}
