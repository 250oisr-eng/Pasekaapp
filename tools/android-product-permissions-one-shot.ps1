# One-shot USB install of isolated diagnostic APK; never modifies product or user data.
[CmdletBinding()]
param([string]$ApkPath='')
$ErrorActionPreference='Stop'
$repo='250oisr-eng/Pasekaapp'
$run='45032633730'
$artifact='paseka-product-installed-permissions-readonly-apk'
$apkSha='04fdba8e71f57bf896ca2af43149437d101d5ffc15f24d30c6f7bcf351bf1216'
$diagnostic='ru.paseka.journal.diagnostic.productpermsv1'
$product='ru.paseka.journal'
$scratch=$null
function CommandOutput([string]$exe,[string[]]$arg) {
 $result=& $exe @arg 2>&1
 if($LASTEXITCODE -ne 0){throw ('COMMAND_FAILED_'+$exe+'_'+$LASTEXITCODE)}
 return ($result -join [Environment]::NewLine)
}
function PackagePaths([string]$package) {
 $lines=CommandOutput 'adb' @('-d','shell','pm','path',$package)
 return @($lines -split '[\r\n]+' | Where-Object {$_ -match '^package:'})
}
try {
 Write-Host 'STAGE: 1/6 CHECK_TOOLS_AND_USB'
 $null=Get-Command adb -CommandType Application -ErrorAction Stop
 $devices=CommandOutput 'adb' @('devices','-l')
 $ready=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+device(?:\s|$)'})
 $bad=@($devices -split '[\r\n]+' | Where-Object {$_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)(?:\s|$)'})
 if($ready.Count -ne 1 -or $bad.Count -ne 0){throw 'EXACTLY_ONE_AUTHORIZED_USB_DEVICE_REQUIRED'}
 Write-Host 'STAGE: 2/6 CHECK_INSTALLED_PRODUCT_READONLY'
 if((PackagePaths $product).Count -lt 1){throw 'PRODUCT_NOT_INSTALLED_NO_TEST'}
 if((PackagePaths $diagnostic).Count -ne 0){throw 'DIAGNOSTIC_ALREADY_PRESENT_NO_REINSTALL'}
 Write-Host 'STAGE: 3/6 GET_PINNED_APK'
 if([string]::IsNullOrWhiteSpace($ApkPath)){
  $null=Get-Command gh -CommandType Application -ErrorAction Stop
  $scratch=Join-Path ([IO.Path]::GetTempPath()) ('paseka-permissions-'+[guid]::NewGuid().ToString('N'))
  $null=New-Item -Path $scratch -ItemType Directory -ErrorAction Stop
  $null=CommandOutput 'gh' @('run','download',$run,'--repo',$repo,'--name',$artifact,'--dir',$scratch)
  $ApkPath=Join-Path $scratch 'app-debug.apk'
 }
 if(-not (Test-Path -LiteralPath $ApkPath -PathType Leaf)){throw 'APK_MISSING'}
 $apk=Get-Item -LiteralPath $ApkPath
 if($apk.Length -lt 1000000 -or $apk.Length -gt 10000000){throw 'APK_LENGTH_INVALID'}
 if((Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $apkSha){
  throw 'PINNED_APK_SHA256_MISMATCH'
 }
 Write-Host 'STAGE: 4/6 RECHECK_PACKAGE_GATE'
 if((PackagePaths $diagnostic).Count -ne 0){throw 'DIAGNOSTIC_APPEARED_NO_REINSTALL'}
 if((PackagePaths $product).Count -lt 1){throw 'PRODUCT_DISAPPEARED_NO_INSTALL'}
 Write-Host 'STAGE: 5/6 INSTALL_ONLY_NEW_DIAGNOSTIC'
 $installed=CommandOutput 'adb' @('-d','install',$apk.FullName)
 if($installed -notmatch '(?m)^Success\s*$'){throw 'INSTALL_NOT_CONFIRMED'}
 if((PackagePaths $diagnostic).Count -lt 1){throw 'DIAGNOSTIC_NOT_VISIBLE_AFTER_INSTALL'}
 Write-Host 'STAGE: 6/6 LAUNCH_DIAGNOSTIC_ONLY'
 $launch=CommandOutput 'adb' @('-d','shell','monkey','-p',$diagnostic,'-c','android.intent.category.LAUNCHER','1')
 if($launch -notmatch 'Events injected:\s*1'){throw 'DIAGNOSTIC_LAUNCH_NOT_CONFIRMED'}
 Write-Host 'STATUS: PASS_DIAGNOSTIC_INSTALLED_AND_LAUNCHED_ONLY'
 Write-Host 'PHYSICAL_PERMISSION_AUDIT: NOT_TESTED_UNTIL_TWO_BUTTON_REPORT'
 Write-Host 'On phone: Провести тест -> Копировать результат; paste the JSON into chat.'
 Write-Host 'CLEANUP_OR_RESTORE_AUTHORIZED: FALSE'
}catch{
 Write-Host 'STATUS: BLOCKED'
 Write-Host ('REASON: '+$_.Exception.Message)
 Write-Host 'PHYSICAL_PERMISSION_AUDIT: NOT_TESTED'
 Write-Host 'NO_UNINSTALL_NO_RESET_NO_PRODUCT_CHANGE_NO_VIDEO_DELETE'
 exit 2
}finally{
 if($scratch -and (Test-Path -LiteralPath $scratch -PathType Container)){
  # Only newly created Windows temp directory is removed, never Android media/data.
  Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
 }
}
