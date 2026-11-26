$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$folder=New-Object System.Windows.Forms.FolderBrowserDialog
$folder.Description='Select existing folder on separate trusted drive to store OnePlus app-private backup'
$folder.ShowNewFolderButton=$false
if($folder.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
 Write-Host 'CANCELLED_BY_USER; no device operations performed.'
 exit 0
}
$adb = (Get-Command adb.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if(-not $adb) {
 $candidate = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
 if(Test-Path $candidate) { $adb=$candidate }
}
if(-not $adb) {
 Write-Host 'BLOCKED: ADB was not found. No phone data changed.'
 Write-Host 'Use an already-authorized Android SDK platform-tools adb.exe.'
 exit 1
}
$env:PASEKA_ADB=$adb
$node=Join-Path $PSScriptRoot 'node.exe'
$script=Join-Path $PSScriptRoot 'scripts\backup-oneplus-cold-sandbox.mjs'
if(-not (Test-Path $node) -or -not (Test-Path $script)) {
 Write-Host 'BLOCKED: incomplete local kit.'
 exit 1
}
Write-Host 'ONLY ONE phone must be authorized over ADB.'
Write-Host 'Close Paseka normally on OnePlus before running. No force-stop/install/clear is performed.'
Write-Host 'Do not upload the resulting TAR to GitHub or ChatGPT; it contains app-private data.'
# The native Node runner intentionally returns exit 2 for any cold-file backup
# because independent Android restoration has NOT been verified.
$lines = & $node $script --dest $folder.SelectedPath 2>&1
$code=$LASTEXITCODE
$report=($lines | ForEach-Object {$_.ToString()}) -join "`n"
try{
 $result=$report | ConvertFrom-Json
 if($result.schema -ne 'paseka-oneplus-cold-sandbox-backup-v1' -or
    $result.originalsDeleted -eq $true -or
    $result.installedApplicationChanged -eq $true) { throw 'INVALID_RESULT' }
 $status=$result.status
}catch{$status='BLOCKED_UNREADABLE_REPORT'}
if($code -eq 2 -and $status -eq 'APP_PRIVATE_COLD_TAR_ARCHIVED_RESTORE_NOT_TESTED'){
 Write-Host 'APP-PRIVATE ARCHIVE CREATED. Note: full independent physical restore NOT verified.'
 Write-Host "Destination: $($folder.SelectedPath)"
 Write-Host "Archive filename: $($result.file)"
 Write-Host "SHA256: $($result.sha256)"
 Write-Host 'Keep the archive private, preferably on an encrypted external drive.'
}else{
 Write-Host "BACKUP NOT VERIFIED: $status"
 Write-Host 'Check that OnePlus is USB-authorized, that the app is closed normally, and that run-as works.'
 Write-Host 'No phone files were deleted or modified.'
}
Write-Host 'Press Enter to close.'
[void][Console]::ReadLine()
