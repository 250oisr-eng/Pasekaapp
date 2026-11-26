$ErrorActionPreference='Stop'
$adb=Get-Command adb.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if(-not $adb) {
 $candidate=Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
 if(Test-Path $candidate){$adb=$candidate}
}
if(-not $adb) {
 Write-Host '{"schema":"paseka-oneplus-process-readonly-diagnostic-v1","status":"BLOCKED","code":"ADB_EXEC_NOT_AVAILABLE","phoneDataModified":false}'
 exit 1
}
$env:PASEKA_ADB=$adb
$node=Join-Path $PSScriptRoot 'node.exe'
$script=Join-Path $PSScriptRoot 'scripts\diagnose-oneplus-process-readonly.mjs'
if(-not (Test-Path $node) -or -not (Test-Path $script)) {
 Write-Host '{"schema":"paseka-oneplus-process-readonly-diagnostic-v1","status":"BLOCKED","code":"INCOMPLETE_DIAGNOSTIC_KIT","phoneDataModified":false}'
 exit 1
}
Write-Host 'ONEPLUS READ-ONLY PROCESS DIAGNOSTIC: NO force-stop, install, delete, TAR or phone writes.'
Write-Host 'Please send only the JSON report below; no personal files are accessed or printed.'
& $node $script
$code=$LASTEXITCODE
Write-Host 'Diagnostic finished. No application state was changed by this tool.'
if($code -ne 0){Write-Host "Read-only diagnostics blocked with exit code $code"}
