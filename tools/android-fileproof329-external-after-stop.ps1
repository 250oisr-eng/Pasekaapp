# Re-check EXACT already exported synthetic PASEKA01 in isolated Android Downloads
# before and after stopping ONLY ru.paseka.journal.archive.fileproof329.
# Never install, relaunch, clear, delete, restore, or read other user directories.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$pkg='ru.paseka.journal.archive.fileproof329'
$directory='/sdcard/Download/PasekaProof329'
$expectedArchive='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
$expectedReport='002fbc37d6627e1412f95ad68946388dceeb257fda55b51b8df62b7ba3886ac4'
$expectedVideo=@(
 '794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
 'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'
)
function Sha256([byte[]]$bytes) {
 $hash=[Security.Cryptography.SHA256]::Create()
 try {return [BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}
 finally{$hash.Dispose()}
}
function Decode([byte[]]$bytes) {
 return (New-Object System.Text.UTF8Encoding($false,$true)).GetString($bytes)
}
function Adb([string[]]$argv) {
 $exe=(Get-Command adb -CommandType Application -ErrorAction Stop).Source
 $info=New-Object System.Diagnostics.ProcessStartInfo
 $info.FileName=$exe
 $info.Arguments=$argv -join ' '
 $info.UseShellExecute=$false
 $info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true
 $info.RedirectStandardError=$true
 $process=New-Object System.Diagnostics.Process
 $process.StartInfo=$info
 $memory=New-Object System.IO.MemoryStream
 try {
  if(-not $process.Start()) {throw 'ADB_START_FAILED'}
  $process.StandardOutput.BaseStream.CopyTo($memory)
  $diagnostic=$process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if($memory.Length -gt 65536) {throw 'ADB_OUTPUT_LIMIT'}
  return [pscustomobject]@{Code=$process.ExitCode;Bytes=$memory.ToArray();StderrBytes=$diagnostic.Length}
 }finally{$memory.Dispose();$process.Dispose()}
}
function RequireAdb([string[]]$argv) {
 $r=Adb $argv
 if($r.Code -ne 0){throw ('ADB_EXIT_'+$r.Code)}
 return $r
}
function TextAdb([string[]]$argv) {
 $r=RequireAdb $argv
 return (Decode $r.Bytes).Trim()
}
function VerifyReport {
 $report=(RequireAdb @('-d','exec-out','run-as',$pkg,'cat','files/paseka-fileproof329.ndjson')).Bytes
 if($report.Length -ne 466 -or (Sha256 $report) -cne $expectedReport){
  throw 'PREVIOUS_PHONE_PASS_REPORT_CHANGED'
 }
 $body=Decode $report
 # Native bridge has been observed to append literal slash-n as the trailing delimiter.
 $literal=[string][char]92+'n'
 if($body.EndsWith($literal)){$body=$body.Substring(0,$body.Length-$literal.Length)}
 $body=$body.Trim([char[]]@([char]13,[char]10))
 try{$x=ConvertFrom-Json -InputObject $body -ErrorAction Stop}
 catch{throw 'PREVIOUS_PHONE_PASS_REPORT_NOT_JSON'}
 if($x.status -cne 'PASS' -or $x.phase -cne 'FILE_READBACK_PASS' -or
   $x.packageId -cne $pkg -or $x.videoCount -ne 2 -or
   $x.archiveBytes -ne 3158 -or $x.archiveSha256 -cne $expectedArchive -or
   $x.sourceSha256[0] -cne $expectedVideo[0] -or
   $x.sourceSha256[1] -cne $expectedVideo[1] -or
   $x.recognitionSucceeded -ne $false -or $x.cleanupAuthorized -ne $false){
  throw 'PREVIOUS_PHONE_PASS_REPORT_FIELDS_INVALID'
 }
 return $true
}
function OnlySyntheticFile {
 $output=TextAdb @('-d','shell','ls','-1',$directory)
 $names=@($output -split '[\r\n]+' | Where-Object {$_.Length -gt 0})
 if($names.Count -ne 1) {throw 'ISOLATED_FOLDER_EXACTLY_ONE_FILE_REQUIRED'}
 $name=$names[0]
 if($name -cnotmatch '^paseka-proof329-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.paseka$'){
  throw 'TEST_FILE_NAME_INVALID'
 }
 return ($directory+'/'+$name)
}
function VerifyArchiveFile([string]$file) {
 $r=RequireAdb @('-d','exec-out','cat',$file)
 if($r.Bytes.Length -ne 3158){throw 'EXTERNAL_ARCHIVE_LENGTH_MISMATCH'}
 if((Sha256 $r.Bytes) -cne $expectedArchive){throw 'EXTERNAL_ARCHIVE_SHA256_MISMATCH'}
 if((Decode $r.Bytes[0..7]) -cne 'PASEKA01'){throw 'EXTERNAL_ARCHIVE_MAGIC_INVALID'}
 return $true
}
try{
 $devices=TextAdb @('devices','-l')
 $authorized=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device\s+'})
 $unauthorized=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)\b'})
 if($authorized.Count -ne 1 -or $unauthorized.Count -gt 0){throw 'ONE_AUTHORIZED_USB_DEVICE_REQUIRED'}
 if((TextAdb @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
   (TextAdb @('-d','shell','getprop','ro.build.version.sdk')) -cne '36'){
   throw 'EXPECTED_NE2213_API36'
 }
 if((TextAdb @('-d','shell','pm','path',$pkg)) -notmatch '^package:'){
   throw 'EXISTING_FILEPROOF329_REQUIRED'
 }
 Write-Host 'DEVICE: NE2213 / API36'
 Write-Host 'PACKAGE: EXISTING_FILEPROOF329 | NO_INSTALL_OR_RESET'
 $null=VerifyReport
 Write-Host 'PREVIOUS_PHONE_PASS_REPORT: SHA256_VERIFIED'
 $file=OnlySyntheticFile
 $null=VerifyArchiveFile $file
 Write-Host 'EXTERNAL_FILE_BEFORE_STOP: SHA256_PASS'
 # Stop ONLY this standalone synthetic test app after both independent read-only preflights.
 $null=TextAdb @('-d','shell','am','force-stop',$pkg)
 Write-Host 'FILEPROOF329_ONLY: FORCE_STOP_DONE'
 $null=VerifyArchiveFile $file
 Write-Host 'EXTERNAL_FILE_AFTER_STOP: SHA256_PASS'
 $null=VerifyReport
 Write-Host 'PRIVATE_REPORT_AFTER_STOP: UNCHANGED'
 Write-Host 'ARCHIVE_BYTES: 3158'
 Write-Host ('ARCHIVE_SHA256: '+$expectedArchive)
 Write-Host ('SOURCE_1_SHA256: '+$expectedVideo[0])
 Write-Host ('SOURCE_2_SHA256: '+$expectedVideo[1])
 Write-Host 'RESTORE_COMMIT: NOT_TESTED'
 Write-Host 'MP4_DECODER: NOT_TESTED'
 Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
 Write-Host 'STATUS: ISOLATED_FILEPROOF329_POST_STOP_EXTERNAL_SHA_PASS'
}catch{
 Write-Host 'STATUS: BLOCKED'
 Write-Host ('DETAIL: '+$_.Exception.Message)
 Write-Host 'NO_DELETE_NO_RESET_NO_INSTALL_NO_RESTORE'
 exit 2
}
