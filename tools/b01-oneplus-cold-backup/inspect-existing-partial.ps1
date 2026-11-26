$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$chooser=New-Object System.Windows.Forms.OpenFileDialog
$chooser.Title='Select existing PASEKA-ONEPLUS-SANDBOX-*.tar.partial for READ-ONLY inspection'
$chooser.Filter='Incomplete TAR (*.tar.partial)|*.tar.partial'
$chooser.Multiselect=$false
if($chooser.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK){
 Write-Host 'CANCELLED; no file touched.'
 exit 0
}
$node=Join-Path $PSScriptRoot 'node.exe'
$script=Join-Path $PSScriptRoot 'scripts\inspect-oneplus-partial-tar.mjs'
if(-not (Test-Path $node) -or -not (Test-Path $script)){Write-Host 'BLOCKED: kit incomplete';exit 1}
Write-Host 'READ-ONLY LOCAL TAR EXAMINATION: no USB, no ADB, no app stop, no extraction or write.'
Write-Host 'Only structural metadata (sizes, header checksums, end markers) is output.'
& $node $script $chooser.FileName
$rc=$LASTEXITCODE
if($rc -ne 0){Write-Host 'LOCAL PARTIAL INSPECTION BLOCKED'}
