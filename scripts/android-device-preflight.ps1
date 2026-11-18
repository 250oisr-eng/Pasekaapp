param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Get-AdbDeviceRecords {
    param([string]$Output)
    $records = @()
    foreach ($line in ($Output -split '\r?\n')) {
        if ($line -match '^\s*(?<serial>\S+)\s+(?<state>device|unauthorized|offline)\b') {
            $records += [pscustomobject]@{ Serial = $Matches.serial; State = $Matches.state }
        }
    }
    return ,$records
}
function Get-PropertyValue {
    param([string]$Output)
    return ($Output -split '\r?\n' | Select-Object -First 1).Trim()
}
function Get-DumpsysVersionName {
    param([string]$Output)
    $match = [regex]::Match($Output, 'versionName=([^\s]+)')
    if ($match.Success) { return $match.Groups[1].Value }
    return $null
}
function Assert-Equal {
    param($Actual, $Expected, [string]$Message)
    if ($Actual -ne $Expected) { throw "Self-test failed: $Message. Expected '$Expected', got '$Actual'." }
}
if ($SelfTest) {
    $sample = @'
List of devices attached
ABC123 device product:NE2213 model:NE2213 transport_id:1
XYZ999 unauthorized usb:1
'@
    $records = @(Get-AdbDeviceRecords -Output $sample)
    Assert-Equal $records.Count 2 'device records count'
    Assert-Equal $records[0].State 'device' 'authorized device state'
    Assert-Equal $records[1].State 'unauthorized' 'unauthorized device state'
    Assert-Equal (Get-PropertyValue -Output ("16" + [Environment]::NewLine)) '16' 'getprop parsing'
    Assert-Equal (Get-DumpsysVersionName -Output 'versionName=1.2.3 minSdk=23') '1.2.3' 'package version parsing'
    Assert-Equal (Get-DumpsysVersionName -Output 'package has no version') $null 'missing package version'
    Write-Output 'Android ADB preflight self-test: 5 checks passed.'
    exit 0
}
function Find-AdbExecutable {
    $command = Get-Command 'adb.exe' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidates = @()
    if ($env:ANDROID_SDK_ROOT) { $candidates += Join-Path $env:ANDROID_SDK_ROOT 'platform-tools\adb.exe' }
    if ($env:ANDROID_HOME) { $candidates += Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe' }
    if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw 'ADB не найден. Установите Android SDK Platform-Tools или добавьте adb.exe в PATH. Скрипт ничего не устанавливает.'
}
$AdbPath = Find-AdbExecutable
function Invoke-Adb {
    param([string[]]$Arguments)
    $output = & $script:AdbPath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "ADB command failed (exit $exitCode): adb $($Arguments -join ' ')$([Environment]::NewLine)$($output | Out-String)"
    }
    return ($output | Out-String).Trim()
}
$deviceOutput = Invoke-Adb -Arguments @('devices', '-l')
$devices = @(Get-AdbDeviceRecords -Output $deviceOutput)
if ($devices.Count -ne 1) {
    throw "Требуется ровно одно обнаруженное Android-устройство; найдено: $($devices.Count). Отключите лишние устройства и повторите. Никакие устройства не изменены."
}
if ($devices[0].State -ne 'device') {
    throw "ADB устройство не авторизовано (состояние: $($devices[0].State)). Подтвердите отладку на телефоне; скрипт не пытается обходить подтверждение."
}
$properties = [ordered]@{
    model = Get-PropertyValue (Invoke-Adb -Arguments @('shell', 'getprop', 'ro.product.model'))
    device = Get-PropertyValue (Invoke-Adb -Arguments @('shell', 'getprop', 'ro.product.device'))
    sku = Get-PropertyValue (Invoke-Adb -Arguments @('shell', 'getprop', 'ro.boot.hardware.sku'))
    androidVersion = Get-PropertyValue (Invoke-Adb -Arguments @('shell', 'getprop', 'ro.build.version.release'))
    androidSdk = Get-PropertyValue (Invoke-Adb -Arguments @('shell', 'getprop', 'ro.build.version.sdk'))
    buildId = Get-PropertyValue (Invoke-Adb -Arguments @('shell', 'getprop', 'ro.build.id'))
    buildFingerprint = Get-PropertyValue (Invoke-Adb -Arguments @('shell', 'getprop', 'ro.build.fingerprint'))
    securityPatch = Get-PropertyValue (Invoke-Adb -Arguments @('shell', 'getprop', 'ro.build.version.security_patch'))
}
$identity = @($properties.model, $properties.device, $properties.sku, $properties.buildFingerprint) -join ' '
$modelMatches = $identity -match 'NE2213'
$batteryOutput = Invoke-Adb -Arguments @('shell', 'dumpsys', 'battery')
$batteryMatch = [regex]::Match($batteryOutput, '(?m)^\s*level:\s*(\d+)')
$batteryLevel = if ($batteryMatch.Success) { [int]$batteryMatch.Groups[1].Value } else { $null }
function Get-PackageVersion {
    param([string]$PackageName)
    $output = Invoke-Adb -Arguments @('shell', 'dumpsys', 'package', $PackageName)
    return Get-DumpsysVersionName -Output $output
}
$report = [ordered]@{
    schemaVersion = 1
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    result = if ($modelMatches) { 'device_preflight_passed' } else { 'blocked_unexpected_device' }
    device = [ordered]@{
        expectedModel = 'OnePlus 10 Pro 5G (NE2213)'
        model = $properties.model
        device = $properties.device
        sku = $properties.sku
        androidVersion = $properties.androidVersion
        androidSdk = $properties.androidSdk
        buildId = $properties.buildId
        buildFingerprint = $properties.buildFingerprint
        securityPatch = $properties.securityPatch
        batteryPercent = $batteryLevel
        screenSize = Invoke-Adb -Arguments @('shell', 'wm', 'size')
        screenDensity = Invoke-Adb -Arguments @('shell', 'wm', 'density')
    }
    software = [ordered]@{
        chromeVersion = Get-PackageVersion -PackageName 'com.android.chrome'
        webViewVersion = Get-PackageVersion -PackageName 'com.google.android.webview'
        pasekaPackage = 'ru.paseka.journal'
        pasekaVersion = Get-PackageVersion -PackageName 'ru.paseka.journal'
    }
    safety = [ordered]@{
        connectedDevices = 1
        adbTransport = 'existing ADB transport only; no tcpip/connect commands'
        deviceSerialRecorded = $false
        appInstalledOrRemoved = $false
        appDataReadOrChanged = $false
        settingsChanged = $false
        networkChanged = $false
        screenshotsCaptured = $false
        logcatCaptured = $false
    }
}
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$outputDirectory = Join-Path $ProjectRoot ('.local-test-results\android-preflight\' + $timestamp)
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$reportPath = Join-Path $outputDirectory 'report.json'
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Output "Результат: $($report.result)"
Write-Output "Android: $($properties.androidVersion), SDK $($properties.androidSdk)"
Write-Output "Chrome: $($report.software.chromeVersion); WebView: $($report.software.webViewVersion)"
Write-Output "Отчёт: $reportPath"
if (-not $modelMatches) {
    throw 'Обнаружено не ожидаемое устройство. Данные телефона не изменены; проверьте report.json.'
}
