# B01 V17: offline, metadata-only inventory of previously reconstructed WebView files.
# Windows PowerShell 5.1. Never opens IndexedDB, reads records, or mutates source.
[CmdletBinding()]
param([string]$CandidateRoot='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$reportFile=Join-Path $PSScriptRoot 'B01-RESULT.json'
if([IO.File]::Exists($reportFile)){Write-Host 'Existing report preserved; use a new extracted package';exit 0}
$report=[ordered]@{
 schema='paseka-b01-webview-indexeddb-fileset-v17'
 status='BLOCKED'; code='NOT_STARTED'; stage='START'
 reconstructionFound=$false; reconstructionCount=0
 directoriesChecked=0; regularFilesChecked=0; totalFileBytes=0
 webviewPathHints=0; indexedDbPathHints=0
 indexedDbDirectoryCount=0; leveldbCurrentCount=0; leveldbManifestCount=0
 leveldbTableCount=0; leveldbLogCount=0; leveldbFileSetsWithMarkers=0
 unsupportedFileTypes=0
 fileDataRead='NO'; dbRecordsRead='NO'; dbOpened='NO'
 byteForByteVerification='V16_REPORT_ONLY_NOT_REPEATED'
 androidRestore='NOT_TESTED'; independentRestore='NOT_TESTED'
 originalTarChecked='NOT_IN_THIS_STAGE'; fullBackupVerified=$false
 mediaStoreGalleryCoverage='NOT_TESTED'; videoCleanup='NOT_ATTEMPTED'
 phoneRead='NOT_ATTEMPTED'; phoneWrites='NOT_ATTEMPTED'
 install='NOT_ATTEMPTED'; network='NOT_ATTEMPTED'
}
function Save {
 [IO.File]::WriteAllText($reportFile,(ConvertTo-Json -InputObject $report -Depth 6),(New-Object Text.UTF8Encoding($false)))
}
function Block([string]$code){$report.code=$code;$report.status='BLOCKED';$report.stage='BLOCKED';Save;throw $code}
function IsReparse($item){
 return (([int]$item.Attributes -band [int][IO.FileAttributes]::ReparsePoint) -ne 0)
}
function ValidateFixedRoot([string]$path){
 $full=[IO.Path]::GetFullPath($path)
 $drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($full))
 if(-not $drive.IsReady -or $drive.DriveType -ne [IO.DriveType]::Fixed){throw 'NONLOCAL_ROOT'}
 $d=New-Object IO.DirectoryInfo($full)
 while($null -ne $d){
  if($d.Exists -and (IsReparse $d)){throw 'REPARSE_ROOT'}
  $d=$d.Parent
 }
 return $full
}
try {
 Save
 $root=if($CandidateRoot){$CandidateRoot}else{Join-Path $env:USERPROFILE 'PASEKA-B01-KEEP-PRIVATE-CANDIDATES'}
 if(-not [IO.Path]::IsPathRooted($root) -or $root.StartsWith('\\')){Block 'CANDIDATE_ROOT_NOT_LOCAL_ABSOLUTE'}
 $root=ValidateFixedRoot $root
 if(-not [IO.Directory]::Exists($root)){Block 'PERSISTENT_ROOT_MISSING'}
 $folders=@(Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction Stop | Where-Object {
   $_.Name -match '^pc-reconstruction-[a-fA-F0-9]{32}$' -and -not (IsReparse $_)
 })
 $report.reconstructionCount=$folders.Count
 if($folders.Count -lt 1){Block 'NO_PC_RECONSTRUCTION_FOUND'}
 if($folders.Count -gt 64){Block 'TOO_MANY_PC_RECONSTRUCTIONS'}
 $folder=@($folders | Sort-Object CreationTimeUtc -Descending)[0]
 $report.reconstructionFound=$true
 $base=ValidateFixedRoot $folder.FullName
 $report.stage='SCAN_METADATA_ONLY'
 Save
 $stack=New-Object 'System.Collections.Generic.Stack[object]'
 $stack.Push([pscustomobject]@{path=$base;depth=0})
 $sets=@{}
 $count=0
 while($stack.Count -gt 0){
  $node=$stack.Pop()
  if($node.depth -gt 25){Block 'TREE_TOO_DEEP'}
  foreach($item in @(Get-ChildItem -LiteralPath $node.path -Force -ErrorAction Stop)){
   $count++
   if($count -gt 20000){Block 'TREE_TOO_MANY_MEMBERS'}
   if(IsReparse $item){Block 'REPARSE_MEMBER_FORBIDDEN'}
   $relative=$item.FullName.Substring($base.Length).TrimStart([char[]]@('\','/'))
   if($relative -match '(^|[\\/])INVALID-PC-RECONSTRUCTION-NOT-BACKUP\.txt$'){Block 'INCOMPLETE_PC_RECONSTRUCTION'}
   $isWebview=($relative -match '(^|[\\/])app_webview([\\/]|$)')
   $isIdb=($relative -match '(^|[\\/])IndexedDB([\\/]|$)')
   if($isWebview){$report.webviewPathHints++}
   if($isIdb){$report.indexedDbPathHints++}
   if($item.PSIsContainer){
    $report.directoriesChecked++
    if($isIdb){$report.indexedDbDirectoryCount++}
    $stack.Push([pscustomobject]@{path=$item.FullName;depth=$node.depth+1})
   }elseif($item -is [IO.FileInfo]){
    $report.regularFilesChecked++
    $report.totalFileBytes += [long]$item.Length
    if($report.totalFileBytes -gt ([long]8*1024*1024*1024)){Block 'TREE_BYTES_OVER_LIMIT'}
    if($isIdb -and $relative -match '(?i)\.leveldb[\\/][^\\/]+$'){
     $dir=[IO.Path]::GetDirectoryName($relative).ToLowerInvariant()
     if(-not $sets.ContainsKey($dir)){$sets[$dir]=[ordered]@{current=0;manifest=0;table=0;log=0}}
     if($item.Name -ceq 'CURRENT'){$sets[$dir].current++}
     if($item.Name -cmatch '^MANIFEST-[0-9]+$'){$sets[$dir].manifest++}
     if($item.Name -match '(?i)\.(ldb|sst)$'){$sets[$dir].table++}
     if($item.Name -match '(?i)\.log$'){$sets[$dir].log++}
    }
   }else{$report.unsupportedFileTypes++;Block 'UNSUPPORTED_FILESYSTEM_MEMBER'}
  }
 }
 foreach($value in $sets.Values){
  $report.leveldbCurrentCount += $value.current
  $report.leveldbManifestCount += $value.manifest
  $report.leveldbTableCount += $value.table
  $report.leveldbLogCount += $value.log
  if($value.current -gt 0 -and $value.manifest -gt 0 -and ($value.table -gt 0 -or $value.log -gt 0)){
   $report.leveldbFileSetsWithMarkers++
  }
 }
 if($report.leveldbFileSetsWithMarkers -lt 1){
  $report.status='REVIEW_REQUIRED'
  $report.code='NO_INDEXEDDB_LEVELDB_FILESET_WITH_EXPECTED_MARKERS'
 }else{
  $report.status='PC_INDEXEDDB_FILESET_MARKERS_FOUND_NOT_RESTORED'
  $report.code='METADATA_ONLY_INDEXEDDB_MARKERS_PRESENT'
 }
 $report.stage='COMPLETE'
 Save
}catch{
 if($report.code -eq 'NOT_STARTED'){
  $report.status='BLOCKED';$report.stage='BLOCKED'
  $allowed=@('NONLOCAL_ROOT','REPARSE_ROOT','TREE_TOO_DEEP','TREE_TOO_MANY_MEMBERS','TREE_BYTES_OVER_LIMIT')
  $reason=[string]$_.Exception.Message
  $report.code=if($allowed -contains $reason){$reason}else{'LOCAL_METADATA_SCAN_FAILED_REDACTED'}
  Save
 }
}
Write-Host ('Share ONLY '+$reportFile)
Write-Host ('Result: '+$report.status+' / '+$report.code)
Write-Host 'No private paths, filenames, DB records or data payloads are included.'
Write-Host 'File-set markers do NOT prove IndexedDB validity, functioning app restore or video completeness.'
