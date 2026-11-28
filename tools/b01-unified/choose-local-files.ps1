$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
function Pick-Archive {
  $dlg = New-Object System.Windows.Forms.OpenFileDialog
  $dlg.Title = 'Select EXISTING full Paseka IndexedDB export JSON (Cancel = missing)'
  $dlg.Filter = 'JSON (*.json)|*.json'
  $dlg.CheckFileExists = $true
  if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dlg.FileName }
  return $null
}
function Pick-Folder([string]$title) {
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
  $dlg.Description = $title
  $dlg.ShowNewFolderButton = $false
  if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dlg.SelectedPath }
  return $null
}
$parameters = @()
$archive = Pick-Archive
if ($archive) { $parameters += @('--archive', $archive) }
$choice = [System.Windows.Forms.MessageBox]::Show(
  'Compare TWO existing external media folders? Choose No when unavailable.',
  'Paseka read-only audit', 'YesNo', 'Question')
if ($choice -eq [System.Windows.Forms.DialogResult]::Yes) {
  $source = Pick-Folder 'Choose existing exported original media directory'
  $copy = Pick-Folder 'Choose existing second copy directory (NOT inside original)'
  if ($source) { $parameters += @('--media-source', $source) }
  if ($copy) { $parameters += @('--media-copy', $copy) }
}
$node = Join-Path $PSScriptRoot 'node.exe'
$entry = Join-Path $PSScriptRoot 'scripts\run-unified-recovery-audit.mjs'
$raw = $null
try {
  $outputLines = & $node $entry @parameters 2>&1
  $raw = ($outputLines | ForEach-Object { $_.ToString() }) -join "`n"
  $parsed = $raw | ConvertFrom-Json
  if ($parsed.schema -ne 'paseka-unified-recovery-audit-v1' -or
      -not $parsed.overall -or $parsed.originalVideoDeletionAuthorized -ne $false -or
      $parsed.installationAuthorized -ne $false) { throw 'Unrecognized or unsafe report' }
} catch {
  # Never expose user paths or application-specific exceptions.
  $raw = '{"schema":"paseka-unified-recovery-audit-v1","overall":"BLOCKED_LOCAL_RUNNER","userDataModified":false,"originalVideoDeletionAuthorized":false,"installationAuthorized":false}'
}
$filename = 'PASEKA-UNIFIED-AUDIT-' + (Get-Date -Format 'yyyyMMdd-HHmmss') +
  '-' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.json'
$reportPath = Join-Path $PSScriptRoot $filename
[System.IO.File]::WriteAllText($reportPath, $raw + "`n",
  (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Read-only inspection finished. One redacted report written locally:'
Write-Host $reportPath
Write-Host 'A local PASS is NOT proof of complete real-device recovery.'
Write-Host 'NO APK install / NO delete / NO device changes.'
Write-Host 'Press Enter to close.'
[void][Console]::ReadLine()
