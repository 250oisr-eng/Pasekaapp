# One-shot exclusive-create file staging using *only* the explicitly staged modern Google adb.exe.
# Creates exactly one test-package-private files directory and one archive file; never installs, launches, restores, overwrites or deletes.
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
  Write-Host 'STAGE: 4/6 PINNED_RUN_AS_DIRECTORY_PRECHECK'
  # Earlier physical audit showed files/ absent; do not reuse an existing dir
  # because it may hold someone else's data, including an old archive/report.
  $cwd=Text @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','pwd')
  if($cwd -cne ('/data/user/0/'+$pkg)){throw 'RUN_AS_CWD_NOT_PINNED'}
  # A plain mkdir, not mkdir -p, ensures we fail on any existing directory.
  Write-Host 'STAGE: 5/6 EXCLUSIVE_CREATE_IN_EXISTING_TEST_PACKAGE_ONLY'
  $dir=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','mkdir','-m','700','files')
  if($dir.Code -ne 0 -or $dir.Bytes.Length -ne 0 -or
     -not [string]::IsNullOrWhiteSpace($dir.ErrorText)){
    throw 'TEST_PRIVATE_FILES_DIRECTORY_ALREADY_EXISTS_OR_UNCERTAIN'
  }
  # Android Toybox dd conv=excl uses O_EXCL to refuse overwriting any file.
  # The parent directory was created in the prior step, never reused.
  # stdin has a verified length/SHA; dd reads to EOF and flushes.
  $send=ADB @('-d','shell','-T','run-as',$pkg,'/system/bin/toybox','dd',
    'of=files/fileproof335-input.paseka','bs=3158','conv=excl,fsync','status=none') $archive.Bytes
  if($send.Code -ne 0 -or $send.Bytes.Length -ne 0 -or
     -not [string]::IsNullOrWhiteSpace($send.ErrorText)){
    throw 'EXCLUSIVE_TEST_PRIVATE_INPUT_STAGE_FAILED'
  }
  Write-Host 'STAGE: 6/6 READBACK_AND_ORIGINAL_SOURCE_RECHECK'
  $copy=ADB @('-d','exec-out','run-as',$pkg,'/system/bin/toybox','cat',
    'files/fileproof335-input.paseka')
  if($copy.Code -ne 0 -or $copy.Bytes.Length -ne 3158 -or
     (Digest $copy.Bytes) -cne $pinned){throw 'EXCLUSIVE_TEST_INPUT_READBACK_SHA_FAILED'}
  Write-Host 'PRIVATE_TEST_INPUT: SHA256_PASS_3158_BYTES'
  $again=ADB @('-d','exec-out','cat',$source)
  if($again.Code -ne 0 -or $again.Bytes.Length -ne 3158 -or
    (Digest $again.Bytes) -cne $pinned){throw 'ORIGINAL_SOURCE_POST_STAGE_SHA_FAILED'}
  Write-Host 'ORIGINAL_SOURCE_POST_STAGE: SHA256_PASS_3158_BYTES'
  Write-Host 'TEST_PACKAGE_ONLY: ru.paseka.journal.archive.restoreproof335'
  Write-Host 'TEST_PRIVATE_FILE: files/fileproof335-input.paseka'
  Write-Host 'OLD_ADB_AND_SYSTEM_PATH: UNCHANGED'
  Write-Host 'OTHER_PACKAGES: NOT_MODIFIED'
  Write-Host 'RESTORE_COMMIT: NOT_TESTED'
  Write-Host 'MP4_DECODER_AND_RECOGNITION: NOT_TESTED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'STATUS: RESTORE335_PRIVATE_INPUT_EXCLUSIVE_STAGE_PASS'
}catch{
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'ONE_SHOT_NO_RETRY_NO_INSTALL_NO_OVERWRITE_NO_RESET_NO_DELETE'
  exit 2
}
