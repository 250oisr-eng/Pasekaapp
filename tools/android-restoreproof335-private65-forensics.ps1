# Read-only one-shot diagnostic for an ALREADY INSTALLED isolated restoreproof335.
# Never install, launch, stop, reset, overwrite, remove or replay source bytes.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$package='ru.paseka.journal.archive.restoreproof335'
$originalPackage='ru.paseka.journal.archive.fileproof329'
$original='/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka'
$private='files/fileproof335-input.paseka'
$expected='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
$utf8=New-Object System.Text.UTF8Encoding($false,$true)
function Hash([byte[]]$bytes) {
  $h=[Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($h.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() }
  finally { $h.Dispose() }
}
function Adb([string[]]$argv) {
  $info=New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName=(Get-Command adb -CommandType Application -ErrorAction Stop).Source
  $info.Arguments=$argv -join ' '
  $info.UseShellExecute=$false
  $info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true
  $info.RedirectStandardError=$true
  $proc=New-Object System.Diagnostics.Process
  $proc.StartInfo=$info
  $mem=New-Object System.IO.MemoryStream
  try {
    if(-not $proc.Start()){throw 'ADB_START_FAILED'}
    $stdout=$proc.StandardOutput.BaseStream.CopyToAsync($mem)
    $stderr=$proc.StandardError.ReadToEndAsync()
    if(-not $proc.WaitForExit(12000)){
      try {$proc.Kill()} catch {}
      [void]$proc.WaitForExit(2000)
      throw 'ADB_TIMEOUT_12S'
    }
    [void]$stdout.GetAwaiter().GetResult()
    $errorText=$stderr.GetAwaiter().GetResult()
    if($mem.Length -gt 1048576){throw 'ADB_READ_TOO_LARGE'}
    return [pscustomobject]@{Code=$proc.ExitCode;Bytes=$mem.ToArray();ErrorText=$errorText}
  } finally {$mem.Dispose();$proc.Dispose()}
}
function PrintableSmall([byte[]]$bytes) {
  if($bytes.Length -gt 128){return 'TOO_LONG_NOT_PRINTED'}
  $sb=New-Object System.Text.StringBuilder
  foreach($b in $bytes){
    if($b -eq 10){[void]$sb.Append('\\n')}
    elseif($b -eq 13){[void]$sb.Append('\\r')}
    elseif($b -ge 32 -and $b -le 126){[void]$sb.Append([char]$b)}
    else{[void]$sb.Append('?')}
  }
  return $sb.ToString()
}
function HexSmall([byte[]]$bytes){
  if($bytes.Length -gt 128){return 'TOO_LONG_NOT_PRINTED'}
  return [BitConverter]::ToString($bytes).Replace('-',' ').ToLowerInvariant()
}
function Text([string[]]$argv) {
  $response=Adb $argv
  if($response.Code -ne 0){throw ('ADB_PRECHECK_EXIT_'+$response.Code)}
  return $utf8.GetString($response.Bytes).Trim()
}
try {
  Write-Host 'STAGE: 1/3 DEVICE_AND_EXISTING_PACKAGES'
  $devices=Text @('devices','-l')
  $ready=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device\s+'})
  $bad=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(unauthorized|offline|recovery|sideload)\b'})
  if($ready.Count -ne 1 -or $bad.Count -ne 0){throw 'SINGLE_AUTHORIZED_DEVICE_REQUIRED'}
  if((Text @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
     (Text @('-d','shell','getprop','ro.build.version.sdk')) -cne '36'){
    throw 'EXPECTED_NE2213_API36'
  }
  if((Text @('-d','shell','pm','path',$package)) -notmatch '^package:' -or
     (Text @('-d','shell','pm','path',$originalPackage)) -notmatch '^package:'){
    throw 'BOTH_EXISTING_TEST_PACKAGES_REQUIRED'
  }
  Write-Host 'STAGE: 2/3 READ_ORIGINAL_AND_PRIVATE_BYTES'
  $sourceResponse=Adb @('-d','exec-out','cat',$original)
  if($sourceResponse.Code -ne 0){throw 'ORIGINAL_READ_FAILED'}
  $source=$sourceResponse.Bytes
  $sourceHash=Hash $source
  Write-Host ('ORIGINAL_BYTES: '+$source.Length)
  Write-Host ('ORIGINAL_SHA256: '+$(if($sourceHash -ceq $expected){'PASS'}else{'MISMATCH'}))
  if($source.Length -ne 3158 -or $sourceHash -cne $expected){
    throw 'ORIGINAL_NOT_PINNED_ABORT'
  }
  $privateResponse=Adb @('-d','exec-out','run-as',$package,'cat',$private)
  if($privateResponse.Code -ne 0){
    Write-Host ('PRIVATE_READ: BLOCKED_EXIT_'+$privateResponse.Code)
    throw 'PRIVATE_FILE_NOT_READABLE'
  }
  $target=$privateResponse.Bytes
  Write-Host ('PRIVATE_BYTES: '+$target.Length)
  Write-Host ('PRIVATE_SHA256: '+(Hash $target))
  if($target.Length -le 128){
    Write-Host ('PRIVATE_HEX_UP_TO_128: '+(HexSmall $target))
    Write-Host ('PRIVATE_ASCII_UP_TO_128: '+(PrintableSmall $target))
  }
  $match=(($target.Length -eq $source.Length) -and ((Hash $target) -ceq $sourceHash))
  Write-Host ('PRIVATE_MATCHES_ORIGINAL: '+$(if($match){'YES'}else{'NO'}))
  if(-not $match){
    $limit=[Math]::Min($target.Length,$source.Length)
    $offset=-1
    for($i=0;$i -lt $limit;$i++){
      if($target[$i] -ne $source[$i]){$offset=$i;break}
    }
    if($offset -eq -1 -and $target.Length -ne $source.Length){$offset=$limit}
    Write-Host ('FIRST_DIFFERENT_BYTE_OFFSET: '+$offset)
    Write-Host ('LENGTH_DELTA: '+($target.Length-$source.Length))
    Write-Host 'PRIVATE_STAGING_STATUS: MISMATCH_NO_WRITE'
  } else {
    Write-Host 'PRIVATE_STAGING_STATUS: PASS_READ_ONLY'
  }
  Write-Host 'STAGE: 3/3 READ_ONLY_REPORT_CHECK'
  $report=Adb @('-d','exec-out','run-as',$package,'cat','files/restore335-report.json')
  if($report.Code -eq 0 -and $report.Bytes.Length -gt 0){
    Write-Host ('PRIVATE_REPORT_PRESENT: YES_BYTES_'+$report.Bytes.Length)
    if($report.Bytes.Length -le 128){
      Write-Host ('REPORT_HEX_UP_TO_128: '+(HexSmall $report.Bytes))
      Write-Host ('REPORT_ASCII_UP_TO_128: '+(PrintableSmall $report.Bytes))
    }
  }else{
    Write-Host 'PRIVATE_REPORT_PRESENT: NO_OR_UNREADABLE'
  }
  Write-Host 'RESTORE_COMMIT: NOT_CONFIRMED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'STATUS: RESTORE335_PRIVATE65_FORENSICS_READONLY_COMPLETE'
} catch {
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'NO_INSTALL_NO_WRITE_NO_RESET_NO_DELETE_NO_LAUNCH'
  exit 2
}
