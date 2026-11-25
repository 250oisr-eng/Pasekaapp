# PASEKA B01 V15. New standalone private candidate gate, PC storage outside test folder.
# Windows PowerShell 5.1. No prior test files. Private read requires exact CAPTURE.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$base=$PSScriptRoot
$result=Join-Path $base 'B01-RESULT.json'
if([IO.File]::Exists($result)){
  Write-Host 'B01-RESULT.json already exists; no overwrite. Extract a NEW ZIP for a new test.'
  exit 0
}
$r=[ordered]@{
 schema='paseka-b01-standalone-gated-pc-candidate-v15'
 status='BLOCKED'
 stage='PREFLIGHT'
 code='NOT_STARTED'
 deviceModel=$null
 adbVersion=$null
 packageId='ru.paseka.journal'
 publicTransport='EXEC_OUT'
 publicTar='NOT_TESTED'
 publicTarBytes=$null
 publicTarModulo512=$null
 privateTar='NOT_ATTEMPTED'
 privateTransport='NOT_ATTEMPTED'
 privateTarBytes=0
 privateTarSha256=$null
 privateTarEntries=0
 candidateOutsideTestFolder=$false
 candidateDiskClass='NOT_TESTED'
 candidateManifestWritten=$false
 priorTestRequired=$false
 fullBackupVerified=$false
 backupCompleteness='NOT_VERIFIED'
 independentRestore='NOT_TESTED'
 mediaStoreGalleryCoverage='NOT_TESTED'
 phoneWrites='NOT_ATTEMPTED'
 install='NOT_ATTEMPTED'
 uninstall='NOT_ATTEMPTED'
 forceStop='NOT_ATTEMPTED'
 clear='NOT_ATTEMPTED'
 restore='NOT_ATTEMPTED'
 deleteOriginals='NOT_ATTEMPTED'
 network='NOT_ATTEMPTED'
}
function Save {
 [IO.File]::WriteAllText($result,(ConvertTo-Json -InputObject $r -Depth 6),
   (New-Object Text.UTF8Encoding($false)))
}
function ReportFiles {
 $root=Join-Path $base 'results'
 if(-not [IO.Directory]::Exists($root)){return @()}
 return @(Get-ChildItem -LiteralPath $root -Filter 'b01-v9-result.json' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object FullName)
}
try{
 Save
 $child=Join-Path $base 'B01-ONEPLUS-SAFE-V9.ps1'
 if(-not [IO.File]::Exists($child)){throw 'BUNDLED_CAPTURE_COMPONENT_MISSING'}
 $before=@(ReportFiles)
 $r.stage='PUBLIC_EXEC_OUT_PREFLIGHT'
 Save
 # The child makes an exec-out PUBLIC tar first. Only user typed CAPTURE may open private route.
 # The private TAR and MANIFEST are saved outside disposable test folder, not uploaded.
 & $child -PublicTransport EXEC_OUT -GatedPrivateCandidate | Out-Null
 $now=@(ReportFiles | Where-Object {$before -notcontains $_})
 if($now.Count -ne 1){throw 'CANDIDATE_CHILD_REPORT_MISSING_OR_AMBIGUOUS'}
 $data=Get-Content -LiteralPath $now[0] -Raw | ConvertFrom-Json
 if($data.schema -ne 'paseka-b01-private-readonly-v9' -or
    $data.scriptRevision -ne 'v9.1-adb-host-startup-diagnostics' -or
    $data.publicTarTransport -ne 'EXEC_OUT' -or
    $data.phoneWrites -ne 'NOT_ATTEMPTED' -or
    $data.install -ne 'NOT_ATTEMPTED' -or
    $data.uninstall -ne 'NOT_ATTEMPTED' -or
    $data.forceStop -ne 'NOT_ATTEMPTED' -or
    $data.clear -ne 'NOT_ATTEMPTED' -or
    $data.restore -ne 'NOT_ATTEMPTED' -or
    $data.deleteOriginals -ne 'NOT_ATTEMPTED' -or
    $data.network -ne 'NOT_ATTEMPTED' -or
    $data.backupCompleteness -ne 'NOT_VERIFIED' -or
    $data.independentRestore -ne 'NOT_TESTED' -or
    $data.mediaStoreGalleryCoverage -ne 'NOT_TESTED'){
   throw 'BUNDLED_CAPTURE_SAFETY_GATE_VIOLATION'
 }
 $r.deviceModel=$data.deviceModel
 $r.adbVersion=$data.adbVersion
 $r.publicTar=$data.publicTar
 $r.publicTarBytes=$data.publicTarBytes
 $r.publicTarModulo512=$data.publicTarModulo512
 $r.stage='FINAL_CLASSIFICATION'
 if($data.status -eq 'CANDIDATE_ONLY' -and
    $data.privateTransport -eq 'EXEC_OUT' -and
    $data.candidateOutsideTestFolder -eq $true -and
    $data.candidateDiskClass -eq 'FIXED_LOCAL_PC_UNRESTORED' -and
    $data.candidateManifestWritten -eq $true -and
    $data.privateTar -eq 'STRUCTURALLY_VALID_CANDIDATE_RESTORE_NOT_VERIFIED' -and
    [long]$data.privateTarBytes -gt 0 -and
    [string]$data.privateTarSha256 -match '^[a-f0-9]{64}$'){
   $r.status='PC_PRIVATE_CANDIDATE_ONLY'
   $r.code='PRIVATE_CANDIDATE_EXPORTED_RESTORE_NOT_TESTED'
   $r.privateTar=$data.privateTar
   $r.privateTransport='EXEC_OUT'
   $r.privateTarBytes=$data.privateTarBytes
   $r.privateTarSha256=$data.privateTarSha256
   $r.privateTarEntries=$data.privateTarEntries
   $r.candidateOutsideTestFolder=$true
   $r.candidateDiskClass=$data.candidateDiskClass
   $r.candidateManifestWritten=$true
 }
 elseif($data.code -eq 'USER_SKIPPED_PRIVATE_READ') {
   $r.status='USER_DECLINED_PRIVATE_CAPTURE'
   $r.code='USER_SKIPPED_PRIVATE_READ'
 } else {
   $r.status='BLOCKED'
   $r.code=[string]$data.code
 }
 $r.stage='COMPLETE'
 Save
}
catch{
 $r.status='BLOCKED'
 if($r.code -eq 'NOT_STARTED'){$r.code='LOCAL_OR_CHILD_RESULT_FAILURE'}
 $r.stage='BLOCKED'
 Save
}
Write-Host ('UPLOAD ONLY: '+$result)
Write-Host ('Status: '+$r.status+' / '+$r.code)
Write-Host 'The private TAR and MANIFEST stay ONLY on local PC outside this test folder.'
Write-Host 'Even a candidate PASS is NOT full backup and does NOT permit restore or media cleanup.'
