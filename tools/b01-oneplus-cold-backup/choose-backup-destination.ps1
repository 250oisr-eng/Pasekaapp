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
# The Node runner always writes a sanitized JSON result to stdout.
# Avoid 2>&1: Windows PowerShell 5.1 turns native stderr on nonzero exit
# into a terminating NativeCommandError under ErrorActionPreference=Stop.
$lines = & $node $script --dest $folder.SelectedPath
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
 if($result -and $result.code){ Write-Host "Failure code: $($result.code)" }
 switch($result.code) {
  'ADB_NO_DEVICE' { Write-Host 'No connected authorized phone found: check USB cable and USB debugging.' }
  'ADB_MULTIPLE_DEVICES' { Write-Host 'More than one Android device is connected. Disconnect other devices.' }
  'ADB_DEVICE_UNAUTHORIZED' { Write-Host 'Unlock OnePlus and accept the USB debugging authorization prompt.' }
  'APP_MUST_BE_STOPPED_MANUALLY' { Write-Host 'The Paseka process is running. Close the app normally, then retry.' }
  'RUN_AS_UNAVAILABLE' { Write-Host 'The installed app does not permit run-as. Do not uninstall it or clear data.' }
  'WEBVIEW_DIRECTORY_NOT_ACCESSIBLE' { Write-Host 'Private WebView directory not accessible. No backup was created.' }
  'DESTINATION_NOT_CANONICAL' { Write-Host 'Use a normal local folder directly, not a symbolic link or alias.' }
  default { Write-Host 'Do not remove or reset the installed application.' }
 }
 Write-Host 'No phone files were deleted or modified.'
}
Write-Host 'Press Enter to close.'
[void][Console]::ReadLine()
