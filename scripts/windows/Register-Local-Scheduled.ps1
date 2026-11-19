param(
  [Parameter(Mandatory = $true)][string]$DailyAt,
  [switch]$Install
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$TaskName = 'Paseka-Local-Android-Selftest'
$Runner = Join-Path $PSScriptRoot 'Run-Local-Scheduled.ps1'
if ($DailyAt -cnotmatch '^([01][0-9]|2[0-3]):[0-5][0-9]$') {
  throw 'DailyAt must be HH:mm (24-hour clock).'
}
if (!(Test-Path -LiteralPath $Runner)) { throw 'Missing local scheduler runner.' }
# Only the Windows interactive account may run this task, without elevation,
# saved passwords, a hosted runner, downloads, network telemetry or auto-upgrade.
if (!$Install) {
  Write-Host ('PREVIEW ONLY: local daily task ' + $TaskName + ' at ' + $DailyAt)
  Write-Host 'To register after the SAME kit produces a manual 9/9 PASS:'
  Write-Host ('.\Register-Local-Scheduled.ps1 -DailyAt ' + $DailyAt + ' -Install')
  exit 0
}
$probe = & (Join-Path $PSHOME 'powershell.exe') -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $Runner
if ($LASTEXITCODE -ne 0) { throw 'Local kit not approved: a matching manual 8/8 PASS and valid APK hash are required.' }
Import-Module ScheduledTasks -ErrorAction Stop
if ($null -ne (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
  throw 'Task already exists. Refusing to replace an existing schedule.'
}
$at = [DateTime]::ParseExact($DailyAt, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
$action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument (
  '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $Runner + '" -Run'
) -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $at
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 12) -MultipleInstances IgnoreNew -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Paseka: local, no-install, test-only Android checks; signed-in account, USB required' -ErrorAction Stop | Out-Null
Write-Host ('Registered local task ' + $TaskName + ' at ' + $DailyAt + '. No test was launched.')
