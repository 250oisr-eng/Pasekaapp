# Optional one-click AVD bootstrap for B01. Creates ONLY a new AVD;
# NEVER wipes, reuses, deletes or updates any existing Android device/AVD.
$ErrorActionPreference='Stop'
$avdName='PASEKA_B01_ISOLATED_TEST'
$base=if($env:ANDROID_HOME){$env:ANDROID_HOME}else{Join-Path $env:LOCALAPPDATA 'Android\Sdk'}
$manager=Join-Path $base 'cmdline-tools\latest\bin\avdmanager.bat'
$emulator=Join-Path $base 'emulator\emulator.exe'
$image=Join-Path $base 'system-images\android-35\google_apis\x86_64\system.img'
if(-not (Test-Path -LiteralPath $manager) -or
   -not (Test-Path -LiteralPath $emulator) -or
   -not (Test-Path -LiteralPath $image)){
 Write-Host 'BLOCKED: Android Studio with Android 35 Google APIs x86_64 image is required.'
 Write-Host 'Install Android Studio and one Android 35 emulator image in Device Manager.'
 Write-Host 'No phone or existing emulator was modified.'
 exit 5
}
$avdDir=Join-Path $env:USERPROFILE ".android\avd\$avdName.avd"
$avdIni=Join-Path $env:USERPROFILE ".android\avd\$avdName.ini"
if((Test-Path -LiteralPath $avdDir) -or (Test-Path -LiteralPath $avdIni)){
 Write-Host 'BLOCKED: isolated AVD name already exists. No existing AVD is overwritten.'
 exit 6
}
$names=& $manager list avd 2>&1
if($LASTEXITCODE -ne 0){Write-Host 'BLOCKED: Android SDK AVD inventory failed';exit 7}
if(($names | Out-String).Contains($avdName)){
 Write-Host 'BLOCKED: isolated AVD already exists; nothing overwritten';exit 8
}
Write-Host 'Creating a NEW isolated emulator profile only (no real device operations).'
# The only pipeline input here is the literal text 'no', never user data.
'no' | & $manager create avd --name $avdName --package 'system-images;android-35;google_apis;x86_64' --device 'pixel_5'
if($LASTEXITCODE -ne 0){Write-Host 'BLOCKED: AVD creation failed';exit 9}
if(-not (Test-Path -LiteralPath $avdIni)){Write-Host 'BLOCKED: new AVD not detected';exit 10}
Start-Process -FilePath $emulator -ArgumentList @('-avd',$avdName,'-no-snapshot','-no-audio','-no-boot-anim')
Write-Host 'New PASEKA_B01_ISOLATED_TEST emulator launch requested.'
Write-Host 'After it boots, start START-EMULATOR-V20.cmd from the transfer ZIP.'
