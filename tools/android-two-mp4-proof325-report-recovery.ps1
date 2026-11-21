# READ-ONLY diagnostic by default. -Resume permits ONE force-stop/relaunch of proof325
# ONLY after a verified INITIAL_PASS record. Never installs, uninstalls, clears or deletes.
[CmdletBinding()]
param([switch]$Resume)
$ErrorActionPreference = 'Stop'
$pkg = 'ru.paseka.journal.archive.proof325'
$reportFile = 'files/paseka-two-mp4-proof.ndjson'
$expected = @(
  '794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
  'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'
)
function AdbBytes([string[]]$argv) {
  # Bypass Windows PowerShell native pipeline text conversion and merged stderr.
  $exe = (Get-Command adb -CommandType Application -ErrorAction Stop).Source
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $exe
  # Arguments are hard-coded by this script; none contains a shell metacharacter.
  $info.Arguments = ($argv -join ' ')
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $info
  $ms = New-Object System.IO.MemoryStream
  try {
    if (-not $proc.Start()) { throw 'ADB_PROCESS_START_FAILED' }
    $proc.StandardOutput.BaseStream.CopyTo($ms)
    # stderr is read separately and is never parsed as report JSON.
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    if ($ms.Length -gt 131072) { throw 'ADB_OUTPUT_TOO_LARGE' }
    return [pscustomobject]@{ Code=$proc.ExitCode; Bytes=$ms.ToArray(); ErrorText=($stderr -replace '[^a-zA-Z0-9_ .:-]','?') }
  } finally { $ms.Dispose(); $proc.Dispose() }
}
function Utf8([byte[]]$bytes) {
  $decoder = New-Object System.Text.UTF8Encoding($false,$true)
  return $decoder.GetString($bytes)
}
function ReadAdb([string[]]$argv) {
  $r = AdbBytes $argv
  if ($r.Code -ne 0) { throw ('ADB_FAILED_' + $r.Code + '_'+ $argv[0]) }
  return (Utf8 $r.Bytes).Trim()
}
function ReportSnapshot {
  $r = AdbBytes @('-d','exec-out','run-as',$pkg,'cat',$reportFile)
  if ($r.Code -ne 0) {
    Write-Host ('REPORT_READ: BLOCKED | adb_exit=' + $r.Code)
    throw 'RUN_AS_REPORT_UNREADABLE'
  }
  if ($r.Bytes.Length -lt 2 -or $r.Bytes.Length -gt 65536) { throw 'REPORT_BYTE_SIZE_INVALID' }
  $hash = [Security.Cryptography.SHA256]::Create()
  try { $digest = [BitConverter]::ToString($hash.ComputeHash($r.Bytes)).Replace('-','').ToLowerInvariant() }
  finally { $hash.Dispose() }
  Write-Host ('REPORT_BYTES: ' + $r.Bytes.Length)
  Write-Host ('REPORT_SHA256: ' + $digest)
  $raw = Utf8 $r.Bytes
  # Detect a *literal* escaped separator written by a native bridge, if present.
  # Never modify the JSON objects themselves.
  $separator = [string][char]92 + 'n'
  $raw = $raw.Replace('}' + $separator + '{', '}' + [string][char]10 + '{')
  if ($raw.EndsWith($separator)) { $raw = $raw.Substring(0,$raw.Length-$separator.Length) }
  $items = @($raw -split '[\r\n]+' | Where-Object { $_.Trim().Length -gt 0 })
  Write-Host ('REPORT_LINES: ' + $items.Count)
  if ($items.Count -lt 1 -or $items.Count -gt 2) { throw 'REPORT_LINE_COUNT_INVALID' }
  $checked = @()
  for ($i=0; $i -lt $items.Count; $i++) {
    $line = $items[$i].Trim()
    try { $value = ConvertFrom-Json -InputObject $line -ErrorAction Stop }
    catch {
      # No raw user text printed, only a bounded hexadecimal prefix for diagnosis.
      $prefix = [Text.Encoding]::UTF8.GetBytes($line.Substring(0,[Math]::Min(24,$line.Length)))
      Write-Host ('REPORT_LINE_'+($i+1)+'_PREFIX_HEX: '+ [BitConverter]::ToString($prefix).Replace('-',''))
      throw 'REPORT_JSON_INVALID'
    }
    if ($value.proofVersion -ne 1 -or $value.packageId -ne $pkg -or
      $value.cleanupAuthorized -ne $false -or $value.recognitionSucceeded -ne $false -or
      $value.videoCount -ne 2 -or $value.archiveVersion -ne 1 -or
      @($value.sourceSha256).Count -ne 2 -or
      $value.sourceSha256[0] -cne $expected[0] -or $value.sourceSha256[1] -cne $expected[1] -or
      $value.archiveSha256 -cnotmatch '^[a-f0-9]{64}$') {
      throw 'REPORT_EVIDENCE_FIELDS_INVALID'
    }
    if ($i -eq 0 -and $value.status -cne 'INITIAL_PASS') { throw 'REPORT_INITIAL_STAGE_INVALID' }
    if ($i -eq 1 -and $value.status -cne 'RELAUNCH_PASS') { throw 'REPORT_RELAUNCH_STAGE_INVALID' }
    $checked += $value
    Write-Host ('REPORT_'+($i+1)+'_STATUS: '+$value.status)
  }
  return ,$checked
}
try {
  $devices = ReadAdb @('devices','-l')
  $connected = @($devices -split '[\r\n]+' | Where-Object { $_ -match '^\S+\s+device\s+' })
  $unavailable = @($devices -split '[\r\n]+' | Where-Object { $_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)\b' })
  if ($connected.Count -ne 1 -or $unavailable.Count -gt 0) { throw 'ONE_USB_DEVICE_REQUIRED' }
  if ((ReadAdb @('-d','shell','getprop','ro.product.model')) -cne 'NE2213' -or
      (ReadAdb @('-d','shell','getprop','ro.build.version.sdk')) -cne '36') {
    throw 'EXPECTED_DEVICE_MISMATCH'
  }
  if ((ReadAdb @('-d','shell','pm','path',$pkg)) -notmatch '^package:') { throw 'PROOF_PACKAGE_NOT_INSTALLED' }
  Write-Host 'DEVICE: NE2213 / API36'
  Write-Host 'PACKAGE: EXISTING_PROOF325 | NO INSTALL OR RESET'
  $records = @(ReportSnapshot)
  if ($records.Count -eq 2) {
    Write-Host 'STATUS: ISOLATED_ANDROID_TWO_MP4_EXPORT_PASS'
  } elseif ($records.Count -eq 1 -and $records[0].status -eq 'INITIAL_PASS') {
    if (-not $Resume) {
      Write-Host 'RELAUNCH: NOT_TESTED'
      Write-Host 'STATUS: INITIAL_ANDROID_TWO_MP4_EXPORT_VERIFIED'
    } else {
      Write-Host 'INITIAL_PROOF: VERIFIED; STOP/RELAUNCH ONLY PROOF325'
      $null = ReadAdb @('-d','shell','am','force-stop',$pkg)
      $launch = ReadAdb @('-d','shell','monkey','-p',$pkg,'-c','android.intent.category.LAUNCHER','1')
      if ($launch -notmatch 'Events injected:\s*1') { throw 'PROOF_RELAUNCH_NOT_CONFIRMED' }
      $completed = $false
      for($i=0;$i -lt 30;$i++) {
        Start-Sleep -Milliseconds 750
        $next = @(ReportSnapshot)
        if ($next.Count -eq 2) { $completed = $true; break }
      }
      if (-not $completed) { throw 'SECOND_REPORT_TIMEOUT' }
      Write-Host 'STATUS: ISOLATED_ANDROID_TWO_MP4_EXPORT_PASS'
    }
  } else { throw 'UNEXPECTED_REPORT_STATE' }
  Write-Host 'PHYSICAL_MP4_DECODER: NOT_TESTED'
  Write-Host 'ORIGINAL_VIDEO_CLEANUP: NOT_AUTHORIZED'
} catch {
  Write-Host 'STATUS: BLOCKED'
  Write-Host ('DETAIL: ' + $_.Exception.Message)
  Write-Host 'FILES_DELETED: NONE | PACKAGES_UNINSTALLED: NONE'
  exit 2
}
