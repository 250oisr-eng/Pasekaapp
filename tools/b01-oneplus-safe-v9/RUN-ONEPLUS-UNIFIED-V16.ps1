# PASEKA B01 V16: OFFLINE candidate checksum + safe PC-only file rehydration.
# Windows PowerShell 5.1; never uses ADB/phone/network or prior diagnostic folders.
[CmdletBinding()]
param([string]$CandidateRoot='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$base=$PSScriptRoot
$reportPath=Join-Path $base 'B01-RESULT.json'
if([IO.File]::Exists($reportPath)){
 Write-Host 'Result already exists; no overwrite. Use a freshly extracted ZIP.'
 exit 0
}
$report=[ordered]@{
 schema='paseka-b01-independent-offline-pc-rehydration-v16'
 status='BLOCKED'
 code='NOT_STARTED'
 stage='START'
 source='PERSISTENT_PC_CANDIDATE_ONLY'
 candidateFound=$false
 candidateTarBytes=$null
 candidateTarSha256=$null
 manifestHashMatched=$false
 tarMemberCount=0
 tarRegularFiles=0
 tarDirectories=0
 indexedDbPathHints=0
 webviewPathHints=0
 appDatabasePathHints=0
 candidateCount=0
 reconstructionStatus='NOT_TESTED'
 reconstructedBytes=0
 independentlyComparedFiles=0
 byteForByteComparison='NOT_TESTED'
 reconstructionRoot='REDACTED_LOCAL_PC_ONLY'
 originalTarUnmodified='NOT_VERIFIED'
 priorTestFilesRequired=$false
 adbUsed='NO'
 phoneWrites='NOT_ATTEMPTED'
 phoneReads='NOT_ATTEMPTED'
 appRestored='NOT_TESTED'
 independentRestore='NOT_TESTED'
 fullBackupVerified=$false
 backupCompleteness='NOT_VERIFIED'
 mediaStoreGalleryCoverage='NOT_TESTED'
 videoCleanup='NOT_ATTEMPTED'
 install='NOT_ATTEMPTED'
 uninstall='NOT_ATTEMPTED'
 clear='NOT_ATTEMPTED'
 network='NOT_ATTEMPTED'
}
$script:restoreDir=$null
function Save {
 [IO.File]::WriteAllText($reportPath,(ConvertTo-Json -InputObject $report -Depth 8),
  (New-Object Text.UTF8Encoding($false)))
}
function Block([string]$code) { $report.code=$code; $report.status='BLOCKED'; Save; throw $code }
function Read-Exact($stream,[byte[]]$buf,[int]$count) {
 $got=0
 while($got -lt $count){
  $n=$stream.Read($buf,$got,$count-$got)
  if($n -le 0){throw 'TAR_UNEXPECTED_END_OF_STREAM'}
  $got += $n
 }
}
function Tar-Field([byte[]]$b,[int]$start,[int]$width) {
 $size=0
 while($size -lt $width -and $b[$start+$size] -ne 0){$size++}
 $utf8=New-Object Text.UTF8Encoding($false,$true)
 return $utf8.GetString($b,$start,$size)
}
function Octal([byte[]]$b,[int]$start,[int]$count) {
 $s=[Text.Encoding]::ASCII.GetString($b,$start,$count).Trim([char[]]@([char]0,[char]32))
 if($s -notmatch '^[0-7]{1,12}$'){throw 'TAR_OCTAL_FIELD_INVALID'}
 return [Convert]::ToInt64($s,8)
}
function Safe-TarName([string]$raw,[string]$kind) {
 # Reject Win32 special/device paths before joining with new empty PC target.
 if($raw -eq '.' -or $raw -eq './') {
  if($kind -ne '5'){throw 'TAR_ROOT_FILE_FORBIDDEN'}
  return ''
 }
 if($raw.StartsWith('./',[StringComparison]::Ordinal)){$raw=$raw.Substring(2)}
 if($raw.StartsWith('/') -or $raw.StartsWith('\') -or
    $raw.Contains('\') -or $raw.Contains(':') -or $raw.Length -gt 210) {
  throw 'TAR_UNSAFE_MEMBER_PATH'
 }
 if($kind -eq '5'){$raw=$raw.TrimEnd('/')}
 if(-not $raw){throw 'TAR_EMPTY_MEMBER_PATH'}
 $bits=@($raw.Split('/'))
 if($bits.Count -gt 25){throw 'TAR_PATH_TOO_DEEP'}
 foreach($part in $bits){
  if(-not $part -or $part -eq '.' -or $part -eq '..' -or
     $part -match '[\x00-\x1f\x7f]|[<>:"|?*]' -or
     $part -match '^(?i:(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]))(\..*)?$' -or
     $part.EndsWith('.') -or $part.EndsWith(' ')) {
    throw 'TAR_UNSAFE_MEMBER_PATH'
  }
 }
 return [string]::Join('/',$bits)
}
function Ensure-Fixed-NoReparse([string]$path) {
 $full=[IO.Path]::GetFullPath($path)
 $drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($full))
 if(-not $drive.IsReady -or $drive.DriveType -ne [IO.DriveType]::Fixed){throw 'PERSISTENT_ROOT_NOT_FIXED_LOCAL'}
 $current=New-Object IO.DirectoryInfo($full)
 while($null -ne $current) {
  if($current.Exists -and (([int]$current.Attributes -band [int][IO.FileAttributes]::ReparsePoint) -ne 0)){
   throw 'PERSISTENT_ROOT_REPARSE_POINT'
  }
  $current=$current.Parent
 }
 return $drive
}
try {
 Save
 $root=if($CandidateRoot){$CandidateRoot}else{Join-Path $env:USERPROFILE 'PASEKA-B01-KEEP-PRIVATE-CANDIDATES'}
 if(-not [IO.Path]::IsPathRooted($root) -or $root.StartsWith('\\')){Block 'PERSISTENT_ROOT_MUST_BE_LOCAL_ABSOLUTE'}
 $root=[IO.Path]::GetFullPath($root).TrimEnd([IO.Path]::DirectorySeparatorChar)
 $test=[IO.Path]::GetFullPath($base).TrimEnd([IO.Path]::DirectorySeparatorChar)
 if($root.StartsWith($test+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or
    $root -eq $test){Block 'PERSISTENT_CANDIDATE_INSIDE_DISPOSABLE_TEST'}
 if(-not [IO.Directory]::Exists($root)){Block 'NO_PERSISTENT_CANDIDATE_ROOT'}
 $drive=Ensure-Fixed-NoReparse $root
 $candidates=@(Get-ChildItem -LiteralPath $root -Directory -Filter 'candidate-*' -ErrorAction Stop |
  Where-Object {
   $_.Name -match '^candidate-[a-fA-F0-9]{32}$' -and
   [IO.File]::Exists((Join-Path $_.FullName 'MANIFEST.json')) -and
   (([int]$_.Attributes -band [int][IO.FileAttributes]::ReparsePoint) -eq 0)
  } | Sort-Object CreationTimeUtc -Descending)
 $report.candidateCount=$candidates.Count
 if($candidates.Count -lt 1){Block 'NO_VERIFIED_MANIFEST_CANDIDATE'}
 if($candidates.Count -gt 64){Block 'TOO_MANY_PERSISTENT_CANDIDATES'}
 $picked=$candidates[0]
 $report.candidateFound=$true
 $manifestFile=Join-Path $picked.FullName 'MANIFEST.json'
 $mi=Get-Item -LiteralPath $manifestFile
 if($mi.Length -gt 16384 -or (([int]$mi.Attributes -band [int][IO.FileAttributes]::ReparsePoint) -ne 0)){
  Block 'CANDIDATE_MANIFEST_UNSAFE'
 }
 $manifest=Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
 if($manifest.schema -ne 'paseka-b01-private-candidate-pc-v1' -or
    $manifest.candidateKind -ne 'APP_DATA_CANDIDATE_NOT_FULL_BACKUP' -or
    $manifest.transport -ne 'EXEC_OUT' -or
    $manifest.fullBackupVerified -ne $false -or
    $manifest.independentRestore -ne 'NOT_TESTED' -or
    [string]$manifest.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or
    [long]$manifest.entries -le 0){Block 'CANDIDATE_MANIFEST_INVALID'}
 $files=@(Get-ChildItem -LiteralPath $picked.FullName -File -Filter 'private-candidate-v9-*.tar')
 if($files.Count -ne 1){Block 'EXPECTED_EXACTLY_ONE_PRIVATE_TAR'}
 $archive=$files[0]
 if((([int]$archive.Attributes -band [int][IO.FileAttributes]::ReparsePoint) -ne 0) -or
    $archive.Length -lt 1536 -or $archive.Length -gt ([long]8*1024*1024*1024) -or
    $archive.Length % 512 -ne 0 -or $archive.Length -ne [long]$manifest.bytes){
  Block 'PERSISTENT_ARCHIVE_SIZE_OR_TYPE_INVALID'
 }
 $report.candidateTarBytes=[long]$archive.Length
 $report.stage='VERIFY_SHA256'
 Save
 $hash=(Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
 $report.candidateTarSha256=$hash
 if($hash -cne ([string]$manifest.sha256).ToLowerInvariant()){Block 'CANDIDATE_SHA256_MISMATCH'}
 $report.manifestHashMatched=$true
 $report.stage='READONLY_TAR_PREFLIGHT'
 Save
 $entries=New-Object 'System.Collections.Generic.List[object]'
 $seen=New-Object 'System.Collections.Generic.HashSet[string]' -ArgumentList ([StringComparer]::OrdinalIgnoreCase)
 $tar=New-Object IO.FileStream($archive.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try {
  $h=New-Object byte[] 512
  $zeros=0
  $headerCount=0
  $expanded=[long]0
  while($tar.Position -lt $tar.Length){
   Read-Exact $tar $h 512
   $zero=$true
   foreach($b in $h){if($b -ne 0){$zero=$false;break}}
   if($zero){$zeros++;continue}
   if($zeros -gt 0){throw 'TAR_NONZERO_AFTER_EOF'}
   $claimed=Octal $h 148 8
   $actual=[long]0
   for($i=0;$i -lt 512;$i++){
    if($i -ge 148 -and $i -lt 156){$actual+=32}else{$actual+=[long]$h[$i]}
   }
   if($claimed -ne $actual){throw 'TAR_HEADER_CHECKSUM_INVALID'}
   $type=if($h[156] -eq 0){'0'}else{[string][char]$h[156]}
   if($type -ne '0' -and $type -ne '5'){throw 'TAR_LINK_OR_SPECIAL_ENTRY_NOT_SAFE_FOR_PC_RECONSTRUCTION'}
   $size=Octal $h 124 12
   if($size -lt 0 -or $size -gt ([long]8*1024*1024*1024)){throw 'TAR_ENTRY_SIZE_INVALID'}
   if($type -eq '5' -and $size -ne 0){throw 'TAR_DIRECTORY_HAS_PAYLOAD'}
   $prefix=Tar-Field $h 345 155
   $name=Tar-Field $h 0 100
   if($prefix){$name=$prefix+'/'+$name}
   $clean=Safe-TarName $name $type
   $offset=[long]$tar.Position
   $skip=[long][Math]::Ceiling([double]$size / 512.0)*512
   if($skip -gt $tar.Length - $offset){throw 'TAR_PAYLOAD_TRUNCATED'}
   if($clean){
    if(-not $seen.Add($clean)){throw 'TAR_DUPLICATE_WINDOWS_MEMBER_PATH'}
    if($entries.Count -ge 20000){throw 'TAR_TOO_MANY_ENTRIES'}
    [void]$entries.Add([pscustomobject]@{name=$clean;type=$type;size=$size;offset=$offset})
    if($clean -match '(?i)(^|/)app_webview(/|$)'){$report.webviewPathHints++}
    if($clean -match '(?i)indexeddb'){$report.indexedDbPathHints++}
    if($clean -match '(?i)(^|/)databases(/|$)'){$report.appDatabasePathHints++}
    if($type -eq '0'){
     $report.tarRegularFiles++
     $expanded += $size
    }else{$report.tarDirectories++}
   }
   $headerCount++
   $tar.Position=$offset+$skip
  }
  # Reject file/child collisions BEFORE creating any reconstruction files.
  # A valid child requires all of its ancestor members to be directories.
  $regularPaths=New-Object 'System.Collections.Generic.HashSet[string]' -ArgumentList ([StringComparer]::OrdinalIgnoreCase)
  foreach($entry in $entries){
   if($entry.type -eq '0'){[void]$regularPaths.Add($entry.name)}
  }
  foreach($entry in $entries){
   $parts=$entry.name.Split('/')
   for($depth=1;$depth -lt $parts.Length;$depth++){
    $ancestor=[string]::Join('/', $parts[0..($depth-1)])
    if($regularPaths.Contains($ancestor)){throw 'TAR_FILE_PARENT_PATH_CONFLICT'}
   }
  }
  if($zeros -lt 2 -or $headerCount -lt 1){throw 'TAR_MISSING_EOF_OR_MEMBERS'}
  if($headerCount -ne [long]$manifest.entries){throw 'TAR_MANIFEST_ENTRY_COUNT_MISMATCH'}
  $report.tarMemberCount=$headerCount
  if($expanded -gt ([long]512*1024*1024)){throw 'PC_RECONSTRUCTION_LIMIT_512MIB'}
  if($drive.AvailableFreeSpace -lt ($expanded + [long]64*1024*1024)){
   throw 'INSUFFICIENT_LOCAL_PC_SPACE_FOR_ISOLATED_RECONSTRUCTION'
  }
  $report.stage='SAFE_PC_RECONSTRUCTION'
  Save
  $script:restoreDir=Join-Path $root ('pc-reconstruction-'+[Guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($script:restoreDir)
  $targetRoot=[IO.Path]::GetFullPath($script:restoreDir).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
  foreach($entry in $entries){
   $relative=$entry.name.Replace('/',[IO.Path]::DirectorySeparatorChar)
   $destination=[IO.Path]::GetFullPath((Join-Path $script:restoreDir $relative))
   if(-not $destination.StartsWith($targetRoot,[StringComparison]::OrdinalIgnoreCase) -or
      $destination.Length -ge 248){throw 'TAR_DESTINATION_OUTSIDE_EMPTY_PC_ROOT'}
   if($entry.type -eq '5'){
    [void][IO.Directory]::CreateDirectory($destination)
   }else{
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))
    $output=New-Object IO.FileStream($destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{
     $tar.Position=[long]$entry.offset
     $remaining=[long]$entry.size
     $buff=New-Object byte[] 65536
     while($remaining -gt 0){
      $take=[int][Math]::Min([long]$buff.Length,$remaining)
      Read-Exact $tar $buff $take
      $output.Write($buff,0,$take)
      $remaining-=$take
     }
     $output.Flush()
    }finally{$output.Dispose()}
    $report.reconstructedBytes += [long]$entry.size
   }
  }
  $report.stage='INDEPENDENT_PC_READBACK'
  Save
  foreach($entry in $entries){
   if($entry.type -ne '0'){continue}
   $relative=$entry.name.Replace('/',[IO.Path]::DirectorySeparatorChar)
   $destination=Join-Path $script:restoreDir $relative
   $sourcePosition=[long]$entry.offset
   $tar.Position=$sourcePosition
   $rebuilt=New-Object IO.FileStream($destination,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
   try{
    if($rebuilt.Length -ne [long]$entry.size){throw 'PC_REBUILT_FILE_SIZE_MISMATCH'}
    $left=[long]$entry.size
    $srcBuffer=New-Object byte[] 65536
    $dstBuffer=New-Object byte[] 65536
    while($left -gt 0){
     $take=[int][Math]::Min([long]$srcBuffer.Length,$left)
     Read-Exact $tar $srcBuffer $take
     Read-Exact $rebuilt $dstBuffer $take
     for($i=0;$i -lt $take;$i++){
      if($srcBuffer[$i] -ne $dstBuffer[$i]){throw 'PC_REBUILT_FILE_BYTES_MISMATCH'}
     }
     $left-=$take
    }
    $report.independentlyComparedFiles++
   }finally{$rebuilt.Dispose()}
  }
 }finally{$tar.Dispose()}
 $after=(Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
 if($after -cne $hash){Block 'ORIGINAL_TAR_CHANGED_DURING_PC_CHECK'}
 $report.originalTarUnmodified='SHA256_MATCH_AFTER'
 $report.byteForByteComparison='PASS'
 $report.reconstructionStatus='PC_FILES_RECONSTRUCTED_NOT_ANDROID_RESTORE'
 $report.status='PC_RECONSTRUCTION_PASS_NOT_FULL_BACKUP'
 $report.code='CANDIDATE_SHA_AND_PC_BYTE_READBACK_PASS_ANDROID_RESTORE_NOT_TESTED'
 $report.stage='COMPLETE'
 Save
}catch{
 if($script:restoreDir -and [IO.Directory]::Exists($script:restoreDir)){
  try{
   $marker=Join-Path $script:restoreDir 'INVALID-PC-RECONSTRUCTION-NOT-BACKUP.txt'
   $bytes=[Text.Encoding]::ASCII.GetBytes('BLOCKED: incomplete PC reconstruction. NOT an Android restore or verified backup.')
   $mark=new-object IO.FileStream($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   try{$mark.Write($bytes,0,$bytes.Length)}finally{$mark.Dispose()}
  }catch{}
 }
 $report.status='BLOCKED'
 if($report.code -eq 'NOT_STARTED'){
  $allowed=@(
   'TAR_UNEXPECTED_END_OF_STREAM','TAR_OCTAL_FIELD_INVALID','TAR_ROOT_FILE_FORBIDDEN',
   'TAR_UNSAFE_MEMBER_PATH','TAR_EMPTY_MEMBER_PATH','TAR_PATH_TOO_DEEP',
   'PERSISTENT_ROOT_NOT_FIXED_LOCAL','PERSISTENT_ROOT_REPARSE_POINT',
   'TAR_NONZERO_AFTER_EOF','TAR_HEADER_CHECKSUM_INVALID',
   'TAR_LINK_OR_SPECIAL_ENTRY_NOT_SAFE_FOR_PC_RECONSTRUCTION','TAR_ENTRY_SIZE_INVALID',
   'TAR_DIRECTORY_HAS_PAYLOAD','TAR_PAYLOAD_TRUNCATED',
   'TAR_DUPLICATE_WINDOWS_MEMBER_PATH','TAR_TOO_MANY_ENTRIES','TAR_FILE_PARENT_PATH_CONFLICT','TAR_MISSING_EOF_OR_MEMBERS',
   'TAR_MANIFEST_ENTRY_COUNT_MISMATCH','PC_RECONSTRUCTION_LIMIT_512MIB',
   'INSUFFICIENT_LOCAL_PC_SPACE_FOR_ISOLATED_RECONSTRUCTION',
   'TAR_DESTINATION_OUTSIDE_EMPTY_PC_ROOT','PC_REBUILT_FILE_SIZE_MISMATCH',
   'PC_REBUILT_FILE_BYTES_MISMATCH'
  )
  $kind=[string]$_.Exception.Message
  $report.code=if($allowed -contains $kind){$kind}else{'LOCAL_PC_VALIDATION_ERROR_REDACTED'}
 }
 $report.stage='BLOCKED'
 Save
}
Write-Host ('SHARE ONLY: '+$reportPath)
Write-Host ('Status: '+$report.status+' / '+$report.code)
Write-Host 'No Android commands were used. Private TAR, MANIFEST and reconstruction stay ONLY on your PC.'
Write-Host 'Even a PASS does NOT prove restore into the live Android application or MediaStore coverage.'
