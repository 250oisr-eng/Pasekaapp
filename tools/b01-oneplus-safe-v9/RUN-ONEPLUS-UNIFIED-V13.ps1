# PASEKA B01 V13. Full independent test package. No previous test artifacts used.
# Windows PowerShell 5.1; public-only OnePlus ADB diagnostic; NO private data.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$base=$PSScriptRoot
$id=[Guid]::NewGuid().ToString('N')
$folder=Join-Path (Join-Path $base 'unified-results') ('run-'+$id)
[void][IO.Directory]::CreateDirectory($folder)
$reportFile=Join-Path $folder 'b01-unified-result.json'
$report=[ordered]@{
    schema='paseka-b01-unified-public-only-v13'
    testRevision='v13-independent-no-legacy-dependencies'
    status='BLOCKED'
    stage='START'
    code='NOT_STARTED'
    packageId='ru.paseka.journal'
    deviceModel=$null
    adbVersion=$null
    shellV2Advertised=$false
    adbUsed='NO'
    publicTar='NOT_TESTED'
    publicTarBytes=$null
    publicTarRemainder512=$null
    publicTarClass='NOT_TESTED'
    publicTarFirstHeaderChecksum='NOT_TESTED'
    publicTarTailPrintable=$null
    publicTarTailErrorLike=$null
    privateTar='NOT_ATTEMPTED'
    backupCompleteness='NOT_VERIFIED'
    independentRestore='NOT_TESTED'
    mediaStoreGalleryCoverage='NOT_TESTED'
    fullBackupVerified=$false
    phoneWrites='NOT_ATTEMPTED'
    install='NOT_ATTEMPTED'
    uninstall='NOT_ATTEMPTED'
    forceStop='NOT_ATTEMPTED'
    clear='NOT_ATTEMPTED'
    deleteOriginals='NOT_ATTEMPTED'
    network='NOT_ATTEMPTED'
    previousTestRequired=$false
}
function Save {
    [IO.File]::WriteAllText($reportFile,(ConvertTo-Json -InputObject $report -Depth 6),
        (New-Object Text.UTF8Encoding($false)))
}
function Stop-Test([string]$code) {
    $report.status='BLOCKED'
    $report.code=$code
    Save
    throw $code
}
function Find-NewResult([string]$root,[string]$file,[string[]]$before) {
    if(-not [IO.Directory]::Exists($root)) {return $null}
    $new=@(Get-ChildItem -LiteralPath $root -Filter $file -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $before -notcontains $_.FullName })
    if($new.Count -ne 1){return $null}
    return $new[0]
}
try {
    Save
    $v91=Join-Path $base 'B01-ONEPLUS-SAFE-V9.ps1'
    $v10=Join-Path $base 'B01-PUBLIC-TAR-FORENSIC-V10.ps1'
    if(-not [IO.File]::Exists($v91) -or -not [IO.File]::Exists($v10)) {
        Stop-Test 'BUNDLED_COMPONENT_MISSING'
    }
    $reports=Join-Path $base 'results'
    $before=@()
    if([IO.Directory]::Exists($reports)){
        $before=@(Get-ChildItem -LiteralPath $reports -Filter 'b01-v9-result.json' -Recurse -File -ErrorAction SilentlyContinue |
            ForEach-Object FullName)
    }
    $report.stage='PUBLIC_ONLY_ADB'
    $report.adbUsed='YES'
    Save
    # V9.1 -PublicOnly returns without any CAPTURE prompt or private-data access.
    & $v91 -PublicOnly | Out-Null
    $raw=Find-NewResult $reports 'b01-v9-result.json' $before
    if(-not $raw) {Stop-Test 'PUBLIC_DIAGNOSTIC_RESULT_MISSING'}
    $data=Get-Content -LiteralPath $raw.FullName -Raw | ConvertFrom-Json
    if($data.schema -ne 'paseka-b01-private-readonly-v9' -or
       $data.scriptRevision -ne 'v9.1-adb-host-startup-diagnostics') {
        Stop-Test 'UNEXPECTED_BUNDLED_COMPONENT_REVISION'
    }
    if($data.privateTar -ne 'NOT_ATTEMPTED' -or $data.phoneWrites -ne 'NOT_ATTEMPTED') {
        Stop-Test 'PRIVATE_OR_PHONE_WRITE_GATE_VIOLATION'
    }
    $report.deviceModel=$data.deviceModel
    $report.adbVersion=$data.adbVersion
    $report.shellV2Advertised=$data.shellV2Advertised
    $report.publicTar=$data.publicTar
    $report.stage='PUBLIC_TAR_FORENSICS'
    Save
    $archive=Join-Path $raw.Directory.FullName 'public-only-v9.tar'
    if([IO.File]::Exists($archive)){
        $forensicRoot=Join-Path $base 'forensics-results'
        $seen=@()
        if([IO.Directory]::Exists($forensicRoot)){
            $seen=@(Get-ChildItem -LiteralPath $forensicRoot -Filter 'public-tar-v10-*.json' -File |
                ForEach-Object FullName)
        }
        & $v10 -ArchivePath $archive | Out-Null
        $forensic=Find-NewResult $forensicRoot 'public-tar-v10-*.json' $seen
        if(-not $forensic) {Stop-Test 'PUBLIC_FORENSICS_REPORT_MISSING'}
        $f=Get-Content -LiteralPath $forensic.FullName -Raw | ConvertFrom-Json
        if($f.schema -ne 'paseka-b01-public-tar-offline-forensics-v10' -or
           $f.status -ne 'READONLY_DIAGNOSIS_COMPLETE' -or
           $f.source -ne 'PC_PUBLIC_TAR_ONLY') {
            Stop-Test 'PUBLIC_FORENSICS_INVALID'
        }
        $report.publicTarBytes=$f.archiveBytes
        $report.publicTarRemainder512=$f.remainder512
        $report.publicTarClass=$f.structureClass
        $report.publicTarFirstHeaderChecksum=$f.firstHeaderChecksum
        $report.publicTarTailPrintable=$f.tailPrintableAscii
        $report.publicTarTailErrorLike=$f.tailErrorLike
    }
    if($data.status -eq 'PUBLIC_ONLY_PASS') {
        if($report.publicTarClass -ne 'HEADER_AND_EOF_STRUCTURALLY_PLAUSIBLE'){
            Stop-Test 'PUBLIC_COMPONENT_VALIDATION_CONTRADICTION'
        }
        $report.status='PUBLIC_ONLY_DIAGNOSIS'
        $report.code='PUBLIC_TAR_VALID_BACKUP_NOT_VERIFIED'
    } else {
        $report.status='BLOCKED'
        $report.code=$data.code
    }
    $report.stage='COMPLETE'
    Save
} catch {
    if($report.code -eq 'NOT_STARTED'){
        $report.code='LOCAL_DIAGNOSTIC_FAILURE'
    }
    $report.status='BLOCKED'
    Save
}
Write-Host ('Report JSON (share this file only): '+$reportFile)
Write-Host ('Status: '+$report.status+' / '+$report.code)
Write-Host 'No old tests or files required. No private data read, restore or deletion.'
