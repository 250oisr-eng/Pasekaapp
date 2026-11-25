# PASEKA B01 V18 / local, read-only LevelDB .log physical CRC gate.
# Every data byte stays on PC. No decoded database keys/values.
[CmdletBinding()]
param([string]$CandidateRoot='')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$reportPath=Join-Path $PSScriptRoot 'B01-RESULT.json'
if([IO.File]::Exists($reportPath)){Write-Host 'Report already exists and was NOT overwritten';exit 0}
$r=[ordered]@{
 schema='paseka-b01-leveldb-log-physical-crc-v18'
 status='BLOCKED';code='NOT_STARTED';stage='START'
 reconstructionFound=$false; logFilesChecked=0; logBytesChecked=0
 physicalRecordsValid=0; logicalRecordsClosed=0; crcFailures=0
 leveldbLogFileHints=0; indexedDbDirectoryHints=0
 recordsDecoded='NO'; userValuesExported='NO'; rawFileBytesReadLocally='YES'
 sourceFilesModified='NO'; sourceTarRehashed='NOT_IN_THIS_STAGE'
 webviewDbOpened='NO'; androidRestore='NOT_TESTED'
 independentRestore='NOT_TESTED'; fullBackupVerified=$false
 mediaStoreGalleryCoverage='NOT_TESTED'; videoCleanup='NOT_ATTEMPTED'
 adbUsed='NO'; phoneWrites='NOT_ATTEMPTED'; network='NOT_ATTEMPTED'
}
function Save-Report {
 [IO.File]::WriteAllText($reportPath,(ConvertTo-Json -InputObject $r -Depth 5),(New-Object Text.UTF8Encoding($false)))
}
function Fail([string]$why) {
 $r.status='BLOCKED';$r.code=$why;$r.stage='BLOCKED';Save-Report
 throw $why
}
function Is-Reparse([IO.FileSystemInfo]$f) {
 return (([int]$f.Attributes -band [int][IO.FileAttributes]::ReparsePoint) -ne 0)
}
function Fixed-Path([string]$p) {
 $full=[IO.Path]::GetFullPath($p)
 $drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($full))
 if(-not $drive.IsReady -or $drive.DriveType -ne [IO.DriveType]::Fixed){throw 'NONLOCAL_OR_UNREADY_ROOT'}
 $dir=New-Object IO.DirectoryInfo($full)
 while($null -ne $dir){
  if($dir.Exists -and (Is-Reparse $dir)){throw 'ROOT_REPARSE_POINT'}
  $dir=$dir.Parent
 }
 return $full
}
$parser=@'
using System;
using System.IO;
public static class B01LevelDbPhysicalLogV18 {
 const int Block = 32768;
 public static long Records;
 public static long Logical;
 public static long Bytes;
 public static string Check(string path) {
  Records = 0; Logical = 0; Bytes = 0;
  using (var f = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)) {
   if(f.Length == 0 || f.Length > 256L*1024*1024) return "LOG_EMPTY_OR_OVERSIZED";
   long originalLength=f.Length;
   DateTime originalWrite=File.GetLastWriteTimeUtc(path);
   byte[] buffer=new byte[Block]; bool fragmented=false;
   while (Bytes < originalLength) {
    int amount=(int)Math.Min(Block,originalLength-Bytes);
    int read=0;
    while(read<amount) {
     int n=f.Read(buffer,read,amount-read);
     if(n==0) return "LOG_TRUNCATED_DURING_READ";
     read+=n;
    }
    Bytes+=read;
    int offset=0;
    while(offset<read) {
     int remaining=read-offset;
     if(remaining<7) {
      for(int i=offset;i<read;i++) if(buffer[i]!=0) return "LOG_NONZERO_SHORT_BLOCK_TAIL";
      break;
     }
     int length=buffer[offset+4] | (buffer[offset+5]<<8);
     int kind=buffer[offset+6];
     if(length==0 && kind==0) {
      for(int i=offset;i<read;i++) if(buffer[i]!=0) return "LOG_NONZERO_ZERO_HEADER_TAIL";
      break;
     }
     if(length>remaining-7) return "LOG_FRAGMENT_OUTSIDE_BLOCK";
     if(kind<1 || kind>4) return "LOG_UNKNOWN_RECORD_TYPE";
     uint stored=(uint)(buffer[offset] | (buffer[offset+1]<<8) | (buffer[offset+2]<<16) | (buffer[offset+3]<<24));
     uint crc=0xFFFFFFFFu;
     crc=Update(crc,(byte)kind);
     for(int i=offset+7;i<offset+7+length;i++)crc=Update(crc,buffer[i]);
     crc=~crc;
     uint masked=((crc>>15)|(crc<<17))+0xa282ead8u;
     if(masked!=stored)return "LOG_CRC32C_MISMATCH";
     Records++;
     if(kind==1) {
      if(fragmented)return "LOG_UNFINISHED_FRAGMENT_CHAIN";
      Logical++;
     } else if(kind==2) {
      if(fragmented)return "LOG_NESTED_FIRST_FRAGMENT";
      fragmented=true;
     } else if(kind==3) {
      if(!fragmented)return "LOG_MIDDLE_WITHOUT_FIRST";
     } else if(kind==4) {
      if(!fragmented)return "LOG_LAST_WITHOUT_FIRST";
      fragmented=false;Logical++;
     }
     offset+=length+7;
    }
   }
   if(fragmented)return "LOG_OPEN_FRAGMENT_CHAIN";
   if(f.Length!=originalLength || File.GetLastWriteTimeUtc(path)!=originalWrite)
    return "LOG_CHANGED_DURING_READ";
   return Records>0 ? "PASS" : "LOG_HAS_NO_PHYSICAL_RECORDS";
  }
 }
 static uint Update(uint crc, byte b) {
  crc^=b;
  for(int i=0;i<8;i++)crc=(crc>>1)^((crc&1)==0?0u:0x82F63B78u);
  return crc;
 }
}
'@
try {
 Save-Report
 $root=if($CandidateRoot){$CandidateRoot}else{Join-Path $env:USERPROFILE 'PASEKA-B01-KEEP-PRIVATE-CANDIDATES'}
 if(-not [IO.Path]::IsPathRooted($root) -or $root.StartsWith('\\')){Fail 'CANDIDATE_ROOT_NOT_LOCAL_ABSOLUTE'}
 $root=Fixed-Path $root
 if(-not [IO.Directory]::Exists($root)){Fail 'PERSISTENT_ROOT_MISSING'}
 $recons=@(Get-ChildItem -LiteralPath $root -Directory -Force | Where-Object {
    $_.Name -match '^pc-reconstruction-[a-f0-9]{32}$' -and -not (Is-Reparse $_)
 })
 if($recons.Count -lt 1){Fail 'NO_PC_RECONSTRUCTION_FOUND'}
 if($recons.Count -gt 64){Fail 'TOO_MANY_RECONSTRUCTIONS'}
 $base=Fixed-Path (@($recons | Sort-Object CreationTimeUtc -Descending)[0].FullName)
 $r.reconstructionFound=$true
 $r.stage='READONLY_LOG_CHECK';Save-Report
 $stack=New-Object 'System.Collections.Generic.Stack[object]'
 $stack.Push([pscustomobject]@{dir=$base;depth=0})
 $logs=New-Object 'System.Collections.Generic.List[string]'
 $total=0
 while($stack.Count -gt 0) {
  $node=$stack.Pop()
  if($node.depth -gt 25){Fail 'TREE_TOO_DEEP'}
  foreach($item in @(Get-ChildItem -LiteralPath $node.dir -Force)) {
   $total++
   if($total -gt 20000){Fail 'TREE_TOO_MANY_MEMBERS'}
   if(Is-Reparse $item){Fail 'REPARSE_MEMBER_FORBIDDEN'}
   $relative=$item.FullName.Substring($base.Length).TrimStart([char[]]@('\','/'))
   if($relative -match '(^|[\\/])INVALID-PC-RECONSTRUCTION-NOT-BACKUP\.txt$'){Fail 'INCOMPLETE_PC_RECONSTRUCTION'}
   $inDb=($relative -match '(?i)(^|[\\/])app_webview[\\/].*[\\/]IndexedDB([\\/]|$)')
   if($item.PSIsContainer){
    if($inDb){$r.indexedDbDirectoryHints++}
    $stack.Push([pscustomobject]@{dir=$item.FullName;depth=$node.depth+1})
   } elseif($item -is [IO.FileInfo]) {
    if($inDb -and $relative -match '(?i)\.leveldb[\\/][^\\/]+\.log$'){
      if($logs.Count -ge 64){Fail 'TOO_MANY_LEVELDB_LOGS'}
      [void]$logs.Add($item.FullName)
      $r.leveldbLogFileHints++
    }
   }else{Fail 'UNSUPPORTED_FILESYSTEM_MEMBER'}
  }
 }
 if($logs.Count -eq 0){
  $r.status='REVIEW_REQUIRED';$r.code='NO_INDEXEDDB_LEVELDB_LOG_FOUND'
  $r.stage='COMPLETE';Save-Report
 } else {
  Add-Type -TypeDefinition $parser -ErrorAction Stop
  foreach($path in $logs) {
   $fi=New-Object IO.FileInfo($path)
   if(-not $fi.Exists -or (Is-Reparse $fi)){Fail 'LOG_NOT_REGULAR'}
   if($fi.Length -gt 256MB -or $fi.Length -lt 1){Fail 'LOG_EMPTY_OR_OVERSIZED'}
   $outcome=[B01LevelDbPhysicalLogV18]::Check($path)
   if($outcome -ne 'PASS'){
    if($outcome -eq 'LOG_CRC32C_MISMATCH'){$r.crcFailures++}
    Fail $outcome
   }
   $r.logFilesChecked++
   $r.logBytesChecked += [long][B01LevelDbPhysicalLogV18]::Bytes
   $r.physicalRecordsValid += [long][B01LevelDbPhysicalLogV18]::Records
   $r.logicalRecordsClosed += [long][B01LevelDbPhysicalLogV18]::Logical
   if($r.logBytesChecked -gt 512MB){Fail 'AGGREGATE_LOG_BYTES_OVER_LIMIT'}
  }
  $r.status='PC_LEVELDB_LOG_PHYSICAL_CRC_PASS_NOT_DB_RESTORE'
  $r.code='LEVELDB_LOG_CRC32C_AND_FRAGMENT_BOUNDARIES_VALID'
  $r.stage='COMPLETE';Save-Report
 }
} catch {
 if($r.code -eq 'NOT_STARTED' -or $r.stage -eq 'READONLY_LOG_CHECK'){
  $r.status='BLOCKED';$r.stage='BLOCKED'
  $why=[string]$_.Exception.Message
  $r.code=if($why -in @('NONLOCAL_OR_UNREADY_ROOT','ROOT_REPARSE_POINT')){$why}else{'OFFLINE_LOG_SCAN_FAILED_REDACTED'}
  Save-Report
 }
}
Write-Host ('Result: '+$r.status+' / '+$r.code)
Write-Host 'Only B01-RESULT.json can be shared. NEVER share LevelDB logs or any private app files.'
Write-Host 'A physical CRC PASS does not prove IndexedDB functionality or Android restore.'
