# Read-only recovery forensics v2 after one-shot dd failed; no operation from this script writes Android using *only* the explicitly staged modern Google adb.exe.
# Does not create, modify, delete, install, restore, launch apps or stream file bytes to Android.
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
  Write-Host 'STAGE: 1/6 PINNED_MODERN_ADB'
  if(-not (Test-Path -LiteralPath $AdbPath -PathType Leaf)){throw 'PINNED_MODERN_ADB_NOT_FOUND'}
  $hash=(Get-FileHash -LiteralPath $AdbPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($hash -cne $adbPinned){throw 'PINNED_ADB_SHA256_MISMATCH'}
  $version=Text @('version')
  $line=($version -split '[\r\n]+')[0].Trim()
  if($line -notmatch '^Android Debug Bridge version 1[.]0[.](\d+)$'){throw 'ADB_VERSION_INVALID'}
  if([int]$Matches[1] -lt 41){throw 'ADB_VERSION_TOO_OLD'}
  Write-Host ('HOST_ADB_VERSION: '+$line)
  Write-Host 'ADB_EXE_SHA256: PASS_PINNED'
  Write-Host 'STAGE: 2/6 DEVICE_AND_EXISTING_TEST_PACKAGES'
  $devices=Text @('devices','-l')
  $ready=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device\s+'})
  $bad=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)\b'})
  if($ready.Count -ne 1 -or $bad.Count -ne 0){throw 'ONE_AUTHORIZED_DEVICE_REQUIRED'}
  if((Text @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
     (Text @('-d','shell','getprop','ro.build.version.sdk')) -cne '36'){throw 'EXPECTED_NE2213_API36'}
  if((Text @('-d','shell','pm','path',$pkg)) -notmatch '^package:' -or
     (Text @('-d','shell','pm','path',$old)) -notmatch '^package:'){throw 'BOTH_EXISTING_TEST_PACKAGES_REQUIRED'}
  Write-Host 'STAGE: 3/6 ORIGINAL_ARCHIVE_IN_MEMORY_SHA'
  $archive=ADB @('-d','exec-out','cat',$source)
  if($archive.Code -ne 0 -or $archive.Bytes.Length -ne 3158 -or (Digest $archive.Bytes) -cne $pinned){
    throw 'ORIGINAL_PINNED_SHA_FAILED'
  }
  Write-Host 'ORIGINAL_ARCHIVE: SHA256_PASS_3158_BYTES'
  Write-Host 'STAGE: 4/6 PRIVATE_TEST_PACKAGE_FILE_INVENTORY_READONLY'
  $cwd=Text @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','pwd')
  if($cwd -cne ('/data/user/0/'+$pkg)){throw 'RUN_AS_CWD_NOT_PINNED'}
  $path='files/fileproof335-input.paseka'
  # stat (without -L) doesn't dereference symlinks. Diagnose errors, not data.
  $dir=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','stat','-c','%F','files')
  $dirType=$utf8.GetString($dir.Bytes).Trim()
  if($dir.Code -ne 0 -or -not [string]::IsNullOrWhiteSpace($dir.ErrorText) -or
     $dirType -cne 'directory'){throw 'PRIVATE_DIRECTORY_TYPE_NOT_CONFIRMED'}
  Write-Host 'PRIVATE_FILES_DIRECTORY: PRESENT'
  $kind=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','stat','-c','%F',$path)
  $kindName=$utf8.GetString($kind.Bytes).Trim()
  Write-Host ('PRIVATE_INPUT_STAT_EXIT_CODE: '+$kind.Code)
  Write-Host ('PRIVATE_INPUT_STAT_STDOUT_BYTES: '+$kind.Bytes.Length)
  Write-Host ('PRIVATE_INPUT_STAT_STDERR_BYTES: '+$utf8.GetByteCount([string]$kind.ErrorText))
  $statMessage=($kindName+' '+$kind.ErrorText)
  if($kind.Code -ne 0){
    if($statMessage -match '(?i)(no such file or directory|not found)'){
      Write-Host 'PRIVATE_INPUT_STAT_ERROR_CLASS: NO_SUCH_FILE'
    }elseif($statMessage -match '(?i)(permission denied|access denied)'){
      Write-Host 'PRIVATE_INPUT_STAT_ERROR_CLASS: ACCESS_DENIED'
    }else{Write-Host 'PRIVATE_INPUT_STAT_ERROR_CLASS: OTHER_OR_UNRECOGNIZED'}
  }elseif(-not [string]::IsNullOrWhiteSpace($kind.ErrorText)){
    Write-Host 'PRIVATE_INPUT_STAT_ERROR_CLASS: STDERR_UNEXPECTED'
  }else{Write-Host 'PRIVATE_INPUT_STAT_ERROR_CLASS: NONE'}
  $reg=($kind.Code -eq 0 -and [string]::IsNullOrWhiteSpace($kind.ErrorText) -and
    $kindName -ceq 'regular file')
  if($reg){
    Write-Host 'PRIVATE_INPUT_FILE_TYPE: REGULAR_FILE'
    $size=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','stat','-c','%s',$path)
    $sizeText=$utf8.GetString($size.Bytes).Trim()
    if($size.Code -ne 0 -or -not [string]::IsNullOrWhiteSpace($size.ErrorText) -or
      $sizeText -notmatch '^[0-9]{1,8}$'){throw 'PRIVATE_FILE_SIZE_UNVERIFIED'}
    $n=[int]$sizeText
    Write-Host ('PRIVATE_INPUT_STAT_BYTES: '+$n)
    if($n -gt 8192){throw 'PRIVATE_FILE_TOO_LARGE_TO_READ_SAFELY'}
    $contents=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','cat',$path)
    if($contents.Code -ne 0 -or -not [string]::IsNullOrWhiteSpace($contents.ErrorText) -or
      $contents.Bytes.Length -ne $n){throw 'PRIVATE_FILE_READBACK_INVALID'}
    $digest=Digest $contents.Bytes
    Write-Host ('PRIVATE_INPUT_READBACK_SHA256: '+$digest)
    if($n -eq 3158 -and $digest -ceq $pinned){
      Write-Host 'PRIVATE_INPUT_STATUS: SHA256_PASS_3158_BYTES'
    }elseif($n -eq 3158){
      Write-Host 'PRIVATE_INPUT_STATUS: SHA_MISMATCH_PRESERVE'
    }else{
      Write-Host 'PRIVATE_INPUT_STATUS: INCOMPLETE_OR_UNEXPECTED_SIZE_PRESERVE'
    }
  }elseif($kind.Code -eq 0 -and [string]::IsNullOrWhiteSpace($kind.ErrorText) -and
           $kindName -match '^(symbolic link|directory|block special file|character special file|fifo|socket)$'){
    Write-Host 'PRIVATE_INPUT_FILE_TYPE: NONREGULAR_PRESERVE'
    Write-Host 'PRIVATE_INPUT_STATUS: BLOCKED_NONREGULAR'
  }else{
    Write-Host 'PRIVATE_INPUT_FILE_TYPE: UNKNOWN_OR_ABSENT'
    Write-Host 'PRIVATE_INPUT_STATUS: UNVERIFIED_PRESERVE'
  }
  # Read-only directory listing with names deliberately NOT disclosed in report.
  $listing=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','ls','-A','files')
  Write-Host ('PRIVATE_FILES_LS_EXIT_CODE: '+$listing.Code)
  if($listing.Code -ne 0 -or -not [string]::IsNullOrWhiteSpace($listing.ErrorText)){
    Write-Host 'PRIVATE_FILES_LIST_CLASS: UNVERIFIED'
  }else{
    $listingText=$utf8.GetString($listing.Bytes).Trim()
    $names=@($listingText -split '[\r\n]+' | Where-Object {$_ -ne ''})
    if($listing.Bytes.Length -eq 0){$names=@()}
    Write-Host ('PRIVATE_FILES_VISIBLE_ENTRY_COUNT: '+$names.Count)
    if($names.Count -eq 0){
      Write-Host 'PRIVATE_FILES_LIST_CLASS: EMPTY'
    }elseif($names.Count -eq 1 -and $names[0] -ceq 'fileproof335-input.paseka'){
      Write-Host 'PRIVATE_FILES_LIST_CLASS: ONLY_PINNED_FILE'
    }else{
      Write-Host 'PRIVATE_FILES_LIST_CLASS: OTHER_ENTRIES_PRESERVE'
    }
  }
  # Compare exec-out vs no-PTY shell working directory: reads only, no input.
  $shellCwd=ADB @('-d','shell','-T','run-as',$pkg,'/system/bin/toybox','pwd')
  $shellCwdText=$utf8.GetString($shellCwd.Bytes).Trim()
  if($shellCwd.Code -eq 0 -and [string]::IsNullOrWhiteSpace($shellCwd.ErrorText) -and
     $shellCwdText -ceq $cwd){
    Write-Host 'SHELL_T_RUN_AS_CWD: MATCH'
  }else{
    Write-Host 'SHELL_T_RUN_AS_CWD: UNVERIFIED'
  }
  Write-Host 'STAGE: 5/6 READONLY_PERMISSION_AND_DD_HELP'
  $writable=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','test','-w','files')
  if($writable.Code -eq 0 -and $writable.Bytes.Length -eq 0 -and
     [string]::IsNullOrWhiteSpace($writable.ErrorText)){
    Write-Host 'PRIVATE_DIR_WRITE_PERMISSION_TEST: ALLOWED'
  }elseif($writable.Code -eq 1 -and $writable.Bytes.Length -eq 0){
    Write-Host 'PRIVATE_DIR_WRITE_PERMISSION_TEST: DENIED_OR_UNVERIFIED'
  }else{
    Write-Host 'PRIVATE_DIR_WRITE_PERMISSION_TEST: UNVERIFIED'
  }
  $help=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','dd','--help')
  $helpText=($utf8.GetString($help.Bytes)+' '+$help.ErrorText)
  Write-Host ('DD_HELP_EXIT_CODE: '+$help.Code)
  Write-Host ('DD_HELP_CONV_EXCL_MENTIONED: '+($helpText -match '\bexcl\b'))
  Write-Host ('DD_HELP_CONV_FSYNC_MENTIONED: '+($helpText -match '\bfsync\b'))
  Write-Host ('DD_HELP_STATUS_NONE_MENTIONED: '+($helpText -match '\bnone\b'))
  Write-Host 'STAGE: 6/6 ORIGINAL_SOURCE_RECHECK'
  $recheck=ADB @('-d','exec-out','cat',$source)
  if($recheck.Code -ne 0 -or $recheck.Bytes.Length -ne 3158 -or
    (Digest $recheck.Bytes) -cne $pinned){throw 'ORIGINAL_SOURCE_CHANGED'}
  Write-Host 'ORIGINAL_SOURCE_POST_FAILURE: SHA256_PASS_3158_BYTES'
  Write-Host 'PRIVATE_FILE_MODIFICATION: NOT_ATTEMPTED'
  Write-Host 'RESTORE_COMMIT: NOT_TESTED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'STATUS: RESTORE335_POST_FAILURE_READONLY_AUDIT_V2_COMPLETE'
}catch{
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'NO_INSTALL_NO_WRITE_NO_LAUNCH_NO_RESET_NO_DELETE'
  exit 2
}
