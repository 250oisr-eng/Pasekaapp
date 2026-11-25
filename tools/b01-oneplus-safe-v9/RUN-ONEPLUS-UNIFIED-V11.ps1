# PASEKA B01 V11 — one-folder, one-launch, fail-closed Windows PowerShell 5.1.
# Default: diagnose an EXISTING public TAR anywhere in user's common folders.
# Only explicit USB choice invokes legacy V9.1; private capture needs its own CAPTURE confirmation.
[CmdletBinding()]
param(
    [ValidateSet('Auto','Local','USB')][string]$Mode = 'Auto',
    [string[]]$SearchRoots = @(),
    [string]$ArchivePath = '',
    [switch]$NoPicker
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$base=$PSScriptRoot
$id=[Guid]::NewGuid().ToString('N')
$resultFolder=Join-Path (Join-Path $base 'unified-results') ('run-'+$id)
[void][IO.Directory]::CreateDirectory($resultFolder)
$reportPath=Join-Path $resultFolder 'b01-unified-result.json'
$report=[ordered]@{
    schema='paseka-b01-unified-gate-v11'
    runId=$id
    status='BLOCKED'
    code='NOT_STARTED'
    selectedMode='NOT_SELECTED'
    source='NOT_SELECTED'
    previousPublicTarFound=$false
    priorPublicTarBytes=$null
    priorPublicTarRemainder512=$null
    priorPublicTarClass='NOT_TESTED'
    priorPublicTarTailErrorLike=$null
    priorPublicTarHeaderChecksum='NOT_TESTED'
    adbUsed='NO'
    v91Status='NOT_RUN'
    v91Code='NOT_RUN'
    v91PublicTar='NOT_RUN'
    v91PrivateTar='NOT_RUN'
    fullBackupVerified=$false
    backupCompleteness='NOT_VERIFIED'
    independentRestore='NOT_TESTED'
    mediaStoreGalleryCoverage='NOT_TESTED'
    originalFilesDeleted='NO'
    phoneWrites='NOT_ATTEMPTED'
    productionDeployment='NOT_ATTEMPTED'
}
function Save-Report {
    $json=ConvertTo-Json -InputObject $report -Depth 6
    [IO.File]::WriteAllText($reportPath,$json,(New-Object Text.UTF8Encoding($false)))
}
function Abort([string]$reason) {
    $report.status='BLOCKED'
    $report.code=$reason
    Save-Report
    throw $reason
}
function Is-SafeDirectory([IO.DirectoryInfo]$d) {
    if(-not $d -or -not $d.Exists){return $false}
    return (([int]$d.Attributes -band [int][IO.FileAttributes]::ReparsePoint) -eq 0)
}
function Has-ExpectedLayout([IO.FileInfo]$item) {
    if(-not $item -or -not $item.Exists -or $item.Name -cne 'public-only-v9.tar'){return $false}
    if(([int]$item.Attributes -band [int][IO.FileAttributes]::ReparsePoint) -ne 0){return $false}
    if(-not (Is-SafeDirectory $item.Directory)){return $false}
    if($item.Directory.Name -notlike 'run-*'){return $false}
    if(-not $item.Directory.Parent -or $item.Directory.Parent.Name -ne 'results'){return $false}
    return $true
}
function Build-SearchRoots {
    if($SearchRoots.Count -gt 0) { return @($SearchRoots) }
    $dirs=New-Object 'System.Collections.Generic.List[string]'
    $dirs.Add($base)
    $homeDir=[Environment]::GetFolderPath('UserProfile')
    foreach($suffix in @('Downloads','Desktop','Documents','OneDrive\Desktop','OneDrive\Documents','OneDrive\Downloads')){
        if($homeDir){$dirs.Add((Join-Path $homeDir $suffix))}
    }
    # Do not probe other drive roots, network shares, roaming AppData, cloud APIs or private files.
    return @($dirs | Select-Object -Unique)
}
function Find-ExistingPublicTar {
    $found=New-Object 'System.Collections.Generic.List[IO.FileInfo]'
    $visited=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $queue=New-Object 'System.Collections.Queue'
    foreach($root in (Build-SearchRoots)){
        if(-not [IO.Directory]::Exists($root)){continue}
        $di=[IO.DirectoryInfo]::new($root)
        if(Is-SafeDirectory $di){$queue.Enqueue([pscustomobject]@{dir=$di;depth=0})}
    }
    $scanned=0
    while($queue.Count -gt 0 -and $scanned -lt 6000) {
        $node=$queue.Dequeue()
        $dir=$node.dir
        if(-not (Is-SafeDirectory $dir)){continue}
        if(-not $visited.Add($dir.FullName)){continue}
        $scanned++
        if($dir.Name -ceq 'results'){
            $runs=@(Get-ChildItem -LiteralPath $dir.FullName -Directory -ErrorAction SilentlyContinue |
                Where-Object {$_.Name -like 'run-*'})
            foreach($run in $runs){
                if(-not (Is-SafeDirectory $run)){continue}
                $candidate=Join-Path $run.FullName 'public-only-v9.tar'
                if(-not [IO.File]::Exists($candidate)){continue}
                $file=[IO.FileInfo]::new($candidate)
                if(Has-ExpectedLayout $file){$found.Add($file)}
            }
            continue
        }
        if($node.depth -ge 7){continue}
        # Only enumerate directory names; never read unrelated personal files.
        $dirs=@(Get-ChildItem -LiteralPath $dir.FullName -Directory -ErrorAction SilentlyContinue)
        foreach($child in $dirs){
            if($child.Name -in @('.git','node_modules','.gradle','AppData','Windows','Program Files','Program Files (x86)','System Volume Information','$RECYCLE.BIN','.cache')){continue}
            if(Is-SafeDirectory $child){$queue.Enqueue([pscustomobject]@{dir=$child;depth=($node.depth+1)})}
        }
    }
    if($found.Count -eq 0){return $null}
    return @($found | Sort-Object LastWriteTimeUtc -Descending)[0]
}
function Choose-ExistingPublicTar {
    if($NoPicker){return $null}
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        $dialog=New-Object Windows.Forms.OpenFileDialog
        $dialog.Title='PASEKA B01 - выберите СУЩЕСТВУЮЩИЙ public-only-v9.tar'
        $dialog.Filter='Existing public-only-v9.tar|public-only-v9.tar'
        $dialog.CheckFileExists=$true
        $dialog.Multiselect=$false
        if($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){return $null}
        $item=[IO.FileInfo]::new($dialog.FileName)
        if(Has-ExpectedLayout $item){return $item}
        return $null
    } catch { return $null }
}
function Run-Offline([IO.FileInfo]$candidate) {
    if(-not (Has-ExpectedLayout $candidate)){Abort 'PUBLIC_TAR_PATH_OR_LAYOUT_INVALID'}
    $report.selectedMode='LOCAL'
    $report.source='PREEXISTING_PUBLIC_TAR'
    $report.previousPublicTarFound=$true
    Save-Report
    $forensic=Join-Path $base 'B01-PUBLIC-TAR-FORENSIC-V10.ps1'
    if(-not [IO.File]::Exists($forensic)){Abort 'BUNDLED_FORENSIC_SCRIPT_MISSING'}
    $outFolder=Join-Path $base 'forensics-results'
    $before=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    if([IO.Directory]::Exists($outFolder)){
        foreach($f in @(Get-ChildItem -LiteralPath $outFolder -Filter 'public-tar-v10-*.json' -File -ErrorAction SilentlyContinue)){
            [void]$before.Add($f.FullName)
        }
    }
    & $forensic -ArchivePath $candidate.FullName | Out-Null
    $new=@(Get-ChildItem -LiteralPath $outFolder -Filter 'public-tar-v10-*.json' -File -ErrorAction SilentlyContinue |
        Where-Object {-not $before.Contains($_.FullName)})
    if($new.Count -ne 1){Abort 'LOCAL_FORENSIC_REPORT_NOT_UNIQUE'}
    $data=Get-Content -LiteralPath $new[0].FullName -Raw | ConvertFrom-Json
    if($data.schema -ne 'paseka-b01-public-tar-offline-forensics-v10' -or
       $data.status -ne 'READONLY_DIAGNOSIS_COMPLETE' -or
       $data.source -ne 'PC_PUBLIC_TAR_ONLY'){Abort 'LOCAL_FORENSIC_FAILED'}
    $report.priorPublicTarBytes=$data.archiveBytes
    $report.priorPublicTarRemainder512=$data.remainder512
    $report.priorPublicTarClass=$data.structureClass
    $report.priorPublicTarTailErrorLike=$data.tailErrorLike
    $report.priorPublicTarHeaderChecksum=$data.firstHeaderChecksum
    $report.status='PUBLIC_ONLY_DIAGNOSIS'
    $report.code='PUBLIC_TAR_DIAGNOSED_BACKUP_NOT_VERIFIED'
    Save-Report
}
function Run-Usb {
    $report.selectedMode='USB'
    $report.source='BUNDLED_V91_GATED_READONLY'
    $report.adbUsed='YES'
    Save-Report
    $scriptPath=Join-Path $base 'B01-ONEPLUS-SAFE-V9.ps1'
    if(-not [IO.File]::Exists($scriptPath)){Abort 'BUNDLED_ADB_SCRIPT_MISSING'}
    $results=Join-Path $base 'results'
    $before=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    if([IO.Directory]::Exists($results)){
        foreach($f in @(Get-ChildItem -LiteralPath $results -Filter 'b01-v9-result.json' -File -Recurse -ErrorAction SilentlyContinue)){
            [void]$before.Add($f.FullName)
        }
    }
    & $scriptPath | Out-Null
    $new=@(Get-ChildItem -LiteralPath $results -Filter 'b01-v9-result.json' -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object {-not $before.Contains($_.FullName)})
    if($new.Count -ne 1){Abort 'USB_V91_REPORT_NOT_UNIQUE'}
    $data=Get-Content -LiteralPath $new[0].FullName -Raw | ConvertFrom-Json
    if($data.schema -ne 'paseka-b01-private-readonly-v9'){Abort 'USB_V91_UNEXPECTED_SCHEMA'}
    $report.v91Status=$data.status
    $report.v91Code=$data.code
    $report.v91PublicTar=$data.publicTar
    $report.v91PrivateTar=$data.privateTar
    $report.phoneWrites=$data.phoneWrites
    Save-Report
    $candidate=Join-Path $new[0].Directory.FullName 'public-only-v9.tar'
    if([IO.File]::Exists($candidate)){
        $file=New-Object IO.FileInfo($candidate)
        # Even when public TAR was rejected in V9.1, preserve the rejection and
        # run the independent offline diagnostic without touching private data.
        Run-Offline $file
        $report.selectedMode='USB_THEN_LOCAL'
        if($data.status -eq 'BLOCKED'){
            $report.status='BLOCKED_WITH_PUBLIC_DIAGNOSIS'
            $report.code=$data.code
        }
        Save-Report
    }
    else {
        $report.status='BLOCKED'
        $report.code=$data.code
        Save-Report
    }
}
try {
    Save-Report
    if($Mode -eq 'USB') {
        Run-Usb
    }
    else {
        $item=$null
        if($ArchivePath){
            $item=[IO.FileInfo]::new($ArchivePath)
            if(-not (Has-ExpectedLayout $item)){Abort 'PUBLIC_TAR_PATH_OR_LAYOUT_INVALID'}
        }
        else {$item=Find-ExistingPublicTar}
        if(-not $item){$item=Choose-ExistingPublicTar}
        if($item){Run-Offline $item}
        elseif($Mode -eq 'Local' -or $NoPicker){Abort 'NO_PREVIOUS_PUBLIC_TAR_FOUND'}
        else {
            Write-Host 'Existing public TAR not found; no device action performed.'
            Write-Host 'Type USB to run the bundled guarded OnePlus test, or press Enter to stop.'
            $answer=Read-Host 'Action'
            if($answer -cne 'USB'){Abort 'NO_PREVIOUS_PUBLIC_TAR_FOUND'}
            Run-Usb
        }
    }
} catch {
    if($report.code -eq 'NOT_STARTED'){
        $report.code='UNIFIED_LOCAL_SCRIPT_ERROR'
        $report.status='BLOCKED'
    }
    Save-Report
}
Write-Host ('One final anonymized report: '+$reportPath)
Write-Host ('Result: '+$report.status+' / '+$report.code)
Write-Host 'Never upload TAR, private data or APK. B01 full backup NOT VERIFIED.'
