# Restore335 safe isolated reinstall: only if APK is absent including -u package inventory.
# Does NOT clear/uninstall/reset apps, modify production, restore/archive media or delete videos.
[CmdletBinding()]
param(
 [string]$ZipPath=(Join-Path $env:USERPROFILE 'Downloads\paseka-restoreproof335-isolated-apk.zip'),
 [string]$AdbPath=(Join-Path $env:TEMP 'paseka-offline-platformtools-43f92107c17d47d7a2853a42348efe9b\platform-tools\adb.exe')
)
$ErrorActionPreference='Stop'
$pkg='ru.paseka.journal.archive.restoreproof335'
$expectedAdb='bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee'
$expectedZip='28e62f19d80a4ede343041a658da7093b2c106c82a02e0db23f2ccedd5bde176'
$expectedApk='5ba91f66576e8f859a398655be001d0116819478501981650505ea66a92f496e'
$report=[ordered]@{
 stage='RESTORE335_PINNED_SAFE_INSTALL_V1';status='BLOCKED';adb='NOT_TESTED';
 device='NOT_TESTED';model='NOT_TESTED';sdk='NOT_TESTED';androidUsers='NOT_TESTED';
 installedBefore='UNKNOWN';residualPackage='UNKNOWN';zip='NOT_TESTED';apk='NOT_TESTED';
 install='NOT_ATTEMPTED';installedAfter='NOT_TESTED';privateFiles='NOT_TESTED';
 restores='NOT_ATTEMPTED';mediaRead='NOT_ATTEMPTED';cleanup='NOT_AUTHORIZED';detail='NOT_STARTED'
}
function SHABytes([byte[]]$data){
 $sha=[Security.Cryptography.SHA256]::Create()
 try {return ([BitConverter]::ToString($sha.ComputeHash($data))).Replace('-','').ToLowerInvariant()}
 finally{$sha.Dispose()}
}
function ADB([string[]]$arguments,[switch]$AllowFailure){
 $proc=New-Object System.Diagnostics.Process
 $start=New-Object System.Diagnostics.ProcessStartInfo
 $start.FileName=$script:AdbPath
 $start.Arguments=($arguments -join ' ')
 $start.UseShellExecute=$false
 $start.CreateNoWindow=$true
 $start.RedirectStandardOutput=$true
 $start.RedirectStandardError=$true
 $proc.StartInfo=$start
 try {
  if(-not $proc.Start()){throw 'ADB_START_FAILED'}
  $o=$proc.StandardOutput.ReadToEndAsync()
  $e=$proc.StandardError.ReadToEndAsync()
  if(-not $proc.WaitForExit(25000)){
   try{$proc.Kill()}catch{}
   [void]$proc.WaitForExit(1000)
   throw 'ADB_TIMEOUT'
  }
  $out=$o.GetAwaiter().GetResult()
  $err=$e.GetAwaiter().GetResult()
  if($out.Length -gt 8192 -or $err.Length -gt 8192){throw 'ADB_OUTPUT_TOO_LARGE'}
  if(-not $AllowFailure -and $proc.ExitCode -ne 0){throw ('ADB_FAILED_CODE_'+$proc.ExitCode)}
  return [pscustomobject]@{Code=$proc.ExitCode;Out=$out.Trim();Err=$err.Trim()}
 }finally{$proc.Dispose()}
}
function RequireText([string[]]$arguments){
 $r=ADB $arguments
 if($r.Err.Length -gt 0){throw 'ADB_UNEXPECTED_STDERR'}
 return $r.Out
}
function CheckPackage([string]$serial){
 $path=ADB @('-s',$serial,'shell','pm','path',$script:pkg) -AllowFailure
 if($path.Code -eq 0 -and $path.Out -match '(?m)^package:'){return 'PRESENT'}
 if(($path.Code -eq 0 -or $path.Code -eq 1) -and $path.Out.Length -eq 0 -and $path.Err.Length -eq 0){return 'ABSENT_CANDIDATE'}
 throw 'PACKAGE_PATH_AMBIGUOUS'
}
function PackageInventory([string]$serial,[switch]$IncludeUninstalled){
 $args=@('-s',$serial,'shell','pm','list','packages','--user','0')
 if($IncludeUninstalled){$args+= '-u'}
 $args+= $script:pkg
 $s=RequireText $args
 $entries=@($s -split '[\r\n]+' | Where-Object {$_ -ne ''})
 if($entries.Count -eq 0){return 'NO_MATCH'}
 if($entries.Count -eq 1 -and $entries[0] -ceq ('package:'+$script:pkg)){return 'PRESENT'}
 throw 'PACKAGE_LIST_AMBIGUOUS'
}
$tempApk=$null
try {
 if(-not(Test-Path -LiteralPath $AdbPath -PathType Leaf)){throw 'PINNED_ADB_MISSING'}
 if((Get-FileHash -LiteralPath $AdbPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedAdb){throw 'ADB_SHA_MISMATCH'}
 $version=RequireText @('version')
 if($version -notmatch '(?m)^Android Debug Bridge version 1[.]0[.]([0-9]+)'){throw 'ADB_VERSION_UNKNOWN'}
 if([int]$Matches[1] -lt 41){throw 'ADB_TOO_OLD'}
 $report.adb='PASS_PINNED'
 $devices=RequireText @('devices','-l')
 $lines=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(device|unauthorized|offline|recovery|sideload)(?:\s|$)'})
 if($lines.Count -ne 1 -or $lines[0] -notmatch '^([A-Za-z0-9._:-]+)\s+device(?:\s|$)'){throw 'ONE_AUTHORIZED_DEVICE_REQUIRED'}
 $serial=$Matches[1]
 $report.device='PASS_ONE_AUTHORIZED'
 if((RequireText @('-s',$serial,'shell','getprop','ro.product.model')) -cne 'NE2213'){throw 'MODEL_NOT_NE2213'}
 $report.model='PASS_NE2213'
 if((RequireText @('-s',$serial,'shell','getprop','ro.build.version.sdk')) -cne '36'){throw 'SDK_NOT_36'}
 $report.sdk='PASS_API36'
 $users=RequireText @('-s',$serial,'shell','pm','list','users')
 $userEntries=@([regex]::Matches($users,'UserInfo\{([0-9]+):'))
 if($userEntries.Count -ne 1 -or $userEntries[0].Groups[1].Value -cne '0'){throw 'ANDROID_MULTIPLE_OR_UNKNOWN_USERS_PRESERVE'}
 $report.androidUsers='PASS_ONLY_USER0'
 $p1=CheckPackage $serial
 $ordinary=PackageInventory $serial
 $uninstalled=PackageInventory $serial -IncludeUninstalled
 $p2=CheckPackage $serial
 if($p1 -cne 'ABSENT_CANDIDATE' -or $p2 -cne 'ABSENT_CANDIDATE' -or $ordinary -cne 'NO_MATCH'){
  $report.installedBefore='PRESENT_OR_AMBIGUOUS_PRESERVE'
  throw 'DIAGNOSTIC_PACKAGE_PRESENT_OR_INCONSISTENT_NO_REINSTALL'
 }
 $report.installedBefore='NOT_VISIBLE_USER0'
 if($uninstalled -cne 'NO_MATCH'){
  $report.residualPackage='PRESENT_PRESERVE'
  throw 'POSSIBLE_RETAINED_APP_DATA_NO_REINSTALL'
 }
 $report.residualPackage='NO_PM_U_MATCH_USER0'
 if(-not(Test-Path -LiteralPath $ZipPath -PathType Leaf)){throw 'PINNED_ARTIFACT_ZIP_REQUIRED'}
 $zf=Get-Item -LiteralPath $ZipPath
 if($zf.Length -lt 1000000 -or $zf.Length -gt 10000000){throw 'ZIP_SIZE_OUT_OF_RANGE'}
 if((Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedZip){throw 'ZIP_SHA_MISMATCH'}
 $report.zip='PASS_PINNED_SHA'
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $z=[System.IO.Compression.ZipFile]::OpenRead($zf.FullName)
 try{
  if($z.Entries.Count -ne 1 -or $z.Entries[0].FullName -cne 'app-debug.apk'){throw 'ZIP_APK_ENTRY_INVALID'}
  $stream=New-Object System.IO.MemoryStream
  try {
   $e=$z.Entries[0].Open()
   try{$e.CopyTo($stream)}finally{$e.Dispose()}
   $apk=$stream.ToArray()
  }finally{$stream.Dispose()}
 }finally{$z.Dispose()}
 if((SHABytes $apk) -cne $expectedApk){throw 'APK_SHA_MISMATCH'}
 $report.apk='PASS_PINNED_SHA_AND_CI_PACKAGE_ID'
 # Final no-overwrite gate, directly before install.
 if((CheckPackage $serial) -cne 'ABSENT_CANDIDATE' -or
   (PackageInventory $serial -IncludeUninstalled) -cne 'NO_MATCH'){throw 'PACKAGE_CHANGED_BEFORE_INSTALL'}
 $tempApk=Join-Path $env:TEMP ('paseka335-safe-'+[guid]::NewGuid().ToString('N')+'.apk')
 $stream=[System.IO.File]::Open($tempApk,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
 try{$stream.Write($apk,0,$apk.Length)}finally{$stream.Dispose()}
 if((Get-FileHash -LiteralPath $tempApk -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedApk){throw 'TEMP_APK_SHA_MISMATCH'}
 # Deliberately no -r, -d, uninstall, clear, restore or media copy.
 $result=ADB @('-s',$serial,'install','-t',('"'+$tempApk+'"')) -AllowFailure
 if($result.Code -ne 0 -or $result.Out -notmatch '(?m)^Success\s*$'){
  $report.install='FAILED_NO_RETRY'
  throw 'APK_INSTALL_FAILED_NO_RETRY'
 }
 $report.install='PASS'
 if((CheckPackage $serial) -cne 'PRESENT' -or
    (PackageInventory $serial) -cne 'PRESENT'){throw 'INSTALLED_PACKAGE_NOT_VERIFIED'}
 $report.installedAfter='PRESENT_USER0'
 # Never touch installed private files or launch app here:
 # previous dd partial state and user archives have not been cleared/overwritten.
 $report.status='PASS'
 $report.detail='ISOLATED_APK_INSTALLED_NO_LAUNCH_NO_PRIVATE_MUTATION'
}catch{
 $report.detail=$_.Exception.Message
}finally{
 if($tempApk -and (Test-Path -LiteralPath $tempApk -PathType Leaf)){
  Remove-Item -LiteralPath $tempApk -Force -ErrorAction SilentlyContinue
 }
 $report | ConvertTo-Json -Depth 4
}
if($report.status -ne 'PASS'){exit 2}
