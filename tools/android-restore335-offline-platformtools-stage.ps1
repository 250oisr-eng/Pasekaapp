# OFF-DEVICE ONLY. Requires a ZIP downloaded by the user from:
# https://developer.android.com/tools/releases/platform-tools (Google terms accepted).
# Never changes PATH, system files, ADB server, Android, or existing installations.
[CmdletBinding()]
param(
  [string]$ZipPath=(Join-Path (Join-Path $env:USERPROFILE 'Downloads') 'platform-tools-latest-windows.zip')
)
$ErrorActionPreference='Stop'
$utf8=New-Object System.Text.UTF8Encoding($false,$true)
function SHA256File([string]$path){
  return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}
try {
  Write-Host 'STAGE: 1/3 OFFLINE_ZIP_EXISTENCE_AND_INTEGRITY_STRUCTURE'
  if(-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)){throw 'OFFICIAL_GOOGLE_ZIP_MISSING_DOWNLOAD_FIRST'}
  $zipItem=Get-Item -LiteralPath $ZipPath -ErrorAction Stop
  if($zipItem.Length -lt 1000000 -or $zipItem.Length -gt 100000000){throw 'ZIP_SIZE_OUTSIDE_BOUNDS'}
  $zipSha=SHA256File $zipItem.FullName
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip=[IO.Compression.ZipFile]::OpenRead($zipItem.FullName)
  try {
    $entries=@($zip.Entries)
    if($entries.Count -lt 3 -or $entries.Count -gt 120){throw 'ZIP_ENTRY_COUNT_OUTSIDE_BOUNDS'}
    $names=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $sum=[long]0
    foreach($entry in $entries){
      $name=$entry.FullName
      if(-not $names.Add($name)){throw 'ZIP_DUPLICATE_ENTRY'}
      # Google ZIPs may explicitly list their top-level folder as platform-tools/.
      # This directory entry is safe only when empty; all other paths remain gated.
      if($name -ceq 'platform-tools/'){
        if($entry.Length -ne 0){throw 'ZIP_DIRECTORY_HAS_CONTENT'}
        continue
      }
      if($name -notmatch '^platform-tools/[A-Za-z0-9_.+/-]+
          $name.Contains('..') -or $name.Contains('//') -or
          $name.Contains('\') -or $name.StartsWith('/')){throw 'ZIP_UNSAFE_ENTRY'}
      $sum += [long]$entry.Length
      if($entry.Length -gt 100000000 -or $sum -gt 150000000){throw 'ZIP_UNCOMPRESSED_SIZE_BOUND'}
      if(($entry.ExternalAttributes -band 0xF0000000) -eq 0xA0000000){throw 'ZIP_LINK_NOT_ALLOWED'}
    }
    foreach($required in @('platform-tools/adb.exe','platform-tools/AdbWinApi.dll','platform-tools/AdbWinUsbApi.dll')){
      if(-not $names.Contains($required)){throw ('ZIP_REQUIRED_FILE_MISSING_'+$required)}
    }
  }finally{$zip.Dispose()}
  Write-Host ('SOURCE_ZIP_SHA256: '+$zipSha)
  Write-Host 'SOURCE_PROVENANCE: USER_DOWNLOADED_FROM_GOOGLE_REQUIRED'
  Write-Host 'STAGE: 2/3 EXTRACT_FRESH_ISOLATED_WINDOWS_FOLDER'
  $root=Join-Path $env:TEMP ('paseka-offline-platformtools-'+[guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($root)
  [IO.Compression.ZipFile]::ExtractToDirectory($zipItem.FullName,$root)
  $adb=Join-Path (Join-Path $root 'platform-tools') 'adb.exe'
  if(-not (Test-Path -LiteralPath $adb -PathType Leaf)){throw 'ADB_EXE_MISSING_AFTER_EXTRACT'}
  Write-Host ('ADB_EXE_SHA256: '+(SHA256File $adb))
  Write-Host 'STAGE: 3/3 VERSION_ONLY_NO_DEVICE_CONNECTION'
  $info=New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName=$adb
  $info.Arguments='version'
  $info.UseShellExecute=$false
  $info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true
  $info.RedirectStandardError=$true
  $info.RedirectStandardInput=$true
  $p=New-Object System.Diagnostics.Process
  $p.StartInfo=$info
  try{
    if(-not $p.Start()){throw 'ADB_VERSION_START_FAILED'}
    $p.StandardInput.Close()
    $stdout=$p.StandardOutput.ReadToEnd()
    $stderr=$p.StandardError.ReadToEnd()
    if(-not $p.WaitForExit(8000)){
      try{$p.Kill()}catch{}
      throw 'ADB_VERSION_TIMEOUT'
    }
    if($p.ExitCode -ne 0){throw 'ADB_VERSION_EXIT_NONZERO'}
  }finally{$p.Dispose()}
  $line=($stdout -split '[\r\n]+')[0].Trim()
  $match=[regex]::Match($line,'^Android Debug Bridge version 1[.]0[.](\d+)$')
  if(-not $match.Success){throw 'ADB_VERSION_UNRECOGNIZED'}
  if([int]$match.Groups[1].Value -lt 41){throw 'ADB_VERSION_TOO_OLD'}
  Write-Host ('VERIFIED_ADB_VERSION: '+$line)
  Write-Host ('ISOLATED_ADB_PATH: '+$adb)
  Write-Host 'OLD_ADB_AND_SYSTEM_PATH: UNCHANGED'
  Write-Host 'ANDROID_CONNECTION: NOT_ATTEMPTED'
  Write-Host 'RESTORE_COMMIT: NOT_TESTED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'STATUS: RESTORE335_OFFLINE_PLATFORMTOOLS_READY'
}catch{
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'ANDROID_CONNECTION_NOT_ATTEMPTED_NO_SYSTEM_CHANGES_NO_DELETE'
  exit 2
}
 -or
          $name.Contains('..') -or $name.Contains('//') -or
          $name.Contains('\') -or $name.StartsWith('/')){throw 'ZIP_UNSAFE_ENTRY'}
      $sum += [long]$entry.Length
      if($entry.Length -gt 100000000 -or $sum -gt 150000000){throw 'ZIP_UNCOMPRESSED_SIZE_BOUND'}
      if(($entry.ExternalAttributes -band 0xF0000000) -eq 0xA0000000){throw 'ZIP_LINK_NOT_ALLOWED'}
    }
    foreach($required in @('platform-tools/adb.exe','platform-tools/AdbWinApi.dll','platform-tools/AdbWinUsbApi.dll')){
      if(-not $names.Contains($required)){throw ('ZIP_REQUIRED_FILE_MISSING_'+$required)}
    }
  }finally{$zip.Dispose()}
  Write-Host ('SOURCE_ZIP_SHA256: '+$zipSha)
  Write-Host 'SOURCE_PROVENANCE: USER_DOWNLOADED_FROM_GOOGLE_REQUIRED'
  Write-Host 'STAGE: 2/3 EXTRACT_FRESH_ISOLATED_WINDOWS_FOLDER'
  $root=Join-Path $env:TEMP ('paseka-offline-platformtools-'+[guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($root)
  [IO.Compression.ZipFile]::ExtractToDirectory($zipItem.FullName,$root)
  $adb=Join-Path (Join-Path $root 'platform-tools') 'adb.exe'
  if(-not (Test-Path -LiteralPath $adb -PathType Leaf)){throw 'ADB_EXE_MISSING_AFTER_EXTRACT'}
  Write-Host ('ADB_EXE_SHA256: '+(SHA256File $adb))
  Write-Host 'STAGE: 3/3 VERSION_ONLY_NO_DEVICE_CONNECTION'
  $info=New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName=$adb
  $info.Arguments='version'
  $info.UseShellExecute=$false
  $info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true
  $info.RedirectStandardError=$true
  $info.RedirectStandardInput=$true
  $p=New-Object System.Diagnostics.Process
  $p.StartInfo=$info
  try{
    if(-not $p.Start()){throw 'ADB_VERSION_START_FAILED'}
    $p.StandardInput.Close()
    $stdout=$p.StandardOutput.ReadToEnd()
    $stderr=$p.StandardError.ReadToEnd()
    if(-not $p.WaitForExit(8000)){
      try{$p.Kill()}catch{}
      throw 'ADB_VERSION_TIMEOUT'
    }
    if($p.ExitCode -ne 0){throw 'ADB_VERSION_EXIT_NONZERO'}
  }finally{$p.Dispose()}
  $line=($stdout -split '[\r\n]+')[0].Trim()
  $match=[regex]::Match($line,'^Android Debug Bridge version 1[.]0[.](\d+)$')
  if(-not $match.Success){throw 'ADB_VERSION_UNRECOGNIZED'}
  if([int]$match.Groups[1].Value -lt 41){throw 'ADB_VERSION_TOO_OLD'}
  Write-Host ('VERIFIED_ADB_VERSION: '+$line)
  Write-Host ('ISOLATED_ADB_PATH: '+$adb)
  Write-Host 'OLD_ADB_AND_SYSTEM_PATH: UNCHANGED'
  Write-Host 'ANDROID_CONNECTION: NOT_ATTEMPTED'
  Write-Host 'RESTORE_COMMIT: NOT_TESTED'
  Write-Host 'RECOGNITION_CLEANUP: NOT_AUTHORIZED'
  Write-Host 'STATUS: RESTORE335_OFFLINE_PLATFORMTOOLS_READY'
}catch{
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: '+$_.Exception.Message)
  Write-Host 'ANDROID_CONNECTION_NOT_ATTEMPTED_NO_SYSTEM_CHANGES_NO_DELETE'
  exit 2
}
