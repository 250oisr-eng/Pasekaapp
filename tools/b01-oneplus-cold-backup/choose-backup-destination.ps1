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
Write-Host 'Close Paseka normally. A targeted force-stop can be explicitly approved in the next dialog.'
Write-Host 'Do not upload the resulting TAR to GitHub or ChatGPT; it contains app-private data.'
# The native Node runner intentionally returns exit 2 for any cold-file backup
# because independent Android restoration has NOT been verified.
# The Node runner always writes a sanitized JSON result to stdout.
# Avoid 2>&1: Windows PowerShell 5.1 turns native stderr on nonzero exit
# into a terminating NativeCommandError under ErrorActionPreference=Stop.
# Explicit consent is required before sending the fixed-package Android
# force-stop command. Declining keeps the original read-only behavior.
$question = 'Allow ADB to stop ONLY ru.paseka.journal if Android still shows it running? This can discard unsaved actions. It does NOT clear saved data, install APKs or delete files. Save all current work in Paseka before choosing Yes.'
$choice = [System.Windows.Forms.MessageBox]::Show(
 $question,'Optional stop before backup',
 [System.Windows.Forms.MessageBoxButtons]::YesNo,
 [System.Windows.Forms.MessageBoxIcon]::Warning,
 [System.Windows.Forms.MessageBoxDefaultButton]::Button2
)
if($choice -eq [System.Windows.Forms.DialogResult]::Yes){
 Write-Host 'Force-stop permission: YES, only if Paseka process is currently running.'
 $lines = & $node $script --dest $folder.SelectedPath --allow-force-stop
}else{
 Write-Host 'Force-stop permission: NO. Running processes will block the backup.'
 $lines = & $node $script --dest $folder.SelectedPath
}
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
 if($result -and $result.evidence -and $result.evidence.stage -eq 'ANDROID_TAR_TRANSFER'){
  Write-Host "Tar exit code: $($result.evidence.tarExitCode)"
  Write-Host "Bytes received: $($result.evidence.transferredBytes)"
  Write-Host "Tar stderr present: $($result.evidence.stderrSeen)"
  Write-Host "Tar stderr category: $($result.evidence.stderrCategory)"
  Write-Host 'Private stderr, filenames and source paths are intentionally withheld.'
 }
 switch($result.code) {
  'ADB_NO_DEVICE' { Write-Host 'No connected authorized phone found: check USB cable and USB debugging.' }
  'ADB_MULTIPLE_DEVICES' { Write-Host 'More than one Android device is connected. Disconnect other devices.' }
  'ADB_DEVICE_UNAUTHORIZED' { Write-Host 'Unlock OnePlus and accept the USB debugging authorization prompt.' }
  'APP_MUST_BE_STOPPED_MANUALLY' { Write-Host 'Paseka is still active or restarts; copy blocked. Do not clear data.' }
  'ADB_FORCE_STOP_FAILED' { Write-Host 'The explicitly approved targeted stop was rejected; copy blocked.' }
  'RUN_AS_UNAVAILABLE' { Write-Host 'The installed app does not permit run-as. Do not uninstall it or clear data.' }
  'WEBVIEW_DIRECTORY_NOT_ACCESSIBLE' { Write-Host 'Private WebView directory not accessible. No backup was created.' }
  'ANDROID_TAR_COMMAND_FAILED' { Write-Host 'Android tar exited nonzero; local .partial is NOT a usable backup.' }
  'ANDROID_TAR_STREAM_FAILED' { Write-Host 'ADB/TAR transfer stream ended in error. Do not use .partial as backup.' }
  'ANDROID_TAR_EMPTY_OR_TOO_SMALL' { Write-Host 'Android tar produced too few bytes to verify a backup.' }
  'ANDROID_TAR_ALIGNMENT_INVALID' { Write-Host 'Android tar stream did not end on a valid 512-byte block boundary.' }
  'DESTINATION_NOT_CANONICAL' { Write-Host 'Use a normal local folder directly, not a symbolic link or alias.' }
  default { Write-Host 'Do not remove or reset the installed application.' }
 }
 Write-Host 'No phone files were deleted or modified.'
}
Write-Host 'Press Enter to close.'
[void][Console]::ReadLine()
