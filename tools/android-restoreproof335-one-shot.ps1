# ONE-SHOT physical test. Needs existing pinned GitHub Actions ZIP on PC.
# No production package, fileproof329 package changes, restore of actual user data,
# uninstall, clear, rm, or deletion; new package is deliberately left installed.
[CmdletBinding()]
param(
  [string]$ZipPath=(Join-Path $env:USERPROFILE 'Downloads\paseka-restoreproof335-isolated-apk.zip')
)
$ErrorActionPreference='Stop'
$pkg='ru.paseka.journal.archive.restoreproof335'
$oldpkg='ru.paseka.journal.archive.fileproof329'
$original='/sdcard/Download/PasekaProof329/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka'
$inputFile='files/fileproof335-input.paseka'
$artifactSha='28e62f19d80a4ede343041a658da7093b2c106c82a02e0db23f2ccedd5bde176'
$apkSha='5ba91f66576e8f859a398655be001d0116819478501981650505ea66a92f496e'
$originalSha='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
$reportFile='files/restore335-report.json'
$utf8=New-Object System.Text.UTF8Encoding($false,$true)
function Digest([byte[]]$data){
  $sha=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($sha.ComputeHash($data)).Replace('-','').ToLowerInvariant()}
  finally{$sha.Dispose()}
}
function Adb([string[]]$argv,[byte[]]$send=$null){
  $exe=(Get-Command adb -CommandType Application -ErrorAction Stop).Source
  $info=New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName=$exe
  $info.Arguments=$argv -join ' '
  $info.UseShellExecute=$false
  $info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true
  $info.RedirectStandardError=$true
  $info.RedirectStandardInput=$true
  $process=New-Object System.Diagnostics.Process
  $process.StartInfo=$info
  $out=New-Object System.IO.MemoryStream
  try{
    if(-not $process.Start()){throw 'ADB_START_FAILED'}
    $outTask=$process.StandardOutput.BaseStream.CopyToAsync($out)
    $errTask=$process.StandardError.ReadToEndAsync()
    if($null -ne $send -and $send.Length -gt 0){
      $process.StandardInput.BaseStream.Write($send,0,$send.Length)
    }
    $process.StandardInput.Close()
    if(-not $process.WaitForExit(15000)){
      try{$process.Kill()}catch{}
      [void]$process.WaitForExit(2000)
      throw 'ADB_TIMEOUT_15S'
    }
    [void]$outTask.GetAwaiter().GetResult()
    $errorText=$errTask.GetAwaiter().GetResult()
    if($out.Length -gt 1048576){throw 'ADB_OUTPUT_TOO_LARGE'}
    return [pscustomobject]@{Code=$process.ExitCode;Bytes=$out.ToArray();ErrorText=$errorText}
  }finally{$out.Dispose();$process.Dispose()}
}
function AdbSuccess([string[]]$argv,[byte[]]$send=$null){
  $r=Adb $argv $send
  if($r.Code -ne 0){
    $text=($r.ErrorText -replace '[\r\n]+',' ' -replace '[^a-zA-Z0-9_ .:/-]','?')
    if($text.Length -gt 140){$text=$text.Substring(0,140)}
    throw ('ADB_EXIT_'+$r.Code+':'+$text)
  }
  return ,$r.Bytes
}
function AdbText([string[]]$argv){
  $bytes=AdbSuccess $argv
  return $utf8.GetString($bytes).Trim()
}
function VerifyOriginal {
  $raw=AdbSuccess @('-d','exec-out','cat',$original)
  if($raw.Length -ne 3158 -or (Digest $raw) -cne $originalSha){
    throw 'PINNED_ORIGINAL_CHANGED_OR_MISSING'
  }
  return ,$raw
}
try{
  Write-Host 'STAGE: 1/7 DEVICE_AND_PACKAGE_GATE'
  $devices=AdbText @('devices','-l')
  $ready=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device\s+'})
  $other=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)\b'})
  if($ready.Count -ne 1 -or $other.Count -ne 0){throw 'ONLY_ONE_AUTHORIZED_USB_DEVICE'}
  if((AdbText @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
     (AdbText @('-d','shell','getprop','ro.build.version.sdk')) -cne '36'){
    throw 'EXPECTED_NE2213_API36'
  }
  if((AdbText @('-d','shell','pm','path',$oldpkg)) -notmatch '^package:'){
    throw 'EXISTING_ORIGINAL_TEST_PACKAGE_REQUIRED'
  }
  $newPkg=Adb @('-d','shell','pm','path',$pkg)
  if($newPkg.Code -ne 0 -or $newPkg.Bytes.Length -ne 0 -or
     -not [string]::IsNullOrWhiteSpace($newPkg.ErrorText)){
    throw 'NEW_TEST_PACKAGE_ALREADY_PRESENT_OR_UNCERTAIN'
  }
  Write-Host 'STAGE: 2/7 ORIGINAL_SOURCE_SHA_GATE'
  $originalBytes=VerifyOriginal
  Write-Host 'STAGE: 3/7 PINNED_ARTIFACT_SHA_GATE'
  if(-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)){throw 'PINNED_ZIP_NOT_DOWNLOADED'}
  $file=Get-Item -LiteralPath $ZipPath
  if($file.Length -lt 1000000 -or $file.Length -gt 10000000){throw 'ZIP_LENGTH_INVALID'}
  if((Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $artifactSha){
    throw 'PINNED_ZIP_SHA_MISMATCH'
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip=[IO.Compression.ZipFile]::OpenRead($file.FullName)
  try {
    if($zip.Entries.Count -ne 1 -or $zip.Entries[0].FullName -cne 'app-debug.apk'){
      throw 'ZIP_ENTRIES_NOT_PINNED'
    }
    if($zip.Entries[0].Length -lt 1000000 -or $zip.Entries[0].Length -gt 10000000){
      throw 'APK_SIZE_INVALID'
    }
    $apkMemory=New-Object System.IO.MemoryStream
    try {
      $entryStream=$zip.Entries[0].Open()
      try{$entryStream.CopyTo($apkMemory)}finally{$entryStream.Dispose()}
      $apkBytes=$apkMemory.ToArray()
    }finally{$apkMemory.Dispose()}
    if((Digest $apkBytes) -cne $apkSha){throw 'PINNED_APK_SHA_MISMATCH'}
  }finally{$zip.Dispose()}
  # Recheck the package immediately before install. Never use install -r or clear.
  $again=Adb @('-d','shell','pm','path',$pkg)
  if($again.Code -ne 0 -or $again.Bytes.Length -ne 0 -or
     -not [string]::IsNullOrWhiteSpace($again.ErrorText)){
    throw 'NEW_TEST_PACKAGE_ALREADY_PRESENT_BEFORE_INSTALL'
  }
  $tempApk=Join-Path $env:TEMP ('paseka-restore335-'+[guid]::NewGuid().ToString('N')+'.apk')
  $stream=[IO.File]::Open($tempApk,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($apkBytes,0,$apkBytes.Length)}finally{$stream.Dispose()}
  Write-Host 'STAGE: 4/7 INSTALL_NEW_TEST_PACKAGE_ONLY'
  $installed=AdbText @('-d','install',('"'+$tempApk+'"'))
  if($installed -notmatch 'Success'){throw 'TEST_PACKAGE_INSTALL_NOT_CONFIRMED'}
  if((AdbText @('-d','shell','pm','path',$pkg)) -notmatch '^package:'){
    throw 'TEST_PACKAGE_NOT_VISIBLE'
  }
  Write-Host 'STAGE: 5/7 STAGE_PINNED_BYTES_IN_NEW_PRIVATE_DIRECTORY'
  $command='umask 077; mkdir -p files; if [ -e files/fileproof335-input.paseka ]; then exit 73; fi; cat > files/fileproof335-input.paseka'
  # The remote sh -c command is a fixed literal; no caller-controlled filenames.
  $transfer=Adb @('-d','exec-in','run-as',$pkg,'sh','-c',('"'+$command+'"')) $originalBytes
  if($transfer.Code -ne 0){throw ('PRIVATE_INPUT_TRANSFER_FAILED_'+$transfer.Code)}
  if($transfer.Bytes.Length -ne 0){throw 'PRIVATE_TRANSFER_UNEXPECTED_OUTPUT'}
  $readBack=AdbSuccess @('-d','exec-out','run-as',$pkg,'cat',$inputFile)
  if($readBack.Length -ne 3158 -or (Digest $readBack) -cne $originalSha){
    throw 'PRIVATE_INPUT_READBACK_SHA_MISMATCH'
  }
  Write-Host 'STAGE: 6/7 ONE_SHOT_LAUNCH_AND_PRIVATE_REPORT'
  $launch=AdbText @('-d','shell','am','start','-n',($pkg+'/.MainActivity'))
  if($launch -notmatch 'Starting|cmp='){throw 'TEST_PACKAGE_LAUNCH_NOT_CONFIRMED'}
  $report=$null
  for($attempt=0;$attempt -lt 15;$attempt++){
    Start-Sleep -Milliseconds 1000
    $result=Adb @('-d','exec-out','run-as',$pkg,'cat',$reportFile)
    if($result.Code -eq 0 -and $result.Bytes.Length -gt 0){
      $report=$utf8.GetString($result.Bytes) | ConvertFrom-Json -ErrorAction Stop
      break
    }
  }
  if($null -eq $report){throw 'PRIVATE_TEST_REPORT_MISSING'}
  if($report.status -cne 'PASS' -or $report.phase -cne 'ISOLATED_RESTORE335_SHA_PASS' -or
     $report.packageId -cne $pkg -or $report.archiveSha256 -cne $originalSha -or
     $report.videoCount -ne 2 -or $report.sourcePreserved -ne $true -or
     $report.recognitionSucceeded -ne $false -or $report.cleanupAuthorized -ne $false){
    throw ('ISOLATED_REPORT_NOT_PASS:'+([string]$report.code))
  }
  Write-Host 'STAGE: 7/7 ORIGINAL_SOURCE_RECHECK'
  $after=VerifyOriginal
  if((Digest $after) -cne (Digest $originalBytes)){throw 'SOURCE_CHANGED_DURING_TEST'}
  Write-Host 'DEVICE: NE2213 / API36'
  Write-Host 'TEST_PACKAGE: ru.paseka.journal.archive.restoreproof335'
  Write-Host 'ORIGINAL_ARCHIVE_SHA256: PASS'
  Write-Host 'PRIVATE_INPUT_SHA256: PASS'
  Write-Host 'TEST_ONLY_INDEXEDDB_AND_2_MP4: PASS'
  Write-Host 'RESTORE_PROOF335: ANDROID_SYNTHETIC_PASS'
  Write-Host 'MP4_DECODER: NOT_TESTED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'ORIGINAL_AND_TEST_PACKAGE_LEFT_IN_PLACE'
}catch{
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'NO_UNINSTALL_NO_RESET_NO_RESTORE_USER_DATA_NO_DELETE'
  exit 2
}
