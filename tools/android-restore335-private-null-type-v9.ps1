# Physical OnePlus device preflight. Read-only: no install, launch, push, pull, restore, deletion or user-media access.
# Exits 0 only when pinned ADB and exactly one expected authorized phone are confirmed.
[CmdletBinding()]
param(
  [string]$AdbPath = (Join-Path $env:TEMP 'paseka-offline-platformtools-43f92107c17d47d7a2853a42348efe9b\platform-tools\adb.exe')
)
$ErrorActionPreference = 'Stop'
$expectedAdbSha256 = 'bae5ce98846b19caa74a34900850caa8b21d01976932b2ad83baeb5de5651aee'
$report = [ordered]@{
  stage = 'ANDROID_RESTORE335_NULL_TYPE_V9'
  status = 'BLOCKED'
  adb = 'NOT_TESTED'
  device = 'NOT_TESTED'
  model = 'NOT_TESTED'
  sdk = 'NOT_TESTED'
  diagnosticPackage = 'NOT_TESTED'
  productionPackage = 'NOT_TESTED'
  adbSha256 = 'NOT_TESTED'
  installs = 'NOT_ATTEMPTED'
  writes = 'NOT_ATTEMPTED'
  mediaRead = 'NOT_ATTEMPTED'
  packagePathFirst = 'NOT_TESTED'
  packageList = 'NOT_TESTED'
  packagePathSecond = 'NOT_TESTED'
  directoryTest = 'NOT_TESTED'
  pathTest = 'NOT_TESTED'
  privateDirectory = 'NOT_TESTED'
  privateFilesClass = 'NOT_TESTED'
  privateInput = 'NOT_TESTED'
  privateEntryCount = 'NOT_TESTED'
  privateEntryType = 'NOT_TESTED'
  typeEvidence = 'NOT_TESTED'
  cleanup = 'NOT_AUTHORIZED'
  detail = 'NOT_STARTED'
}
function Call-Adb([string[]]$Arguments, [switch]$AllowMissingPackage, [switch]$AllowReadOnlyTestFalse, [switch]$PreserveListing, [switch]$FindTypeListing) {
  # Capture stderr separately: Windows PowerShell 5.1 throws on harmless native stderr.
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $script:AdbPath
  $start.Arguments = ($Arguments -join ' ')
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $start
  try {
    if (-not $p.Start()) { throw 'ADB_START_FAILED' }
    $stdout = $p.StandardOutput.ReadToEndAsync()
    $stderr = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit(15000)) {
      try { $p.Kill() } catch { }
      [void]$p.WaitForExit(2000)
      throw 'ADB_TIMEOUT_15S'
    }
    $out = $stdout.GetAwaiter().GetResult()
    $err = $stderr.GetAwaiter().GetResult()
    if ($out.Length -gt 8192 -or $err.Length -gt 8192) { throw 'ADB_OUTPUT_TOO_LARGE' }
    if ($p.ExitCode -ne 0) {
      # Only exit=1 with no output for one of two exact read-only toybox tests
      # means a false predicate. Never generalize errors or authorize writes.
      $isPrivateTest = $Arguments.Count -eq 9 -and
        $Arguments[0] -ceq '-s' -and
        $Arguments[2] -ceq 'exec-out' -and
        $Arguments[3] -ceq 'run-as' -and
        $Arguments[4] -ceq 'ru.paseka.journal.archive.restoreproof335' -and
        $Arguments[5] -ceq '/system/bin/toybox' -and
        $Arguments[6] -ceq 'test' -and
        $Arguments[7] -in @('-d','-e') -and
        $Arguments[8] -ceq 'files'
      if ($AllowReadOnlyTestFalse -and $isPrivateTest -and $p.ExitCode -eq 1 -and
          $out.Length -eq 0 -and [string]::IsNullOrWhiteSpace($err)) {
        return '__TEST_FALSE__'
      }
      # Android 'pm path' can return 1 for an absent package. Accept only
      # exactly this read-only query with empty stdout/stderr; all other
      # nonzero exits remain failures. Do not confuse permission errors
      # or service failures with package absence.
      $isPackageQuery = $Arguments.Count -eq 6 -and
        $Arguments[0] -ceq '-s' -and
        $Arguments[2] -ceq 'shell' -and
        $Arguments[3] -ceq 'pm' -and
        $Arguments[4] -ceq 'path' -and
        $Arguments[5] -in @('ru.paseka.journal', 'ru.paseka.journal.archive.restoreproof335')
      if ($AllowMissingPackage -and $isPackageQuery -and $p.ExitCode -eq 1 -and
          $out.Length -eq 0 -and [string]::IsNullOrWhiteSpace($err)) {
        return '__PACKAGE_ABSENT__'
      }
      throw ('ADB_COMMAND_FAILED_' + $p.ExitCode)
    }
    if (-not [string]::IsNullOrWhiteSpace($err)) {
      $lines = @($err -split '[\r\n]+' | Where-Object { $_.Trim().Length -gt 0 })
      foreach ($line in $lines) {
        $oldDaemon = $line -match '^adb server version \(\d+\) doesn.t match this client \(\d+\); killing\.\.\.$'
        $daemonStarted = $line -match '^\* daemon (?:not running; starting now at tcp:5037|started successfully)$'
        if (-not ($oldDaemon -or $daemonStarted)) { throw 'ADB_UNEXPECTED_STDERR' }
      }
    }
    if ($FindTypeListing) {
      # Only the whitelisted shallow read-only Toybox find; no user path input.
      $types = @('f','d','l','b','c','p','s')
      $allowedFind = $Arguments.Count -eq 15 -and
        $Arguments[0] -ceq '-s' -and $Arguments[2] -ceq 'exec-out' -and
        $Arguments[3] -ceq 'run-as' -and
        $Arguments[4] -ceq 'ru.paseka.journal.archive.restoreproof335' -and
        $Arguments[5] -ceq '/system/bin/toybox' -and
        $Arguments[6] -ceq 'find' -and $Arguments[7] -ceq 'files' -and
        $Arguments[8] -ceq '-mindepth' -and $Arguments[9] -ceq '1' -and
        $Arguments[10] -ceq '-maxdepth' -and $Arguments[11] -ceq '1' -and
        $Arguments[12] -ceq '-type' -and $Arguments[13] -cin $types -and
        $Arguments[14] -ceq '-print0'
      if (-not $allowedFind) { throw 'UNPINNED_PRIVATE_FIND_REQUEST' }
      # Do not trim anything: null-delimited raw output is binary evidence.
      return $out
    }
    if ($PreserveListing) {
      $exactListing = $Arguments.Count -eq 9 -and
        $Arguments[0] -ceq '-s' -and $Arguments[2] -ceq 'exec-out' -and
        $Arguments[3] -ceq 'run-as' -and
        $Arguments[4] -ceq 'ru.paseka.journal.archive.restoreproof335' -and
        $Arguments[5] -ceq '/system/bin/toybox' -and
        $Arguments[6] -ceq 'ls' -and $Arguments[7] -ceq '-A' -and $Arguments[8] -ceq 'files'
      if (-not $exactListing) { throw 'UNPINNED_PRIVATE_LISTING_REQUEST' }
      # Strip only transport newline; never strip meaningful spaces in filenames.
      return $out.TrimEnd([char[]]@([char]13,[char]10))
    }
    return $out.Trim()
  } finally {
    $p.Dispose()
  }
}

# Pure parser: count zero or one NUL-terminated record, never return path text.
function Test-SingleNullRecord([string]$Observed) {
  if ($Observed.Length -eq 0) { return 0 }
  if ($Observed.Length -gt 4096) { throw 'PRIVATE_FIND_NULL_OUTPUT_TOO_LARGE' }
  if ($Observed.Length -lt 2 -or
      $Observed.IndexOf([char]0) -ne ($Observed.Length - 1)) {
    throw 'PRIVATE_FIND_NULL_FRAMING_UNVERIFIED'
  }
  return 1
}

try {
  if (-not (Test-Path -LiteralPath $AdbPath -PathType Leaf)) { throw 'PINNED_ADB_MISSING' }
  $hash = (Get-FileHash -LiteralPath $AdbPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -cne $expectedAdbSha256) { throw 'ADB_BINARY_HASH_MISMATCH' }
  $report.adbSha256 = 'PASS_PINNED'
  $version = Call-Adb @('version')
  if ($version -notmatch '(?m)^Android Debug Bridge version 1[.]0[.](\d+)\s*$') { throw 'ADB_VERSION_UNRECOGNIZED' }
  if ([int]$Matches[1] -lt 41) { throw 'ADB_VERSION_TOO_OLD' }
  $report.adb = 'PASS'
  $deviceOutput = Call-Adb @('devices','-l')
  $ready = @($deviceOutput -split '[\r\n]+' | Where-Object { $_ -match '^(\S+)\s+device(?:\s|$)' })
  $all = @($deviceOutput -split '[\r\n]+' | Where-Object { $_ -match '^\S+\s+(device|offline|unauthorized|recovery|sideload)(?:\s|$)' })
  if ($ready.Count -ne 1 -or $all.Count -ne 1) { throw 'ONE_AUTHORIZED_DEVICE_REQUIRED' }
  $serial = [regex]::Match($ready[0], '^(\S+)\s+device').Groups[1].Value
  if ($serial -notmatch '^[A-Za-z0-9._:-]+$') { throw 'UNEXPECTED_ADB_SERIAL' }
  $report.device = 'PASS_ONE_AUTHORIZED'
  $model = Call-Adb @('-s',$serial,'shell','getprop','ro.product.model')
  $sdk = Call-Adb @('-s',$serial,'shell','getprop','ro.build.version.sdk')
  if ($model -cne 'NE2213') { throw 'NOT_PINNED_ONEPLUS_NE2213' }
  $report.model = 'PASS_NE2213'
  if ($sdk -cne '36') { throw 'NOT_PINNED_API_36' }
  $report.sdk = 'PASS_API36'
  $pkg = Call-Adb @('-s',$serial,'shell','pm','path','ru.paseka.journal') -AllowMissingPackage
  if ($pkg -ceq '__PACKAGE_ABSENT__') {
    $report.productionPackage = 'ABSENT'
  } elseif ($pkg -match '(?m)^package:') {
    $report.productionPackage = 'PRESENT_UNTOUCHED'
  } else { throw 'PRODUCTION_PACKAGE_QUERY_UNVERIFIED' }
  $testPkg = Call-Adb @('-s',$serial,'shell','pm','path','ru.paseka.journal.archive.restoreproof335') -AllowMissingPackage
  if ($testPkg -ceq '__PACKAGE_ABSENT__') {
    $report.diagnosticPackage = 'ABSENT'
  } elseif ($testPkg -match '(?m)^package:') {
    $report.diagnosticPackage = 'PRESENT_UNTOUCHED'
  } else { throw 'DIAGNOSTIC_PACKAGE_QUERY_UNVERIFIED' }
  # Three independent PackageManager observations, all read-only.
  # Do not trust a single negative result or infer uninstallation.
  $target = 'ru.paseka.journal.archive.restoreproof335'
  $report.packagePathFirst = $(if ($report.diagnosticPackage -ceq 'PRESENT_UNTOUCHED') { 'PRESENT' } else { 'ABSENT_OR_UNVERIFIED' })
  $listing = Call-Adb @('-s',$serial,'shell','pm','list','packages','--user','0',$target)
  $entries = @($listing -split '[\r\n]+' | Where-Object { $_.Length -gt 0 })
  if ($entries.Count -eq 0) {
    $report.packageList = 'NO_MATCH_USER0'
  } elseif ($entries.Count -eq 1 -and $entries[0] -ceq ('package:' + $target)) {
    $report.packageList = 'PRESENT_USER0'
  } else {
    $report.packageList = 'UNVERIFIED'
    throw 'PACKAGE_LIST_AMBIGUOUS_PRESERVE'
  }
  $again = Call-Adb @('-s',$serial,'shell','pm','path',$target) -AllowMissingPackage
  if ($again -ceq '__PACKAGE_ABSENT__') {
    $report.packagePathSecond = 'ABSENT'
  } elseif ($again -match '(?m)^package:') {
    $report.packagePathSecond = 'PRESENT'
  } else {
    $report.packagePathSecond = 'UNVERIFIED'
    throw 'SECOND_PACKAGE_PATH_AMBIGUOUS_PRESERVE'
  }
  if ($report.packagePathFirst -cne 'PRESENT' -or
      $report.packageList -cne 'PRESENT_USER0' -or
      $report.packagePathSecond -cne 'PRESENT') {
    $report.diagnosticPackage = 'UNVERIFIED_PRESERVE'
    throw 'PACKAGE_IDENTITY_INCONSISTENT_OR_ABSENT_NO_PRIVATE_ACCESS'
  }
  # Read-only, isolated diagnostic package only. No app launch or archive access.
  $privatePackage = 'ru.paseka.journal.archive.restoreproof335'
  $cwd = Call-Adb @('-s',$serial,'exec-out','run-as',$privatePackage,'/system/bin/toybox','pwd')
  if ($cwd -cne ('/data/user/0/' + $privatePackage)) { throw 'PRIVATE_CWD_NOT_PINNED' }
  # The previous stat implementation produced an ambiguous physical result.
  # Boolean Toybox predicates are restricted to exactly this private package.
  $isDir = Call-Adb @('-s',$serial,'exec-out','run-as',$privatePackage,'/system/bin/toybox','test','-d','files') -AllowReadOnlyTestFalse
  $isAny = Call-Adb @('-s',$serial,'exec-out','run-as',$privatePackage,'/system/bin/toybox','test','-e','files') -AllowReadOnlyTestFalse
  if ($isDir -cne '' -and $isDir -cne '__TEST_FALSE__') { throw 'PRIVATE_DIRECTORY_TEST_UNEXPECTED_OUTPUT' }
  if ($isAny -cne '' -and $isAny -cne '__TEST_FALSE__') { throw 'PRIVATE_PATH_TEST_UNEXPECTED_OUTPUT' }
  $report.directoryTest = $(if ($isDir -ceq '') { 'TRUE' } else { 'FALSE' })
  $report.pathTest = $(if ($isAny -ceq '') { 'TRUE' } else { 'FALSE' })
  if ($isDir -ceq '__TEST_FALSE__' -and $isAny -ceq '__TEST_FALSE__') {
    $report.privateDirectory = 'ABSENT_BY_TWO_TESTS_UNVERIFIED'
    $report.privateFilesClass = 'NOT_READ'
    $report.privateEntryCount = 'NOT_READ'
    $report.privateEntryType = 'NOT_READ'
    $report.typeEvidence = 'NOT_READ'
    $report.privateInput = 'NOT_TESTED'
    $report.status = 'PASS'
    $report.detail = 'READ_ONLY_PRIVATE_PATH_NOT_PRESENT_BY_TESTS_NO_WRITE'
  } elseif ($isDir -ceq '' -and $isAny -ceq '') {
    $report.privateDirectory = 'PASS_PRESENT_DIRECTORY'
    $inventory = Call-Adb @('-s',$serial,'exec-out','run-as',$privatePackage,'/system/bin/toybox','ls','-A','files') -PreserveListing
    if ($inventory.Length -eq 0) {
      $report.privateFilesClass = 'EMPTY'
      $report.privateEntryCount = '0'
      $report.privateEntryType = 'NOT_APPLICABLE'
      $report.typeEvidence = 'NOT_APPLICABLE'
      $report.privateInput = 'ABSENT_IN_EMPTY_LISTING'
      $report.status = 'PASS'
      $report.detail = 'READ_ONLY_PRIVATE_DIRECTORY_EMPTY_NO_ARCHIVE_READ'
    } else {
      # Inventory names stay in process memory, never in JSON or logs.
      # No per-entry access, no stat, traversal, hashing, restore or writes.
      # A nonempty app-private folder is not proof of restore input.
      if ($inventory.IndexOf([char]0) -ge 0) { throw 'PRIVATE_LISTING_BINARY_UNVERIFIED' }
      $names = @($inventory -split "\r?\n" | Where-Object { $_.Length -gt 0 })
      if ($names.Count -lt 1 -or $names.Count -gt 64) {
        throw 'PRIVATE_LISTING_COUNT_UNVERIFIED'
      }
      $report.privateEntryCount = [string]$names.Count
      $report.privateFilesClass = 'NONEMPTY_PRESERVE'
      $report.privateInput = 'UNKNOWN_PRESERVE'
      if ($names.Count -ne 1 -or $names[0] -match '[\x00-\x1F\x7F]') {
        throw 'PRIVATE_ENTRY_IDENTITY_UNVERIFIED'
      }
      # Shallow null-delimited find results are counted, never compared to
      # textual path spelling. Do not output the names, paths or raw stdout.
      $matchedTypes = @()
      $matchedBytes = @{}
      foreach ($kind in @('f','d','l','b','c','p','s')) {
        $found = Call-Adb @('-s',$serial,'exec-out','run-as',$privatePackage,'/system/bin/toybox','find','files','-mindepth','1','-maxdepth','1','-type',$kind,'-print0') -FindTypeListing
        # One NUL-terminated record or empty output, never filename parsing.
        if ((Test-SingleNullRecord $found) -eq 0) { continue }
        $matchedTypes += $kind
        $matchedBytes[$kind] = $found
      }
      $afterInventory = Call-Adb @('-s',$serial,'exec-out','run-as',$privatePackage,'/system/bin/toybox','ls','-A','files') -PreserveListing
      if ($afterInventory -cne $inventory) { throw 'PRIVATE_LISTING_CHANGED_PRESERVE' }
      if ($matchedTypes.Count -gt 1) { throw 'PRIVATE_MULTIPLE_TYPES_CONTRADICTORY' }
      $report.privateEntryType = 'UNKNOWN_PRESERVE'
      $report.typeEvidence = 'NO_TYPE_MATCH_PRESERVE'
      if ($matchedTypes.Count -eq 1) {
        # Replay only the fixed positive filter and require byte-for-byte match
        # before reporting type; no user-derived argument is ever passed.
        $kind = $matchedTypes[0]
        $repeat = Call-Adb @('-s',$serial,'exec-out','run-as',$privatePackage,'/system/bin/toybox','find','files','-mindepth','1','-maxdepth','1','-type',$kind,'-print0') -FindTypeListing
        if ($repeat -cne $matchedBytes[$kind]) { throw 'PRIVATE_FIND_RESULT_CHANGED_PRESERVE' }
        if ($kind -ceq 'f') { $report.privateEntryType = 'REGULAR_FILE' }
        elseif ($kind -ceq 'd') { $report.privateEntryType = 'DIRECTORY' }
        elseif ($kind -ceq 'l') { $report.privateEntryType = 'SYMLINK_NO_FOLLOW' }
        else { $report.privateEntryType = 'OTHER_NO_FOLLOW' }
        $report.typeEvidence = 'ONE_NULL_TERMINATED_MATCH_PRESERVE'
      }
      $report.status = 'PASS'
      $report.detail = 'READ_ONLY_SINGLE_ENTRY_NULL_TYPE_NO_CONTENT_READ'
    }
  } else {
    $report.privateDirectory = 'AMBIGUOUS_OR_NON_DIRECTORY_PRESERVE'
    throw 'PRIVATE_PATH_TESTS_CONTRADICTORY_NO_ACTION'
  }
}
catch {
  $report.status = 'BLOCKED'
  $report.detail = [string]$_.Exception.Message
}
finally {
  $report | ConvertTo-Json -Depth 3
}
# Explicit exit status prevents the calling CMD/PowerShell wrapper from inheriting
# a stale nonzero LASTEXITCODE after a successful read-only check.
if ($report.status -ne 'PASS') { exit 2 }
exit 0
