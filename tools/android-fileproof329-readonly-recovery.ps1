# READ ONLY recovery for the ALREADY installed fileproof329; never relaunches or writes.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$pkg='ru.paseka.journal.archive.fileproof329'
$expected=@(
 '794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
 'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'
)
function NativeAdb([string[]]$argv) {
 $exe=(Get-Command adb -CommandType Application -ErrorAction Stop).Source
 $info=New-Object System.Diagnostics.ProcessStartInfo
 $info.FileName=$exe
 $info.Arguments=($argv -join ' ')
 $info.UseShellExecute=$false
 $info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true
 $info.RedirectStandardError=$true
 $process=New-Object System.Diagnostics.Process
 $process.StartInfo=$info
 $buffer=New-Object System.IO.MemoryStream
 try{
  if(-not $process.Start()){throw 'ADB_START_FAILED'}
  $process.StandardOutput.BaseStream.CopyTo($buffer)
  $stderr=$process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if($buffer.Length -gt 65536){throw 'ADB_STDOUT_TOO_LARGE'}
  return [pscustomobject]@{Code=$process.ExitCode;Bytes=$buffer.ToArray();StderrBytes=$stderr.Length}
 }finally{$buffer.Dispose();$process.Dispose()}
}
function DecodeUtf8([byte[]]$bytes) {
 $decoder=New-Object System.Text.UTF8Encoding($false,$true)
 return $decoder.GetString($bytes)
}
function RequireAdb([string[]]$argv) {
 $res=NativeAdb $argv
 if($res.Code -ne 0){throw ('ADB_EXIT_'+$res.Code)}
 return (DecodeUtf8 $res.Bytes).Trim()
}
try{
 $devices=RequireAdb @('devices','-l')
 $valid=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device\s+'})
 $other=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(unauthorized|offline|recovery|sideload)\b'})
 if($valid.Count -ne 1 -or $other.Count -ne 0){throw 'ONE_USB_DEVICE_REQUIRED'}
 if((RequireAdb @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
    (RequireAdb @('-d','shell','getprop','ro.build.version.sdk')) -cne '36'){
    throw 'EXPECTED_ONEPLUS_NE2213_ANDROID36'
 }
 if((RequireAdb @('-d','shell','pm','path',$pkg)) -notmatch '^package:'){
   throw 'ALREADY_INSTALLED_FILEPROOF329_REQUIRED'
 }
 Write-Host 'DEVICE: NE2213 / API36'
 Write-Host 'PACKAGE: EXISTING_FILEPROOF329 | READ_ONLY'
 $r=NativeAdb @('-d','exec-out','run-as',$pkg,'cat','files/paseka-fileproof329.ndjson')
 if($r.Code -ne 0){throw ('REPORT_UNREADABLE_ADB_EXIT_'+$r.Code)}
 if($r.Bytes.Length -lt 10 -or $r.Bytes.Length -gt 4096){throw 'REPORT_BYTE_LENGTH_INVALID'}
 $hash=[Security.Cryptography.SHA256]::Create()
 try{$sha=[BitConverter]::ToString($hash.ComputeHash($r.Bytes)).Replace('-','').ToLowerInvariant()}
 finally{$hash.Dispose()}
 Write-Host ('REPORT_BYTES: '+$r.Bytes.Length)
 Write-Host ('REPORT_SHA256: '+$sha)
 # Never return or print an unverified JSON string or user's files.
 $raw=DecodeUtf8 $r.Bytes
 # The Java report bridge may encode line breaks as LF or as literal backslash+n.
 # Remove these delimiters only; never rewrite any JSON field/escape sequence.
 $literal=[string][char]92+'n'
 if($raw.EndsWith($literal)){
   $raw=$raw.Substring(0,$raw.Length-$literal.Length)
 }
 $raw=$raw.Trim([char[]]@([char]10,[char]13,[char]32,[char]9))
 $lines=@($raw -split '[\r\n]+' | Where-Object {$_.Trim()})
 Write-Host ('REPORT_LINES: '+$lines.Count)
 if($lines.Count -ne 1){throw 'REPORT_EXPECTED_EXACTLY_ONE_RESULT'}
 try{$record=ConvertFrom-Json -InputObject $lines[0] -ErrorAction Stop}
 catch{
  $prefix=[Text.Encoding]::UTF8.GetBytes($lines[0].Substring(0,[Math]::Min(32,$lines[0].Length)))
  Write-Host ('JSON_PREFIX_HEX: '+[BitConverter]::ToString($prefix).Replace('-',''))
  throw 'PROOF_JSON_INVALID_DIAGNOSTIC'
 }
 if($record.proofVersion -ne 1 -or
    $record.cleanupAuthorized -ne $false -or
    $record.recognitionSucceeded -ne $false){
   throw 'REPORT_VERSION_OR_CLEANUP_GUARD_INVALID'
 }
 Write-Host ('REPORT_STATUS: '+[string]$record.status)
 if($record.status -ceq 'BLOCKED'){
   $code=[string]$record.code
   if($code -cnotmatch '^[a-zA-Z0-9_:-]{1,90}$'){$code='UNVERIFIED_APP_CODE'}
   throw ('APP_PROOF_BLOCKED_'+$code)
 }
 if($record.status -cne 'PASS' -or
    $record.phase -cne 'FILE_READBACK_PASS' -or
    $record.packageId -cne $pkg -or
    $record.videoCount -ne 2 -or
    $record.uriType -cne 'content-uri' -or
    $record.archiveBytes -lt 1000 -or
    $record.archiveBytes -gt 1048576 -or
    $record.archiveSha256 -cnotmatch '^[a-f0-9]{64}$' -or
    @($record.sourceSha256).Count -ne 2 -or
    $record.sourceSha256[0] -cne $expected[0] -or
    $record.sourceSha256[1] -cne $expected[1]){
   throw 'REPORT_FIELDS_OR_PINNED_VIDEO_HASHES_INVALID'
 }
 Write-Host ('ARCHIVE_BYTES: '+$record.archiveBytes)
 Write-Host ('ARCHIVE_SHA256: '+$record.archiveSha256)
 Write-Host ('SOURCE_1_SHA256: '+$record.sourceSha256[0])
 Write-Host ('SOURCE_2_SHA256: '+$record.sourceSha256[1])
 Write-Host 'MEDIASTORE_WRITE_READBACK: VERIFIED_BY_EXISTING_APP_REPORT'
 Write-Host 'PERSISTED_FILE_POST_RESTART: NOT_TESTED'
 Write-Host 'RESTORE_COMMIT_AND_MP4_PLAYBACK: NOT_TESTED'
 Write-Host 'VIDEO_RECOGNITION_AND_CLEANUP: NOT_AUTHORIZED'
 Write-Host 'STATUS: ISOLATED_FILEPROOF329_MEDIASTORE_PASS'
}catch{
 Write-Host 'STATUS: BLOCKED'
 Write-Host ('DETAIL: '+$_.Exception.Message)
 Write-Host 'NO_ANDROID_WRITES_STOPS_UNINSTALL_CLEAR_OR_DELETE'
 exit 2
}
