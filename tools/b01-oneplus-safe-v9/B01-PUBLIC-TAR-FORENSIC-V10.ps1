# B01 V10. Offline PC-only: inspects ONLY previous PUBLIC TAR. No ADB or phone.
# Designed for Windows PowerShell 5.1; no TAR extraction, no network, no personal archive.
param([string]$ArchivePath = '')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$limit = [long]64 * 1024 * 1024
$reports = Join-Path $PSScriptRoot 'forensics-results'
[void][IO.Directory]::CreateDirectory($reports)
$reportFile = Join-Path $reports ('public-tar-v10-'+[Guid]::NewGuid().ToString('N')+'.json')
$report = [ordered]@{
  schema = 'paseka-b01-public-tar-offline-forensics-v10'
  status = 'BLOCKED'
  code = 'NOT_STARTED'
  source = 'PC_PUBLIC_TAR_ONLY'
  adb = 'NOT_USED'
  device = 'NOT_CONNECTED_BY_SCRIPT'
  privateAppData = 'NOT_READ'
  tarExtract = 'NOT_ATTEMPTED'
  delete = 'NOT_ATTEMPTED'
  restore = 'NOT_ATTEMPTED'
  network = 'NOT_ATTEMPTED'
  archivePath = 'REDACTED'
  archiveBytes = $null
  remainder512 = $null
  completeBlocks = $null
  firstBlockKind = 'NOT_TESTED'
  secondBlockKind = 'NOT_TESTED'
  firstHeaderChecksum = 'NOT_TESTED'
  validHeaderCount = 0
  firstBadHeaderBlock = $null
  zeroBlockCount = 0
  nonZeroAfterEof = $false
  tailPrintableAscii = $null
  tailErrorLike = $null
  structureClass = 'NOT_TESTED'
  fullBackupVerified = $false
  independentRestore = 'NOT_TESTED'
}
function Save {
  $serialized = ConvertTo-Json -InputObject $report -Depth 5
  [IO.File]::WriteAllText($reportFile,$serialized,(New-Object Text.UTF8Encoding($false)))
}
function Block([string]$code) {
  $report.status = 'BLOCKED'
  $report.code = $code
  Save
  throw $code
}
function Zero512([byte[]]$b,[int]$offset) {
  if($offset+512 -gt $b.Length) { return $false }
  for($i=0;$i -lt 512;$i++){ if($b[$offset+$i] -ne 0){ return $false } }
  return $true
}
function Octal([byte[]]$b,[int]$offset,[int]$width) {
  $s=[Text.Encoding]::ASCII.GetString($b,$offset,$width).Trim([char[]]@([char]0,[char]32))
  if($s -notmatch '^[0-7]{1,12}$') { return $null }
  try { return [Convert]::ToInt64($s,8) } catch { return $null }
}
try {
  Save
  if(-not $ArchivePath) {
    # Search only beside this script, from previous V9/V9.1 runs.
    $candidates=@(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'results') -ErrorAction SilentlyContinue |
      Where-Object {$_.PSIsContainer -and $_.Name -like 'run-*'} |
      ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Filter 'public-only-v9.tar' -File -ErrorAction SilentlyContinue } |
      Sort-Object LastWriteTimeUtc -Descending)
    if($candidates.Count -gt 0){ $ArchivePath = $candidates[0].FullName }
    else {
      Write-Host 'No previous public-only-v9.tar found beside this script.'
      Write-Host 'Paste the local FULL path to an existing public-only-v9.tar, or press Enter to stop.'
      $ArchivePath = (Read-Host 'Existing PUBLIC TAR file').Trim('"')
    }
  }
  if(-not $ArchivePath){ Block 'PUBLIC_TAR_PATH_REQUIRED' }
  $item=Get-Item -LiteralPath $ArchivePath -ErrorAction Stop
  if($item.PSIsContainer -or $item.Name -cne 'public-only-v9.tar') { Block 'NOT_A_PUBLIC_V9_TAR' }
  if(([int]$item.Attributes -band [int][IO.FileAttributes]::ReparsePoint) -ne 0) { Block 'SYMLINK_NOT_ALLOWED' }
  if($item.Directory.Name -notlike 'run-*' -or $item.Directory.Parent.Name -ne 'results') {
    Block 'NOT_IN_V9_RESULTS_FOLDER'
  }
  $beforeLength=[long]$item.Length
  if($beforeLength -gt $limit) { Block 'PUBLIC_TAR_EXCEEDS_64_MIB' }
  $bytes=[IO.File]::ReadAllBytes($item.FullName)
  $after=Get-Item -LiteralPath $item.FullName
  if($after.Length -ne $beforeLength -or $after.LastWriteTimeUtc -ne $item.LastWriteTimeUtc) {
    Block 'SOURCE_FILE_CHANGED_DURING_READ'
  }
  $length=$bytes.Length
  $report.archiveBytes=$length
  $report.remainder512=$length % 512
  $report.completeBlocks=[long][Math]::Floor($length/512.0)
  if($length -ge 512) {
    $report.firstBlockKind=if(Zero512 $bytes 0){'ZERO'}else{'NONZERO'}
    if($report.firstBlockKind -eq 'NONZERO') {
      $chk=Octal $bytes 148 8
      if($null -eq $chk){$report.firstHeaderChecksum='NOT_OCTAL'}
      else {
        $sum=[long]0
        for($j=0;$j -lt 512;$j++){
          if($j -ge 148 -and $j -lt 156) {$sum+=32}else{$sum+=[long]$bytes[$j]}
        }
        $report.firstHeaderChecksum=if($chk -eq $sum){'PASS'}else{'FAIL'}
      }
    }
  }
  if($length -ge 1024){
    $report.secondBlockKind=if(Zero512 $bytes 512){'ZERO'}else{'NONZERO'}
  }
  # Examine only unaligned tail. Local code inspects bytes; report never includes content.
  $rem=[int]($length % 512)
  if($rem -gt 0){
    $tailStart=$length-$rem
    $textCount=0
    for($i=$tailStart;$i -lt $length;$i++){
      $ch=[int]$bytes[$i]
      if($ch -eq 9 -or $ch -eq 10 -or $ch -eq 13 -or ($ch -ge 32 -and $ch -le 126)) {$textCount++}
    }
    $report.tailPrintableAscii=($textCount -ge [Math]::Ceiling(0.95*$rem))
    # Local-only classification; text is never printed or written.
    $tail=[Text.Encoding]::ASCII.GetString($bytes,$tailStart,$rem)
    $report.tailErrorLike=([bool]($tail -match '(?i)(tar:|error:|cannot |no such file|permission denied|not found|usage:)'))
  }
  $pos=[long]0
  $zeroSeen=0
  while($pos+512 -le $length){
    if(Zero512 $bytes ([int]$pos)){
      $zeroSeen++
      $report.zeroBlockCount++
      $pos+=512
      continue
    }
    if($zeroSeen -gt 0) {
      $report.nonZeroAfterEof=$true
      break
    }
    $stored=Octal $bytes ([int]($pos+148)) 8
    $size=Octal $bytes ([int]($pos+124)) 12
    $sum=[long]0
    for($j=0;$j -lt 512;$j++){
      if($j -ge 148 -and $j -lt 156){$sum+=32}else{$sum+=[long]$bytes[[int]$pos+$j]}
    }
    if($null -eq $stored -or $null -eq $size -or $stored -ne $sum) {
      $report.firstBadHeaderBlock=[long]($pos/512)
      break
    }
    $report.validHeaderCount++
    $pos += 512 + ([long][Math]::Ceiling($size/512.0))*512
    if($pos -gt $length){ $report.structureClass='TRUNCATED_MEMBER_PAYLOAD'; break }
  }
  if($length -eq 0){$report.structureClass='EMPTY_STREAM'}
  elseif($report.firstBlockKind -eq 'ZERO' -and $report.secondBlockKind -eq 'ZERO' -and $rem -gt 0){
    $report.structureClass='EMPTY_TAR_EOF_PLUS_UNALIGNED_TRAILER'
  }
  elseif($report.firstBadHeaderBlock -ne $null){$report.structureClass='BAD_HEADER'}
  elseif($report.nonZeroAfterEof){$report.structureClass='NONZERO_AFTER_TAR_EOF'}
  elseif($rem -gt 0){$report.structureClass='UNALIGNED_BYTES'}
  elseif($report.validHeaderCount -gt 0 -and $report.zeroBlockCount -ge 2){
    $report.structureClass='HEADER_AND_EOF_STRUCTURALLY_PLAUSIBLE'
  }
  elseif($report.structureClass -eq 'NOT_TESTED'){$report.structureClass='INCOMPLETE_OR_UNRECOGNIZED_TAR'}
  $report.status='READONLY_DIAGNOSIS_COMPLETE'
  $report.code='PUBLIC_ONLY_NO_PRIVATE_DATA'
  Save
}
catch {
  if($report.code -eq 'NOT_STARTED'){
    $report.code='LOCAL_READ_OR_PARSE_FAILURE'
    $report.status='BLOCKED'
    Save
  }
}
Write-Host ('Report (share JSON only): '+$reportFile)
Write-Host ('Classification: '+$report.structureClass)
Write-Host 'No Android/ADB/private data accessed; keep original TAR unchanged.'
