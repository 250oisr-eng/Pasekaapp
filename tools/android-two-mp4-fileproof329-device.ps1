# Physical USB one-shot NEW test package only; no cleanup, uninstall, data reset or reruns.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedZipSha256,
 [string]$ZipPath=(Join-Path $env:USERPROFILE 'Downloads\paseka-fileproof329-two-mp4-runtime-apk.zip')
)
$ErrorActionPreference='Stop'
$pkg='ru.paseka.journal.archive.fileproof329'
$expected=@(
 '794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
 'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'
)
function AdbBytes([string[]]$argv) {
 $exe=(Get-Command adb -CommandType Application -ErrorAction Stop).Source
 $info=New-Object System.Diagnostics.ProcessStartInfo
 $info.FileName=$exe; $info.Arguments=($argv -join ' ')
 $info.UseShellExecute=$false; $info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
 $proc=New-Object System.Diagnostics.Process; $proc.StartInfo=$info
 $mem=New-Object System.IO.MemoryStream
 try {
  if(-not $proc.Start()){throw 'ADB_START_FAILED'}
  $proc.StandardOutput.BaseStream.CopyTo($mem)
  $stderr=$proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  if($mem.Length -gt 65536){throw 'ADB_OUTPUT_TOO_LARGE'}
  return [pscustomobject]@{Code=$proc.ExitCode;Bytes=$mem.ToArray();Err=$stderr}
 }finally{$mem.Dispose();$proc.Dispose()}
}
function UTF8([byte[]]$bytes) {
 $d=New-Object System.Text.UTF8Encoding($false,$true)
 return $d.GetString($bytes)
}
function AdbText([string[]]$argv) {
 $r=AdbBytes $argv
 if($r.Code -ne 0){throw ('ADB_COMMAND_FAILED_'+$r.Code)}
 return (UTF8 $r.Bytes).Trim()
}
function Proof {
 $r=AdbBytes @('-d','exec-out','run-as',$pkg,'cat','files/paseka-fileproof329.ndjson')
 if($r.Code -ne 0){return $null}
 if($r.Bytes.Length -lt 10 -or $r.Bytes.Length -gt 4096){throw 'PROOF_BYTES_INVALID'}
 $raw=UTF8 $r.Bytes
 $separator=[string][char]92+'n'
 if($raw.EndsWith($separator)){$raw=$raw.Substring(0,$raw.Length-$separator.Length)}
 $lines=@($raw -split '[\r\n]+' | Where-Object {$_.Trim()})
 if($lines.Count -ne 1){throw 'PROOF_REPORT_COUNT_INVALID'}
 try{$x=ConvertFrom-Json -InputObject $lines[0] -ErrorAction Stop}
 catch{throw 'PROOF_JSON_INVALID'}
 if($x.status -ceq 'BLOCKED'){throw ('PROOF_APP_BLOCKED_'+[string]$x.code)}
 if($x.status -cne 'PASS' -or $x.phase -cne 'FILE_READBACK_PASS' -or
    $x.proofVersion -ne 1 -or $x.packageId -cne $pkg -or
    $x.videoCount -ne 2 -or $x.cleanupAuthorized -ne $false -or
    $x.recognitionSucceeded -ne $false -or $x.uriType -cne 'content-uri' -or
    $x.archiveBytes -lt 1000 -or $x.archiveBytes -gt 1048576 -or
    $x.archiveSha256 -cnotmatch '^[a-f0-9]{64}$' -or
    @($x.sourceSha256).Count -ne 2 -or
    $x.sourceSha256[0] -cne $expected[0] -or
    $x.sourceSha256[1] -cne $expected[1]){throw 'PROOF_REPORT_CONTENT_INVALID'}
 return $x
}
$scratch=$null
try{
 $devices=AdbText @('devices','-l')
 $valid=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device\s+'})
 $bad=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)\b'})
 if($valid.Count -ne 1 -or $bad.Count -ne 0){throw 'ONE_AUTHORIZED_USB_DEVICE_REQUIRED'}
 if((AdbText @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
    (AdbText @('-d','shell','getprop','ro.build.version.sdk')) -cne '36'){
  throw 'ONEPLUS_NE2213_API36_REQUIRED'
 }
 $installed=AdbBytes @('-d','shell','pm','path',$pkg)
 if((UTF8 $installed.Bytes) -match 'package:'){throw 'FILEPROOF329_ALREADY_INSTALLED_NO_OVERWRITE'}
 if($installed.Code -ne 0 -and $installed.Bytes.Length -gt 0){throw 'PACKAGE_ABSENCE_NOT_CONFIRMED'}
 if(-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)){throw 'ARTIFACT_ZIP_MISSING'}
 $file=Get-Item -LiteralPath $ZipPath
 if($file.Length -lt 1024 -or $file.Length -gt 16777216){throw 'ARTIFACT_ZIP_SIZE_INVALID'}
 $sha=(Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
 if($sha -ne $ExpectedZipSha256.ToLowerInvariant()){throw 'ARTIFACT_ZIP_SHA_MISMATCH'}
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $scratch=Join-Path ([IO.Path]::GetTempPath()) ('fileproof329-'+[guid]::NewGuid().ToString('N'))
 $null=New-Item -Path $scratch -ItemType Directory -ErrorAction Stop
 $apk=Join-Path $scratch 'app-debug.apk'
 $zip=[IO.Compression.ZipFile]::OpenRead($file.FullName)
 try {
  if($zip.Entries.Count -ne 1 -or $zip.Entries[0].FullName -cne 'app-debug.apk'){throw 'ARTIFACT_ENTRIES_INVALID'}
  if($zip.Entries[0].Length -lt 1024 -or $zip.Entries[0].Length -gt 16777216){throw 'APK_SIZE_INVALID'}
  $source=$zip.Entries[0].Open()
  $target=[IO.File]::Open($apk,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$source.CopyTo($target)}finally{$target.Dispose();$source.Dispose()}
 }finally{$zip.Dispose()}
 $install=AdbText @('-d','install',$apk)
 if($install -notmatch 'Success'){throw 'INSTALL_NOT_CONFIRMED'}
 if((AdbText @('-d','shell','pm','path',$pkg)) -notmatch '^package:'){throw 'NEW_PACKAGE_NOT_INSTALLED'}
 Write-Host 'PACKAGE: NEW_ISOLATED_FILEPROOF329_INSTALLED'
 $start=AdbText @('-d','shell','monkey','-p',$pkg,'-c','android.intent.category.LAUNCHER','1')
 if($start -notmatch 'Events injected:\s*1'){throw 'LAUNCH_UNCONFIRMED'}
 $ok=$null
 for($i=0;$i -lt 40;$i++){
  Start-Sleep -Milliseconds 750
  $ok=Proof
  if($null -ne $ok){break}
 }
 if($null -eq $ok){throw 'PROOF_TIMEOUT_NO_REPORT'}
 Write-Host 'MEDIASTORE_FILE_READBACK: PASS'
 Write-Host ('ARCHIVE_BYTES: '+$ok.archiveBytes)
 Write-Host ('ARCHIVE_SHA256: '+$ok.archiveSha256)
 Write-Host ('SOURCE_1_SHA256: '+$ok.sourceSha256[0])
 Write-Host ('SOURCE_2_SHA256: '+$ok.sourceSha256[1])
 Write-Host 'RESTORE_COMMIT: NOT_TESTED'
 Write-Host 'MP4_PLAYBACK: NOT_TESTED'
 Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
 Write-Host 'STATUS: ISOLATED_FILEPROOF329_MEDIASTORE_PASS'
}catch{
 Write-Host 'STATUS: BLOCKED'
 Write-Host ('DETAIL: '+$_.Exception.Message)
 Write-Host 'NO_ANDROID_FILES_DELETED; NO_PACKAGE_UNINSTALL_OR_CLEAR'
 exit 2
}finally{
 if($scratch -and (Test-Path -LiteralPath $scratch)){
  # Only a newly-created temporary PC folder, never Android or user archive files.
  Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
 }
}
