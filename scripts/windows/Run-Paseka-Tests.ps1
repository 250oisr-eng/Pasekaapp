Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [Console]::OutputEncoding

# Only the separate debug package is installed, launched and force-stopped.
$PackagePath = Join-Path $PSScriptRoot 'device-package.txt'
if (!(Test-Path -LiteralPath $PackagePath)) {
  Write-Host 'Нет файла идентификатора тестового APK: устройство не затронуто.' -ForegroundColor Red
  exit 1
}
$Package = (Get-Content -LiteralPath $PackagePath -Raw).Trim()
if ($Package -cnotmatch '^ru\.paseka\.journal\.device\.r[0-9]{6,20}a[1-9][0-9]{0,3}
$Adb = Join-Path $PSScriptRoot 'platform-tools\adb.exe'
$Apk = Join-Path $PSScriptRoot 'paseka-device-test.apk'
$ChecksumPath = Join-Path $PSScriptRoot 'paseka-device-test.sha256'
$Reports = Join-Path $PSScriptRoot 'reports'
$RunId = [guid]::NewGuid().ToString('N')
$RunId = $RunId.Substring(0, 20)
$ReportDir = Join-Path $Reports (Get-Date -Format 'yyyyMMdd-HHmmss')
$StageOne = $null
$FinalReport = $null
$Fatal = ''

function Invoke-ADB {
  param([string[]]$Arguments)
  $text = & $Adb @Arguments
  if ($LASTEXITCODE -ne 0) { throw ('ADB command failed: ' + ($Arguments -join ' ')) }
  return $text
}
function Read-DeviceReport {
  param([string]$Serial)
  $lines = & $Adb -s $Serial shell run-as $Package cat files/paseka-device-report.json 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  try { return (($lines -join "`n") | ConvertFrom-Json) } catch { return $null }
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
  Write-Host 'Подключите телефон по USB. На телефоне подтвердите разрешение отладки, если появится запрос.'
  [void](Invoke-ADB -Arguments @('start-server'))
  $Serial = ''
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $deviceText = & $Adb devices
    $connected = @($deviceText | ForEach-Object {
      if ($_ -match '^([^\s]+)\s+device\s*$') { $Matches[1] }
    })
    if ($connected.Count -eq 1) { $Serial = $connected[0]; break }
    if ($connected.Count -gt 1) { throw 'Подключено несколько устройств. Оставьте одно Android-устройство.' }
    Start-Sleep -Seconds 2
  }
  if (!$Serial) { throw 'Устройство не обнаружено или USB-отладка не разрешена. Проверьте драйвер и разрешение на телефоне.' }
  $sdk = [int]((Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'getprop', 'ro.build.version.sdk') | Select-Object -First 1).Trim())
  if ($sdk -lt 35) {
    throw ('На телефоне Android SDK ' + $sdk + '. Изолированная APK требует Android 15 (SDK 35) или новее.')
  }
  Write-Host ('USB-соединение установлено. Установка отдельного тестового пакета: ' + $Package)
  $install = (Invoke-ADB -Arguments @('-s', $Serial, 'install', '-r', $Apk) | Out-String).Trim()
  if ($install -notmatch 'Success') { throw ('ADB не подтвердил установку: ' + $install) }
  $pkgPath = (Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'pm', 'path', $Package) | Out-String)
  if ($pkgPath -notmatch 'package:') { throw 'После установки тестовый пакет не обнаружен.' }

  # Test run IDs avoid clearing any app data, including previous test-only data.
  Write-Host 'Запуск проверок WebView, журнала Varroa и архива...'
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'force-stop', $Package))
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'start', '-n', ($Package + '/.MainActivity'),
    '--es', 'paseka_run_id', $RunId))
  $StageOne = Wait-Report -Serial $Serial -Phases @('awaiting_restart', 'complete') -TimeoutSec 150
  Capture-TestScreen -Serial $Serial -Label 'before-restart'
  if ($StageOne.phase -ne 'awaiting_restart') {
    $FinalReport = $StageOne
    throw 'Тестовый модуль завершился аварийно до контрольного перезапуска.'
  }

  Write-Host 'Проверка сохранности после настоящей остановки и повторного запуска приложения...'
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'force-stop', $Package))
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'start', '-n', ($Package + '/.MainActivity'),
    '--es', 'paseka_run_id', $RunId))
  $FinalReport = Wait-Report -Serial $Serial -Phases @('complete') -TimeoutSec 90
  Capture-TestScreen -Serial $Serial -Label 'after-restart'
  if (!$FinalReport.pass) { throw 'Одна или несколько проверок завершились неуспешно. Детали в отчёте.' }
} catch {
  $Fatal = $_.Exception.Message
} finally {
  [void](New-Item -ItemType Directory -Force -Path $ReportDir)
  $summary = [ordered]@{
    format = 'paseka-windows-test-report-v1'
    status = $(if (!$Fatal -and $null -ne $FinalReport -and $FinalReport.pass) { 'PASS' } else { 'FAIL' })
    runId = $RunId
    testedPackage = $Package
    error = $Fatal
    phaseOne = $StageOne
    final = $FinalReport
    limits = @('Native file picker NOT tested; Downloads file verification is reported separately', 'Network offline NOT tested', 'Human screen legibility NOT tested')
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
) {
  Write-Host 'Некорректный идентификатор изолированной APK: установка отменена.' -ForegroundColor Red
  exit 1
}
$Adb = Join-Path $PSScriptRoot 'platform-tools\adb.exe'
$Apk = Join-Path $PSScriptRoot 'paseka-device-test.apk'
$ChecksumPath = Join-Path $PSScriptRoot 'paseka-device-test.sha256'
$Reports = Join-Path $PSScriptRoot 'reports'
$RunId = [guid]::NewGuid().ToString('N')
$RunId = $RunId.Substring(0, 20)
$ReportDir = Join-Path $Reports (Get-Date -Format 'yyyyMMdd-HHmmss')
$StageOne = $null
$FinalReport = $null
$Fatal = ''

function Invoke-ADB {
  param([string[]]$Arguments)
  $text = & $Adb @Arguments
  if ($LASTEXITCODE -ne 0) { throw ('ADB command failed: ' + ($Arguments -join ' ')) }
  return $text
}
function Read-DeviceReport {
  param([string]$Serial)
  $lines = & $Adb -s $Serial shell run-as $Package cat files/paseka-device-report.json 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  try { return (($lines -join "`n") | ConvertFrom-Json) } catch { return $null }
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
  Write-Host 'Подключите телефон по USB. На телефоне подтвердите разрешение отладки, если появится запрос.'
  [void](Invoke-ADB -Arguments @('start-server'))
  $Serial = ''
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $deviceText = & $Adb devices
    $connected = @($deviceText | ForEach-Object {
      if ($_ -match '^([^\s]+)\s+device\s*$') { $Matches[1] }
    })
    if ($connected.Count -eq 1) { $Serial = $connected[0]; break }
    if ($connected.Count -gt 1) { throw 'Подключено несколько устройств. Оставьте одно Android-устройство.' }
    Start-Sleep -Seconds 2
  }
  if (!$Serial) { throw 'Устройство не обнаружено или USB-отладка не разрешена. Проверьте драйвер и разрешение на телефоне.' }
  $sdk = [int]((Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'getprop', 'ro.build.version.sdk') | Select-Object -First 1).Trim())
  if ($sdk -lt 35) {
    throw ('На телефоне Android SDK ' + $sdk + '. Изолированная APK требует Android 15 (SDK 35) или новее.')
  }
  Write-Host 'USB-соединение установлено. Установка проверенной тестовой APK...'
  $install = (Invoke-ADB -Arguments @('-s', $Serial, 'install', '-r', $Apk) | Out-String).Trim()
  if ($install -notmatch 'Success') { throw ('ADB не подтвердил установку: ' + $install) }
  $pkgPath = (Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'pm', 'path', $Package) | Out-String)
  if ($pkgPath -notmatch 'package:') { throw 'После установки тестовый пакет не обнаружен.' }

  # Test run IDs avoid clearing any app data, including previous test-only data.
  Write-Host 'Запуск проверок WebView, журнала Varroa и архива...'
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'force-stop', $Package))
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'start', '-n', ($Package + '/.MainActivity'),
    '--es', 'paseka_run_id', $RunId))
  $StageOne = Wait-Report -Serial $Serial -Phases @('awaiting_restart', 'complete') -TimeoutSec 150
  Capture-TestScreen -Serial $Serial -Label 'before-restart'
  if ($StageOne.phase -ne 'awaiting_restart') {
    $FinalReport = $StageOne
    throw 'Тестовый модуль завершился аварийно до контрольного перезапуска.'
  }

  Write-Host 'Проверка сохранности после настоящей остановки и повторного запуска приложения...'
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'force-stop', $Package))
  [void](Invoke-ADB -Arguments @('-s', $Serial, 'shell', 'am', 'start', '-n', ($Package + '/.MainActivity'),
    '--es', 'paseka_run_id', $RunId))
  $FinalReport = Wait-Report -Serial $Serial -Phases @('complete') -TimeoutSec 90
  Capture-TestScreen -Serial $Serial -Label 'after-restart'
  if (!$FinalReport.pass) { throw 'Одна или несколько проверок завершились неуспешно. Детали в отчёте.' }
} catch {
  $Fatal = $_.Exception.Message
} finally {
  [void](New-Item -ItemType Directory -Force -Path $ReportDir)
  $summary = [ordered]@{
    format = 'paseka-windows-test-report-v1'
    status = $(if (!$Fatal -and $null -ne $FinalReport -and $FinalReport.pass) { 'PASS' } else { 'FAIL' })
    runId = $RunId
    testedPackage = $Package
    error = $Fatal
    phaseOne = $StageOne
    final = $FinalReport
    limits = @('Native file picker NOT tested; Downloads file verification is reported separately', 'Network offline NOT tested', 'Human screen legibility NOT tested')
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
