# Read-only Toybox dd parser check after failed exclusive stage; ADB pinned to known modern executable.
# Probes dd only with if=/dev/null and count=0 (no of=, no archive stdin), never writes to device.
[CmdletBinding()]
param(
  [string]$AdbPath='C:\Users\n12D8\AppData\Local\Temp\paseka-offline-platformtools-43f92107c17d47d7a2853a42348efe9b\platform-tools\adb.exe'
)
$ErrorActionPreference='Stop'
$pkg='ru.paseka.journal.archive.restoreproof335'
$old='ru.paseka.journal.archive.fileproof329'
$source='/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka'
$pinned='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
$adbPinned='bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee'
$utf8=New-Object System.Text.UTF8Encoding($false,$true)
function Digest([byte[]]$bytes){
  $h=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($h.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}
  finally{$h.Dispose()}
}
function ADB([string[]]$argv,[byte[]]$send=$null){
  $start=New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName=$script:AdbPath
  $start.Arguments=$argv -join ' '
  $start.UseShellExecute=$false
  $start.CreateNoWindow=$true
  $start.RedirectStandardInput=$true
  $start.RedirectStandardOutput=$true
  $start.RedirectStandardError=$true
  $p=New-Object System.Diagnostics.Process
  $p.StartInfo=$start
  $out=New-Object System.IO.MemoryStream
  try {
    if(-not $p.Start()){throw 'ADB_START_FAILED'}
    $readOut=$p.StandardOutput.BaseStream.CopyToAsync($out)
    $readErr=$p.StandardError.ReadToEndAsync()
    if($null -ne $send -and $send.Length -gt 0){
      $p.StandardInput.BaseStream.Write($send,0,$send.Length)
    }
    $p.StandardInput.Close()
    if(-not $p.WaitForExit(12000)){
      try{$p.Kill()}catch{}
      [void]$p.WaitForExit(2000)
      throw 'ADB_TIMEOUT_12S'
    }
    [void]$readOut.GetAwaiter().GetResult()
    $err=$readErr.GetAwaiter().GetResult()
    if($out.Length -gt 8192){throw 'ADB_OUTPUT_TOO_LARGE'}
    return [pscustomobject]@{Code=$p.ExitCode;Bytes=$out.ToArray();ErrorText=$err}
  } finally {$out.Dispose();$p.Dispose()}
}
function Text([string[]]$argv){
  $r=ADB $argv
  if($r.Code -ne 0){throw 'ADB_PRECHECK_FAILED'}
  return $utf8.GetString($r.Bytes).Trim()
}
try{
  Write-Host 'STAGE: 1/5 PINNED_MODERN_ADB'
  if(-not (Test-Path -LiteralPath $AdbPath -PathType Leaf)){throw 'PINNED_MODERN_ADB_NOT_FOUND'}
  $hash=(Get-FileHash -LiteralPath $AdbPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($hash -cne $adbPinned){throw 'PINNED_ADB_SHA256_MISMATCH'}
  $version=Text @('version')
  $line=($version -split '[\r\n]+')[0].Trim()
  if($line -notmatch '^Android Debug Bridge version 1[.]0[.](\d+)$'){throw 'ADB_VERSION_INVALID'}
  if([int]$Matches[1] -lt 41){throw 'ADB_VERSION_TOO_OLD'}
  Write-Host ('HOST_ADB_VERSION: '+$line)
  Write-Host 'ADB_EXE_SHA256: PASS_PINNED'
  Write-Host 'STAGE: 2/5 DEVICE_AND_EXISTING_TEST_PACKAGES'
  $devices=Text @('devices','-l')
  $ready=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device\s+'})
  $bad=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)\b'})
  if($ready.Count -ne 1 -or $bad.Count -ne 0){throw 'ONE_AUTHORIZED_DEVICE_REQUIRED'}
  if((Text @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
     (Text @('-d','shell','getprop','ro.build.version.sdk')) -cne '36'){throw 'EXPECTED_NE2213_API36'}
  if((Text @('-d','shell','pm','path',$pkg)) -notmatch '^package:' -or
     (Text @('-d','shell','pm','path',$old)) -notmatch '^package:'){throw 'BOTH_EXISTING_TEST_PACKAGES_REQUIRED'}
  Write-Host 'STAGE: 3/5 ORIGINAL_ARCHIVE_IN_MEMORY_SHA'
  $archive=ADB @('-d','exec-out','cat',$source)
  if($archive.Code -ne 0 -or $archive.Bytes.Length -ne 3158 -or (Digest $archive.Bytes) -cne $pinned){
    throw 'ORIGINAL_PINNED_SHA_FAILED'
  }
  Write-Host 'ORIGINAL_ARCHIVE: SHA256_PASS_3158_BYTES'
  Write-Host 'STAGE: 4/5 DD_ZERO_COUNT_NO_FILE_OPTION_PARSE'
  $cwd=Text @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','pwd')
  if($cwd -cne ('/data/user/0/'+$pkg)){throw 'RUN_AS_CWD_NOT_PINNED'}
  $dir=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','stat','-c','%F','files')
  if($dir.Code -ne 0 -or -not [string]::IsNullOrWhiteSpace($dir.ErrorText) -or
     $utf8.GetString($dir.Bytes).Trim() -cne 'directory'){throw 'PRIVATE_DIRECTORY_TYPE_NOT_CONFIRMED'}
  Write-Host 'PRIVATE_FILES_DIRECTORY: PRESENT'
  # We never print arbitrary output or file names. Read-only empty inventory.
  $inventory=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','ls','-A','files')
  if($inventory.Code -ne 0 -or $inventory.Bytes.Length -ne 0 -or
     -not [string]::IsNullOrWhiteSpace($inventory.ErrorText)){
    throw 'PRIVATE_FILES_NOT_CONFIRMED_EMPTY'
  }
  Write-Host 'PRIVATE_FILES_LIST_CLASS: EMPTY'
  $stat=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','stat','-c','%F',
    'files/fileproof335-input.paseka')
  $statText=($utf8.GetString($stat.Bytes)+' '+$stat.ErrorText).Trim()
  Write-Host ('PRIVATE_INPUT_STAT_STDOUT_BYTES: '+$stat.Bytes.Length)
  # Accept one path-specific ENOENT diagnostic, including Toybox's exit-zero stdout form.
  $missingInput = '^stat: (?:can''t stat |cannot stat )?[''"]?files/fileproof335-input[.]paseka[''"]?: No such file or directory$'
  if($stat.Code -in @(0,1) -and $statText -cmatch $missingInput){
    Write-Host 'PRIVATE_INPUT_STAT_DIAGNOSTIC: NO_SUCH_FILE'
  }elseif($statText -match '(?i)(permission denied|access denied)'){
    Write-Host 'PRIVATE_INPUT_STAT_DIAGNOSTIC: ACCESS_DENIED'
    throw 'PRIVATE_INPUT_ABSENCE_NOT_CONFIRMED'
  }else{
    Write-Host 'PRIVATE_INPUT_STAT_DIAGNOSTIC: UNRECOGNIZED'
    throw 'PRIVATE_INPUT_ABSENCE_NOT_CONFIRMED'
  }
  $help=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','dd','--help')
  $helpText=($utf8.GetString($help.Bytes)+' '+$help.ErrorText)
  Write-Host ('DD_HELP_MENTIONS_CONV_EXCL: '+($helpText -match '\bexcl\b'))
  # count=0 prevents copying; input is /dev/null; output is default stdout.
  # No of=, no fsync, no archive bytes sent, no device filesystem modifications.
  $baseline=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','dd',
    'if=/dev/null','count=0','status=none')
  Write-Host ('DD_BASELINE_EXIT_CODE: '+$baseline.Code)
  Write-Host ('DD_BASELINE_STDOUT_BYTES: '+$baseline.Bytes.Length)
  if($baseline.Code -ne 0 -or $baseline.Bytes.Length -ne 0 -or
    -not [string]::IsNullOrWhiteSpace($baseline.ErrorText)){
    throw 'DD_ZERO_COUNT_BASELINE_INVALID'
  }
  $excl=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','dd',
    'if=/dev/null','count=0','conv=excl','status=none')
  Write-Host ('DD_CONV_EXCL_EXIT_CODE: '+$excl.Code)
  Write-Host ('DD_CONV_EXCL_STDOUT_BYTES: '+$excl.Bytes.Length)
  Write-Host ('DD_CONV_EXCL_STDERR_BYTES: '+$utf8.GetByteCount([string]$excl.ErrorText))
  $message=($utf8.GetString($excl.Bytes)+' '+$excl.ErrorText).Trim()
  if($message -match '(?i)\bbad\s+conv(?:=|\s+)[\w,]*excl\b'){
    Write-Host 'DD_CONV_EXCL_ARGUMENT: REJECTED_BY_PARSER'
  }elseif($excl.Code -eq 0 -and $excl.Bytes.Length -eq 0 -and
          [string]::IsNullOrWhiteSpace($excl.ErrorText)){
    Write-Host 'DD_CONV_EXCL_ARGUMENT: ACCEPTED_FOR_ZERO_COUNT'
  }else{
    Write-Host 'DD_CONV_EXCL_ARGUMENT: UNVERIFIED'
  }
  Write-Host 'STAGE: 5/5 ORIGINAL_SOURCE_RECHECK'
  $recheck=ADB @('-d','exec-out','cat',$source)
  if($recheck.Code -ne 0 -or $recheck.Bytes.Length -ne 3158 -or
     (Digest $recheck.Bytes) -cne $pinned){throw 'ORIGINAL_SOURCE_CHANGED'}
  Write-Host 'ORIGINAL_SOURCE_POST_PROBE: SHA256_PASS_3158_BYTES'
  Write-Host 'ANDROID_PRIVATE_WRITE: NOT_ATTEMPTED'
  Write-Host 'RESTORE_COMMIT: NOT_TESTED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'STATUS: RESTORE335_DD_ZERO_COUNT_PARSER_READONLY_COMPLETE'
}catch{
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'NO_INSTALL_NO_WRITE_NO_LAUNCH_NO_RESET_NO_DELETE'
  exit 2
}
