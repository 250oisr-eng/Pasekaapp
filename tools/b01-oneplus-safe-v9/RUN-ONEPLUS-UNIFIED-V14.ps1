# PASEKA B01 V14 - one clean standalone public-only transport comparison.
# Windows PowerShell 5.1. No previous test required. Never read private app data.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$base=$PSScriptRoot
$reportPath=Join-Path $base 'B01-RESULT.json'
if([IO.File]::Exists($reportPath)) {
    Write-Host 'B01-RESULT.json already exists. It was not overwritten. Use a NEW extracted folder.'
    exit 0
}
$report=[ordered]@{
    schema='paseka-b01-independent-public-transport-v14'
    status='BLOCKED'
    code='NOT_STARTED'
    stage='PREFLIGHT'
    testRevision='v14-shell-versus-exec-out-public-only'
    packageId='ru.paseka.journal'
    deviceModel=$null
    adbVersion=$null
    shellV2Advertised=$false
    adbUsed='NO'
    shell=[ordered]@{
      transport='SHELL';status='NOT_TESTED';code='NOT_TESTED'
      stage='NOT_TESTED';bytes=$null;remainder512=$null;exitCode=$null
      hostStderr='NOT_TESTED';structure='NOT_TESTED'
      firstHeaderChecksum='NOT_TESTED';tailPrintable=$null;tailErrorLike=$null
    }
    execOut=[ordered]@{
      transport='EXEC_OUT';status='NOT_TESTED';code='NOT_TESTED'
      stage='NOT_TESTED';bytes=$null;remainder512=$null;exitCode=$null
      hostStderr='NOT_TESTED';structure='NOT_TESTED'
      firstHeaderChecksum='NOT_TESTED';tailPrintable=$null;tailErrorLike=$null
    }
    privateTar='NOT_ATTEMPTED'
    backupCompleteness='NOT_VERIFIED'
    fullBackupVerified=$false
    independentRestore='NOT_TESTED'
    mediaStoreGalleryCoverage='NOT_TESTED'
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
    [IO.File]::WriteAllText($reportPath,(ConvertTo-Json -InputObject $report -Depth 8),
        (New-Object Text.UTF8Encoding($false)))
}
function Block([string]$code) {
    $report.status='BLOCKED'
    $report.code=$code
    Save
    throw $code
}
function New-LocalResult([string]$root,[string]$pattern,[string[]]$previous) {
    if(-not [IO.Directory]::Exists($root)){return $null}
    $files=@(Get-ChildItem -LiteralPath $root -Filter $pattern -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object {$previous -notcontains $_.FullName})
    if($files.Count -ne 1){return $null}
    return $files[0]
}
function Local-Results([string]$root,[string]$pattern) {
    if(-not [IO.Directory]::Exists($root)){return @()}
    return @(Get-ChildItem -LiteralPath $root -Filter $pattern -File -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object FullName)
}
function Run-PublicProbe([string]$transport) {
    $childReportDir=Join-Path $base 'results'
    $before=@(Local-Results $childReportDir 'b01-v9-result.json')
    # All device-side commands are read-only, and -PublicOnly bypasses private capture.
    & $script:v91 -PublicOnly -PublicTransport $transport | Out-Null
    $raw=New-LocalResult $childReportDir 'b01-v9-result.json' $before
    if(-not $raw){Block ('PUBLIC_'+$transport+'_RESULT_MISSING')}
    $data=Get-Content -LiteralPath $raw.FullName -Raw | ConvertFrom-Json
    if($data.schema -ne 'paseka-b01-private-readonly-v9' -or
       $data.scriptRevision -ne 'v9.1-adb-host-startup-diagnostics' -or
       $data.publicTarTransport -ne $transport) {
        Block ('PUBLIC_'+$transport+'_UNEXPECTED_COMPONENT')
    }
    if($data.privateTar -ne 'NOT_ATTEMPTED' -or $data.phoneWrites -ne 'NOT_ATTEMPTED' -or
       $data.install -ne 'NOT_ATTEMPTED' -or $data.forceStop -ne 'NOT_ATTEMPTED' -or
       $data.clear -ne 'NOT_ATTEMPTED' -or $data.deleteOriginals -ne 'NOT_ATTEMPTED') {
        Block 'UNSAFE_CHILD_RESULT_REJECTED'
    }
    $probe=[ordered]@{
        transport=$transport;status=$data.status;code=$data.code;stage=$data.stage
        bytes=$data.publicTarBytes;remainder512=$data.publicTarModulo512
        exitCode=$data.publicTarCaptureExitCode;hostStderr=$data.publicTarHostStderrClass
        structure='NOT_TESTED';firstHeaderChecksum='NOT_TESTED'
        tailPrintable=$null;tailErrorLike=$null
    }
    if($report.deviceModel -eq $null) {$report.deviceModel=$data.deviceModel}
    if($report.adbVersion -eq $null) {$report.adbVersion=$data.adbVersion}
    if($data.shellV2Advertised) {$report.shellV2Advertised=$true}
    $archive=Join-Path $raw.Directory.FullName 'public-only-v9.tar'
    if([IO.File]::Exists($archive)){
        $forensicRoot=Join-Path $base 'forensics-results'
        $already=@(Local-Results $forensicRoot 'public-tar-v10-*.json')
        & $script:v10 -ArchivePath $archive | Out-Null
        $classified=New-LocalResult $forensicRoot 'public-tar-v10-*.json' $already
        if(-not $classified){Block ('PUBLIC_'+$transport+'_FORENSIC_MISSING')}
        $f=Get-Content -LiteralPath $classified.FullName -Raw | ConvertFrom-Json
        if($f.schema -ne 'paseka-b01-public-tar-offline-forensics-v10' -or
           $f.status -ne 'READONLY_DIAGNOSIS_COMPLETE' -or $f.source -ne 'PC_PUBLIC_TAR_ONLY'){
            Block ('PUBLIC_'+$transport+'_FORENSIC_INVALID')
        }
        if($null -ne $probe.bytes -and [long]$f.archiveBytes -ne [long]$probe.bytes) {
            Block ('PUBLIC_'+$transport+'_BYTES_MISMATCH')
        }
        $probe.bytes=$f.archiveBytes
        $probe.remainder512=$f.remainder512
        $probe.structure=$f.structureClass
        $probe.firstHeaderChecksum=$f.firstHeaderChecksum
        $probe.tailPrintable=$f.tailPrintableAscii
        $probe.tailErrorLike=$f.tailErrorLike
    }
    if($data.status -eq 'PUBLIC_ONLY_PASS' -and
       $probe.structure -ne 'HEADER_AND_EOF_STRUCTURALLY_PLAUSIBLE'){
        Block ('PUBLIC_'+$transport+'_SUCCESS_CONTRADICTS_FORENSIC')
    }
    return $probe
}
try {
    Save
    $script:v91=Join-Path $base 'B01-ONEPLUS-SAFE-V9.ps1'
    $script:v10=Join-Path $base 'B01-PUBLIC-TAR-FORENSIC-V10.ps1'
    if(-not [IO.File]::Exists($script:v91) -or -not [IO.File]::Exists($script:v10)){
        Block 'BUNDLED_COMPONENT_MISSING'
    }
    $report.adbUsed='YES'
    $report.stage='SHELL_PUBLIC_ONLY'
    Save
    $shell=Run-PublicProbe 'SHELL'
    $report.shell=$shell
    Save
    if($shell.status -eq 'PUBLIC_ONLY_PASS'){
        $report.status='PUBLIC_DIAGNOSIS_ONLY'
        $report.code='SHELL_PUBLIC_TAR_VALID_NO_PRIVATE_BACKUP'
    }
    elseif($shell.stage -ne 'PUBLIC_TAR_GATE'){
        # Real device preflight failed: no second USB probe.
        $report.code=$shell.code
    }
    else {
        $report.stage='EXEC_OUT_PUBLIC_ONLY'
        Save
        $exec=Run-PublicProbe 'EXEC_OUT'
        $report.execOut=$exec
        if($exec.status -eq 'PUBLIC_ONLY_PASS'){
            $report.status='PUBLIC_DIAGNOSIS_ONLY'
            $report.code='SHELL_FAILED_EXEC_OUT_PUBLIC_TAR_VALID'
        }
        elseif($exec.stage -eq 'PUBLIC_TAR_GATE'){
            $report.status='BLOCKED'
            $report.code='BOTH_PUBLIC_TRANSPORTS_FAILED_CLASSIFIED'
        }
        else {
            $report.status='BLOCKED'
            $report.code='EXEC_OUT_PREFLIGHT_BLOCKED'
        }
    }
    $report.stage='COMPLETE'
    Save
}
catch {
    $report.status='BLOCKED'
    if($report.code -eq 'NOT_STARTED'){$report.code='LOCAL_DIAGNOSTIC_FAILURE'}
    Save
}
Write-Host ('UPLOAD ONLY: '+$reportPath)
Write-Host ('Result: '+$report.status+' / '+$report.code)
Write-Host 'No previous test needed. Never upload TAR, logs, or personal files.'
