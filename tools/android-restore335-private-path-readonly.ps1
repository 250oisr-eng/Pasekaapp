# Read-only test-only Android package path audit. No source, media, or user data writes.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$pkg='ru.paseka.journal.archive.restoreproof335'
$old='ru.paseka.journal.archive.fileproof329'
$source='/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka'
$pinned='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
$utf8=New-Object System.Text.UTF8Encoding($false,$true)
function Adb([string[]]$argv) {
  $start=New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName=(Get-Command adb -CommandType Application -ErrorAction Stop).Source
  $start.Arguments=$argv -join ' '
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $proc=New-Object System.Diagnostics.Process
  $proc.StartInfo=$start
  $bytes=New-Object System.IO.MemoryStream
  try {
    if(-not $proc.Start()){throw 'ADB_START_FAILED'}
    $outTask=$proc.StandardOutput.BaseStream.CopyToAsync($bytes)
    $errTask=$proc.StandardError.ReadToEndAsync()
    if(-not $proc.WaitForExit(12000)){
      try{$proc.Kill()}catch{}
      [void]$proc.WaitForExit(2000)
      throw 'ADB_TIMEOUT_12S'
    }
    [void]$outTask.GetAwaiter().GetResult()
    $errorText=$errTask.GetAwaiter().GetResult()
    if($bytes.Length -gt 8192 -and -not ($argv -contains $source)){throw 'ADB_TEXT_TOO_LONG'}
    return [pscustomobject]@{Code=$proc.ExitCode;Bytes=$bytes.ToArray();ErrorText=$errorText}
  } finally {$bytes.Dispose();$proc.Dispose()}
}
function Text([string[]]$argv) {
  $result=Adb $argv
  if($result.Code -ne 0){throw ('ADB_PRECHECK_EXIT_'+$result.Code)}
  return $utf8.GetString($result.Bytes).Trim()
}
function Sha([byte[]]$bytes) {
  $h=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($h.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}
  finally{$h.Dispose()}
}
function SafeLine([string]$value){
  $clean=($value -replace '[\r\n]+',' ' -replace '[^a-zA-Z0-9_./: -]','?')
  if($clean.Length -gt 200){$clean=$clean.Substring(0,200)}
  return $clean
}
try {
  Write-Host 'STAGE: 1/3 DEVICE_AND_PACKAGES'
  $devices=Text @('devices','-l')
  $ok=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device\s+'})
  $bad=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(unauthorized|offline|recovery|sideload)\b'})
  if($ok.Count -ne 1 -or $bad.Count -ne 0){throw 'ONE_AUTHORIZED_DEVICE_REQUIRED'}
  if((Text @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
     (Text @('-d','shell','getprop','ro.build.version.sdk')) -cne '36'){throw 'EXPECTED_NE2213_API36'}
  if((Text @('-d','shell','pm','path',$pkg)) -notmatch '^package:' -or
     (Text @('-d','shell','pm','path',$old)) -notmatch '^package:'){throw 'BOTH_TEST_PACKAGES_REQUIRED'}
  Write-Host 'STAGE: 2/3 PINNED_EXTERNAL_ORIGINAL'
  $archive=Adb @('-d','exec-out','cat',$source)
  if($archive.Code -ne 0 -or $archive.Bytes.Length -ne 3158 -or
     (Sha $archive.Bytes) -cne $pinned){throw 'ORIGINAL_PINNED_SHA_FAILED'}
  Write-Host 'ORIGINAL_ARCHIVE: SHA256_PASS_3158_BYTES'
  Write-Host 'STAGE: 3/3 PRIVATE_PATH_READONLY_INSPECTION'
  # Each command is a direct run-as invocation without sh -c, redirects, or quoting.
  $pwd=Adb @('-d','exec-out','run-as',$pkg,'pwd')
  if($pwd.Code -ne 0){throw 'PRIVATE_PWD_FAILED'}
  Write-Host ('RUN_AS_PWD: '+(SafeLine ($utf8.GetString($pwd.Bytes).Trim())))
  foreach($path in @('files','files/fileproof335-input.paseka','files/restore335-report.json')){
    $result=Adb @('-d','exec-out','run-as',$pkg,'ls','-ld',$path)
    $line=SafeLine ($utf8.GetString($result.Bytes).Trim())
    if($result.Code -ne 0 -or $line -match '(?i)No such file or directory|not found'){
      Write-Host ('PATH_'+($path.Replace('/','_').Replace('.','_'))+': NOT_FOUND')
    }elseif($line -match '(?i)No such file or directory|not found'){
      Write-Host ('PATH_'+($path.Replace('/','_').Replace('.','_'))+': NOT_FOUND')
    }else{
      # Only a bounded metadata line; neither archive nor file contents.
      Write-Host ('PATH_'+($path.Replace('/','_').Replace('.','_'))+': '+$(if($result.Code -eq 0){'EXISTS'}else{'UNKNOWN'}))
      Write-Host ('PATH_INFO: '+$line)
    }
  }
  Write-Host 'RESTORE_COMMIT: NOT_TESTED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'STATUS: RESTORE335_PRIVATE_PATH_AUDIT_READONLY_COMPLETE'
}catch {
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'NO_INSTALL_NO_WRITE_NO_LAUNCH_NO_RESET_NO_DELETE'
  exit 2
}
