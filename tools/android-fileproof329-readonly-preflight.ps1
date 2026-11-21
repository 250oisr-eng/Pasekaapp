# Read-only physical archive preflight on ONE known synthetic file in Android Downloads.
# No install, stop, relaunch, restore, delete, or disk writes (including on PC).
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$pkg='ru.paseka.journal.archive.fileproof329'
$folder='/sdcard/Download/PasekaProof329'
$expectedFileSha='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
$expectedReportSha='002fbc37d6627e1412f95ad68946388dceeb257fda55b51b8df62b7ba3886ac4'
$videoIds=@('android-proof-black','android-proof-white')
$videoSha=@('794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
            'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff')
$utf8=New-Object System.Text.UTF8Encoding($false,$true)
function Sha([byte[]]$bytes) {
  $h=[Security.Cryptography.SHA256]::Create()
  try { [BitConverter]::ToString($h.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() }
  finally { $h.Dispose() }
}
function Slice([byte[]]$bytes,[int]$offset,[int]$length) {
  if($offset -lt 0 -or $length -lt 0 -or ([long]$offset+$length) -gt $bytes.Length) {throw 'ENTRY_BOUNDS_INVALID'}
  $result=New-Object byte[] $length
  [Array]::Copy($bytes,$offset,$result,0,$length)
  return ,$result
}
function Text([byte[]]$bytes) { return $utf8.GetString($bytes) }
function Adb([string[]]$args) {
  $exe=(Get-Command adb -CommandType Application -ErrorAction Stop).Source
  $p=New-Object System.Diagnostics.ProcessStartInfo
  $p.FileName=$exe
  $p.Arguments=$args -join ' '
  $p.UseShellExecute=$false
  $p.CreateNoWindow=$true
  $p.RedirectStandardOutput=$true
  $p.RedirectStandardError=$true
  $proc=New-Object System.Diagnostics.Process
  $proc.StartInfo=$p
  $stream=New-Object System.IO.MemoryStream
  try {
    if(-not $proc.Start()) {throw 'ADB_START_FAILED'}
    $proc.StandardOutput.BaseStream.CopyTo($stream)
    $diagnostic=$proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    if($proc.ExitCode -ne 0) {throw ('ADB_EXIT_'+$proc.ExitCode)}
    if($stream.Length -gt 65536 -and -not ($args -contains 'cat')) {throw 'ADB_TEXT_OUTPUT_TOO_LONG'}
    if($stream.Length -gt 1048576) {throw 'ADB_BINARY_OUTPUT_TOO_LONG'}
    return ,$stream.ToArray()
  }finally { $stream.Dispose();$proc.Dispose() }
}
function AdbText([string[]]$args) { return (Text (Adb $args)).Trim() }
try {
  $devices=AdbText @('devices','-l')
  $ready=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device\s+'})
  $bad=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)\b'})
  if($ready.Count -ne 1 -or $bad.Count -ne 0){throw 'ONE_AUTHORIZED_USB_DEVICE_REQUIRED'}
  if((AdbText @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
     (AdbText @('-d','shell','getprop','ro.build.version.sdk')) -cne '36') {throw 'EXPECTED_NE2213_API36'}
  if((AdbText @('-d','shell','pm','path',$pkg)) -notmatch '^package:') {throw 'EXISTING_FILEPROOF329_REQUIRED'}
  $report=Adb @('-d','exec-out','run-as',$pkg,'cat','files/paseka-fileproof329.ndjson')
  if($report.Length -ne 466 -or (Sha $report) -cne $expectedReportSha) {throw 'PRIVATE_REPORT_SHA_CHANGED'}
  $names=@((AdbText @('-d','shell','ls','-1',$folder)) -split '[\r\n]+' | Where-Object {$_ -ne ''})
  if($names.Count -ne 1 -or $names[0] -cnotmatch '^paseka-proof329-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.paseka$') {
    throw 'ONLY_ONE_PINNED_SYNTHETIC_ARCHIVE_REQUIRED'
  }
  $bytes=Adb @('-d','exec-out','cat',($folder+'/'+$names[0]))
  if($bytes.Length -ne 3158 -or (Sha $bytes) -cne $expectedFileSha) {throw 'ARCHIVE_SIZE_OR_SHA_CHANGED'}
  if((Text (Slice $bytes 0 8)) -cne 'PASEKA01') {throw 'INVALID_ARCHIVE_MAGIC'}
  $length=[BitConverter]::ToUInt32($bytes,8)
  if($length -lt 2 -or $length -gt 4096 -or (12+$length) -gt $bytes.Length){throw 'INVALID_MANIFEST_LENGTH'}
  $manifest=(Text (Slice $bytes 12 ([int]$length))) | ConvertFrom-Json -ErrorAction Stop
  if($manifest.format -cne 'paseka-archive' -or $manifest.version -ne 1 -or
     $manifest.schemaVersion -ne 15 -or @($manifest.entries).Count -ne 3){throw 'INVALID_MANIFEST'}
  $offset=12+[int]$length
  $state=$null
  for($i=0;$i -lt 3;$i++){
    $entry=$manifest.entries[$i]
    $size=[long]$entry.size
    if($size -lt 1 -or $size -gt 1048576 -or $entry.chunkSize -ne 1048576 -or
       @($entry.chunkSha256).Count -ne 1){throw 'ENTRY_METADATA_INVALID'}
    $payload=Slice $bytes $offset ([int]$size)
    if((Sha $payload) -cne [string]$entry.chunkSha256[0]) {throw 'ENTRY_CHUNK_SHA_MISMATCH'}
    if($i -eq 0) {
      if($entry.path -cne 'state.json' -or $entry.kind -cne 'state' -or
         $entry.mimeType -cne 'application/json'){throw 'STATE_ENTRY_INVALID'}
      $wrapper=(Text $payload) | ConvertFrom-Json -ErrorAction Stop
      if($wrapper.app -cne 'Paseka' -or $wrapper.state.meta.schemaVersion -ne 15 -or
         @($wrapper.state.hives).Count -ne 1){throw 'STATE_WRAPPER_INVALID'}
      $state=$wrapper.state
    } else {
      $index=$i-1
      if($entry.kind -cne 'entrance_video' -or
         $entry.path -cne ('entrance-media/'+$i.ToString('000000')+'.blob') -or
         $entry.mimeType -cne 'video/mp4' -or $size -ne 893 -or
         $entry.metadata.mimeType -cne 'video/mp4' -or
         $entry.metadata.id -cne $videoIds[$index] -or
         $entry.metadata.bytes -ne 893 -or
         $entry.metadata.hiveId -cne $state.hives[0].id -or
         (Sha $payload) -cne $videoSha[$index]) {throw 'VIDEO_METADATA_OR_SHA_INVALID'}
    }
    $offset+=[int]$size
  }
  if($offset -ne $bytes.Length) {throw 'ARCHIVE_TRAILING_OR_MISSING_BYTES'}
  Write-Host 'DEVICE: NE2213 / API36'
  Write-Host 'EXISTING_SYNTHETIC_PACKAGE: VERIFIED'
  Write-Host 'PRIVATE_REPORT: SHA256_PASS'
  Write-Host 'EXTERNAL_ARCHIVE: SHA256_PASS'
  Write-Host 'PASEKA01_MANIFEST: PASS'
  Write-Host 'STATE_SCHEMA_AND_HIVE: PASS'
  Write-Host 'VIDEO_1_SHA256: PASS'
  Write-Host 'VIDEO_2_SHA256: PASS'
  Write-Host 'RESTORE_COMMIT: NOT_TESTED'
  Write-Host 'MP4_DECODER: NOT_TESTED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'STATUS: FILEPROOF329_ANDROID_READONLY_PREFLIGHT_PASS'
}catch{
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'NO_INSTALL_NO_RESET_NO_STOP_NO_RESTORE_NO_DELETE'
  exit 2
}
