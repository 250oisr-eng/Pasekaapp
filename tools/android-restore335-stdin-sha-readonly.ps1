# Read-only physical USB stdin transport probe. No writes to Android or user data.
# Does NOT repeat restore335 installer, create files, launch apps or restore IndexedDB.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$pkg='ru.paseka.journal.archive.restoreproof335'
$old='ru.paseka.journal.archive.fileproof329'
$source='/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka'
$pinned='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
$utf8=New-Object System.Text.UTF8Encoding($false,$true)
function ADB([string[]]$argv,[byte[]]$send=$null){
  $start=New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName=(Get-Command adb -CommandType Application -ErrorAction Stop).Source
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
function Digest([byte[]]$bytes){
  $h=[Security.Cryptography.SHA256]::Create()
  try {return [BitConverter]::ToString($h.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}
  finally {$h.Dispose()}
}
try {
  Write-Host 'STAGE: 1/3 DEVICE_AND_EXISTING_TEST_PACKAGES'
  $devices=Text @('devices','-l')
  $ready=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device\s+'})
  $bad=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)\b'})
  if($ready.Count -ne 1 -or $bad.Count -ne 0){throw 'ONE_AUTHORIZED_DEVICE_REQUIRED'}
  if((Text @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
     (Text @('-d','shell','getprop','ro.build.version.sdk')) -cne '36'){throw 'EXPECTED_NE2213_API36'}
  if((Text @('-d','shell','pm','path',$pkg)) -notmatch '^package:' -or
     (Text @('-d','shell','pm','path',$old)) -notmatch '^package:'){throw 'BOTH_EXISTING_TEST_PACKAGES_REQUIRED'}
  Write-Host 'STAGE: 2/3 ORIGINAL_ARCHIVE_IN_MEMORY_SHA'
  $archive=ADB @('-d','exec-out','cat',$source)
  if($archive.Code -ne 0 -or $archive.Bytes.Length -ne 3158 -or (Digest $archive.Bytes) -cne $pinned){
    throw 'ORIGINAL_PINNED_SHA_FAILED'
  }
  Write-Host 'ORIGINAL_ARCHIVE: SHA256_PASS_3158_BYTES'
  Write-Host 'STAGE: 3/3 READONLY_STDIN_SHA256_IN_RUN_AS'
  # Bidirectional adb shell -T disables PTY; unlike exec-in, its stdout is captured.
  # Direct absolute toybox binary with explicit stdin operand '-', not sh -c or file redirection.
  # Prior unqualified sha256sum returned 99 diagnostic bytes on real Android.
  # Nothing is written to Android filesystem: sha256sum reads 3158 bytes from stdin.
  $probe=ADB @('-d','shell','-T','run-as',$pkg,'/system/bin/toybox','sha256sum','-') $archive.Bytes

  Write-Host ('REMOTE_EXIT_CODE: '+$probe.Code)
  Write-Host ('REMOTE_STDOUT_BYTES: '+$probe.Bytes.Length)
  Write-Host ('REMOTE_STDOUT_SHA256: '+(Digest $probe.Bytes))
  if($probe.Code -ne 0){throw 'STDIN_SHA256_COMMAND_FAILED'}
  $line=$utf8.GetString($probe.Bytes).Trim()
  if($line -notmatch '^([a-fA-F0-9]{64})\s+\*?-$'){
    if($line -match '^(sha256sum|run-as|/system/bin/sh|sh|error|adb):'){
      Write-Host 'REMOTE_OUTPUT_CLASS: COMMAND_DIAGNOSTIC'
      $safeDiagnostic=($line -replace '[\r\n]+',' ').Trim()
      if($probe.Bytes.Length -le 256 -and $safeDiagnostic.Length -le 240 -and
         $safeDiagnostic -cmatch '^[\x20-\x7E]+){
        Write-Host ('REMOTE_DIAGNOSTIC: '+$safeDiagnostic)
      }else{
        Write-Host 'REMOTE_DIAGNOSTIC: REDACTED'
      }
    }elseif($probe.Bytes.Length -eq 0){
      Write-Host 'REMOTE_OUTPUT_CLASS: EMPTY'
    }else{
      Write-Host 'REMOTE_OUTPUT_CLASS: UNRECOGNIZED'
    }
    throw 'STDIN_SHA256_OUTPUT_INVALID'
  }
  $actual=$Matches[1].ToLowerInvariant()
  if($actual -cne $pinned){throw 'STDIN_SHA256_MISMATCH'}
  Write-Host 'STDIN_TRANSPORT: SHA256_PASS_3158_BYTES'
  Write-Host 'PRIVATE_PATH_WRITE: NOT_ATTEMPTED'
  Write-Host 'RESTORE_COMMIT: NOT_TESTED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'STATUS: RESTORE335_READONLY_STDIN_TRANSPORT_PASS'
}catch{
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'NO_INSTALL_NO_WRITE_NO_LAUNCH_NO_RESET_NO_DELETE'
  exit 2
}
){
        Write-Host ('REMOTE_DIAGNOSTIC: '+$safeDiagnostic)
      }else{
        Write-Host 'REMOTE_DIAGNOSTIC: REDACTED'
      }
    }elseif($probe.Bytes.Length -eq 0){
      Write-Host 'REMOTE_OUTPUT_CLASS: EMPTY'
    }else{
      Write-Host 'REMOTE_OUTPUT_CLASS: UNRECOGNIZED'
    }
    throw 'STDIN_SHA256_OUTPUT_INVALID'
  }
  $actual=$Matches[1].ToLowerInvariant()
  if($actual -cne $pinned){throw 'STDIN_SHA256_MISMATCH'}
  Write-Host 'STDIN_TRANSPORT: SHA256_PASS_3158_BYTES'
  Write-Host 'PRIVATE_PATH_WRITE: NOT_ATTEMPTED'
  Write-Host 'RESTORE_COMMIT: NOT_TESTED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'STATUS: RESTORE335_READONLY_STDIN_TRANSPORT_PASS'
}catch{
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'NO_INSTALL_NO_WRITE_NO_LAUNCH_NO_RESET_NO_DELETE'
  exit 2
}
