param([switch]$Offline, [string]$AgentRunId = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [Console]::OutputEncoding

# Only the separate debug package is installed, launched and force-stopped.
# Every CI build has its own isolated package and signing key.
# Read the package name from the matching build artifact; never clear or
# replace any existing Android application to resolve signature mismatch.
$PackagePath = Join-Path $PSScriptRoot 'device-package.txt'
if (!(Test-Path -LiteralPath $PackagePath)) {
  Write-Host 'Missing device-package.txt: installation aborted without device changes.' -ForegroundColor Red
  exit 1
}
$Package = (Get-Content -LiteralPath $PackagePath -Raw).Trim()
if ($Package -cnotmatch '^ru\.paseka\.journal\.device\.r[0-9]{6,20}a[1-9][0-9]{0,3}$') {
  Write-Host 'Invalid isolated test package identifier: installation aborted.' -ForegroundColor Red
  exit 1
}
$Adb = Join-Path $PSScriptRoot 'platform-tools\adb.exe'
$Apk = Join-Path $PSScriptRoot 'paseka-device-test.apk'
$ChecksumPath = Join-Path $PSScriptRoot 'paseka-device-test.sha256'
$Reports = Join-Path $PSScriptRoot 'reports'
$RunId = [guid]::NewGuid().ToString('N')
$RunId = $RunId.Substring(0, 20)
if ($AgentRunId -and $AgentRunId -cnotmatch '^[a-f0-9]{32}$') {
  throw 'Unsafe agent report run identifier.'
}
$ReportDir = $(if ($AgentRunId) {
  Join-Path $Reports ('agent-' + $AgentRunId)
} else {
  Join-Path $Reports (Get-Date -Format 'yyyyMMdd-HHmmss')
})
if ($AgentRunId -and (Test-Path -LiteralPath $ReportDir)) {
  throw 'Report directory already exists. No overwrite allowed.'
}
$StageOne = $null
$FinalReport = $null
$Fatal = ''
$TestAppLaunched = $false

# Only previously paired Android Wireless debugging is permitted.
# The optional PASEKA_ADB_WIFI_ENDPOINT must contain an explicit private IPv4:port.
function Test-PrivateWifiEndpoint {
  param([string]$Endpoint)
  if ($Endpoint -notmatch '^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):([0-9]{1,5})$') { return $false }
  $a = @([int]$Matches[1], [int]$Matches[2], [int]$Matches[3], [int]$Matches[4])
  $port = [int]$Matches[5]
  if ($port -lt 1 -or $port -gt 65535 -or @($a | Where-Object { $_ -gt 255 }).Count -gt 0) { return $false }
  return ($a[0] -eq 10 -or ($a[0] -eq 172 -and $a[1] -ge 16 -and $a[1] -le 31) -or ($a[0] -eq 192 -and $a[1] -eq 168))
}
function Find-TestDevice {
  param([string]$WifiEndpoint)
  $deviceText = & $Adb devices
  if ($LASTEXITCODE -ne 0) { throw 'ADB devices failed.' }
  $connected = @($deviceText | ForEach-Object {
    if ($_ -match '^([^\s]+)\s+device\s*$') { $Matches[1] }
  })
  $usb = @($connected | Where-Object { $_ -match '^[A-Za-z0-9]+$' })
  if ($usb.Count -gt 1) { throw 'More than one USB Android device: refusing to select automatically.' }
  if ($usb.Count -eq 1) { return $usb[0] }
  if ($WifiEndpoint -and ($connected -ccontains $WifiEndpoint)) { return $WifiEndpoint }
  return ''
}
function Invoke-ADB {
  param([string[]]$Arguments)
  $text = & $Adb @Arguments
  if ($LASTEXITCODE -ne 0) { throw ('ADB command failed: ' + ($Arguments -join ' ')) }
  return $text
}
function Read-DeviceReport {
  param([string]$Serial)
  # The report is normally absent for the first few polls. Windows PowerShell
  # 5.1 treats redirected native stderr as an ErrorRecord; under the caller's
  # global Stop policy this would abort the entire test before a retry.
  # Scope Continue to this read-only probe. Keep Stop everywhere else.
  $ErrorActionPreference = 'Continue'
  try {
    $lines = & $Adb -s $Serial shell run-as $Package cat files/paseka-device-report.json 2>$null
    if ($LASTEXITCODE -ne 0 -or !$lines) { return $null }
    return (($lines -join "`n") | ConvertFrom-Json)
  } catch {
    return $null
  }
}
function Wait-Report {
  param([string]$Serial, [string[]]$Phases, [int]$TimeoutSec)
  $clock = [Diagnostics.Stopwatch]::StartNew()
  do {
    $status = Read-DeviceReport -Serial $Serial
    if ($null -ne $status -and $status.runId -eq $RunId -and ($Phases -contains $status.phase)) {
      return $status
    }
    Start-Sleep -Seconds 2
  } while ($clock.Elapsed.TotalSeconds -lt $TimeoutSec)
  throw ('Телефон не сформировал отчёт за ' + $TimeoutSec + ' секунд. См. снимок экрана.')
}
function Capture-TestScreen {
  param([string]$Serial, [string]$Label)
  $name = 'paseka_test_' + $RunId + '_' + $Label + '.png'
  $remote = '/sdcard/' + $name
  try {
    [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'screencap', '-p', $remote))
    [void](Invoke-ADB -Arguments @('-s', $Serial, 'pull', $remote, (Join-Path $ReportDir ($Label + '.png'))))
  } catch {
    Write-Host ('Снимок экрана недоступен: ' + $_.Exception.Message)
  } finally {
    # Remove only the screenshot created by this test; never touch user files.
    & $Adb -s $Serial shell rm -f $remote 1>$null 2>$null
  }
}
try {
  if (!(Test-Path -LiteralPath $Adb) -or !(Test-Path -LiteralPath $Apk) -or !(Test-Path -LiteralPath $ChecksumPath)) {
    throw 'Комплект неполон: требуются adb.exe, тестовая APK и файл SHA-256.'
  }
  $expected = ((Get-Content -LiteralPath $ChecksumPath -Raw).Trim() -split '\s+')[0].ToUpperInvariant()
  if ($expected -notmatch '^[0-9A-F]{64}$') { throw 'Некорректный файл контрольной суммы APK.' }
  $actual = (Get-FileHash -LiteralPath $Apk -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($expected -ne $actual) { throw 'Контрольная сумма APK не совпала: установка отменена.' }
  [void](New-Item -ItemType Directory -Force -Path $ReportDir)
  Write-Host 'Пасека: автоматические испытания на Android'
  Write-Host 'Используется только отдельный тестовый пакет, без доступа к основной базе.'
  Write-Host 'USB имеет приоритет. Wi-Fi разрешён только для заранее сопряжённого адреса.'
  [void](Invoke-ADB -Arguments @('start-server'))
  # Manual offline verification requires physical USB, never Wireless ADB.
  $WifiEndpoint = $(if ($Offline) { '' } else { [string]$env:PASEKA_ADB_WIFI_ENDPOINT })
  if ($WifiEndpoint -and !(Test-PrivateWifiEndpoint -Endpoint $WifiEndpoint)) {
    throw 'Недопустимый адрес Wi-Fi ADB. Требуется частный IPv4:порт (например, 192.168.1.20:37123).'
  }
  $Serial = ''
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $Serial = Find-TestDevice -WifiEndpoint $WifiEndpoint
    if ($Serial) { break }
    if ($WifiEndpoint -and ($attempt -eq 0 -or ($attempt % 10 -eq 0))) {
      # Secure Android 11+ pairing must already have happened on the phone.
      $ErrorActionPreference = 'Continue'
      try { $null = & $Adb connect $WifiEndpoint 2>$null } catch { }
      $ErrorActionPreference = 'Stop'
    }
    Start-Sleep -Seconds 2
  }
  if (!$Serial) { throw 'Не найден авторизованный USB или заранее сопряжённый Wi-Fi ADB. Отладку и сопряжение нужно разрешить на телефоне.' }
  $sdk = [int]((Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'getprop', 'ro.build.version.sdk') | Select-Object -First 1).Trim())
  if ($sdk -lt 35) {
    throw ('На телефоне Android SDK ' + $sdk + '. Изолированная APK требует Android 15 (SDK 35) или новее.')
  }
  if ($env:PASEKA_SCHEDULED_NO_INSTALL -eq '1') {
    # Local scheduler may run ONLY the already installed isolated APK.
    # It never upgrades, replaces, removes or clears applications.
    Write-Host ('Проверка уже установленного отдельного test APK: ' + $Package)
  } else {
    Write-Host ('ADB-устройство ' + $Serial + '. Установка отдельной тестовой APK: ' + $Package)
    $install = (Invoke-ADB -Arguments @('-s', $Serial, 'install', '-r', $Apk) | Out-String).Trim()
    if ($install -notmatch 'Success') { throw ('ADB не подтвердил установку: ' + $install) }
  }
  $pkgPath = (Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'pm', 'path', $Package) | Out-String)
  if ($pkgPath -notmatch 'package:') { throw 'Тестовый пакет не установлен. Выполните первый ручной START-TESTS.cmd, не используйте scheduler для установки.' }

  # Test run IDs avoid clearing any app data, including previous test-only data.
  Write-Host 'Запуск проверок WebView, журнала Varroa и архива...'
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'force-stop', $Package))
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'start', '-n', ($Package + '/.MainActivity'),
    '--es', 'paseka_run_id', $RunId, '--ez', 'paseka_require_offline', $(if ($Offline) { 'true' } else { 'false' })))
  $TestAppLaunched = $true
  $StageOne = Wait-Report -Serial $Serial -Phases @('awaiting_restart', 'complete') -TimeoutSec 150
  Capture-TestScreen -Serial $Serial -Label 'before-restart'
  if ($Offline -and ($StageOne.mode -ne 'manual-offline' -or @($StageOne.checks).Count -ne 8)) {
    throw 'Offline phase one must show 8/8 checks and native offline mode.'
  }
  if ($StageOne.phase -ne 'awaiting_restart') {
    $FinalReport = $StageOne
    throw 'Тестовый модуль завершился аварийно до контрольного перезапуска.'
  }

  Write-Host 'Проверка сохранности после настоящей остановки и повторного запуска приложения...'
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'force-stop', $Package))
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'start', '-n', ($Package + '/.MainActivity'),
    '--es', 'paseka_run_id', $RunId, '--ez', 'paseka_require_offline', $(if ($Offline) { 'true' } else { 'false' })))
  $FinalReport = Wait-Report -Serial $Serial -Phases @('complete') -TimeoutSec 90
  Capture-TestScreen -Serial $Serial -Label 'after-restart'
  if ($Offline -and ($FinalReport.mode -ne 'manual-offline' -or @($FinalReport.checks).Count -ne 11)) {
    throw 'Offline final report must show 11/11 checks and native offline mode.'
  }
  if (!$Offline -and ($FinalReport.mode -ne 'normal' -or @($FinalReport.checks).Count -ne 9)) {
    throw 'Normal final report must show 9/9 checks.'
  }
  if (!$FinalReport.pass) { throw 'Одна или несколько проверок завершились неуспешно. Детали в отчёте.' }
} catch {
  $Fatal = $_.Exception.Message
  if ($TestAppLaunched) {
    # Capture only after launching the isolated test package.
    Capture-TestScreen -Serial $Serial -Label 'failure'
  }
} finally {
  [void](New-Item -ItemType Directory -Force -Path $ReportDir)
  $summary = [ordered]@{
    format = 'paseka-windows-test-report-v1'
    status = $(if (!$Fatal -and $null -ne $FinalReport -and $FinalReport.pass) { 'PASS' } else { 'FAIL' })
    mode = $(if ($Offline) { 'manual-offline' } else { 'normal' })
    runId = $RunId
    testedPackage = $Package
    error = $Fatal
    phaseOne = $StageOne
    final = $FinalReport
    limits = $(if ($Offline) {
      @('Native file picker NOT tested', 'Network absence checked by Android native capabilities; not a production app test', 'Human screen legibility NOT tested')
    } else {
      @('Native file picker NOT tested; Downloads file verification is reported separately', 'Network offline NOT tested', 'Human screen legibility NOT tested')
    })
  }
  $out = Join-Path $ReportDir 'report.json'
  $summary | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $out -Encoding UTF8
  Write-Host ''
  Write-Host ('Отчёт: ' + $out)
  if ($Fatal) {
    Write-Host ('РЕЗУЛЬТАТ: FAIL — ' + $Fatal) -ForegroundColor Red
    exit 1
  }
  Write-Host 'РЕЗУЛЬТАТ: PASS. Приложите report.json и before-restart.png к сообщению в ChatGPT.' -ForegroundColor Green
}
