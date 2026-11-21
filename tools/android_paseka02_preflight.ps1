# PASEKA02 Android 16 read-only preflight. Never clears data, stops apps or deletes files.
# Run only after reviewing this file from the trusted Pasekaapp repository.
[CmdletBinding()]
param([switch]$InspectHeaders)
$ErrorActionPreference = 'Stop'
$package = 'ru.paseka.journal.archive.test'
$directory = '/sdcard/Download/Пасека'
function Finish([string]$status, [string]$reason, [int]$exitCode) {
    Write-Host ("STATUS: " + $status)
    Write-Host ("DETAIL: " + $reason)
    exit $exitCode
}
function AdbOutput([string[]]$arguments) {
    $lines = @(& adb @arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw ("adb failed (" + $LASTEXITCODE + "): " + (($lines | Out-String).Trim()))
    }
    return (($lines | Out-String).Trim())
}
try {
    $adb = Get-Command adb -ErrorAction Stop
    $devices = @( & adb devices -l 2>&1 )
    if ($LASTEXITCODE -ne 0) { throw 'adb devices failed' }
    $connected = @($devices | Where-Object { $_ -match '^\S+\s+device\s+' })
    $unavailable = @($devices | Where-Object { $_ -match '^\S+\s+(unauthorized|offline|recovery|sideload)\b' })
    if ($connected.Count -ne 1 -or $unavailable.Count -gt 0) {
        Finish 'BLOCKED' 'Exactly one authorized USB test device is required.' 2
    }
    $model = AdbOutput -arguments @('-d','shell','getprop','ro.product.model')
    $api = AdbOutput -arguments @('-d','shell','getprop','ro.build.version.sdk')
    $android = AdbOutput -arguments @('-d','shell','getprop','ro.build.version.release')
    if ($api -notmatch '^\d+$' -or [int]$api -lt 35) {
        Finish 'BLOCKED' 'Android API 35 or higher required.' 2
    }
    $installed = AdbOutput -arguments @('-d','shell','pm','path',$package)
    if ($installed -notmatch '^package:') {
        Finish 'BLOCKED' 'Isolated package not found.' 2
    }
    Write-Host ('DEVICE: ' + $model + ' | Android ' + $android + ' | API ' + $api)
    Write-Host ('PACKAGE: ' + $package + ' | INSTALLED')
    # pidof returns status 1 when no process exists. This is informational only.
    $pids = @(& adb -d shell pidof $package 2>&1)
    $pidExit = $LASTEXITCODE
    if ($pidExit -eq 0 -and (($pids | Out-String).Trim()) -match '^[1-9]\d*(?:\s+[1-9]\d*)*$') {
        Write-Host 'PROCESS: RUNNING'
    } elseif ($pidExit -eq 1 -and -not (($pids | Out-String).Trim())) {
        Write-Host 'PROCESS: STOPPED (no action taken)'
    } else {
        Finish 'BLOCKED' 'Process state could not be determined cleanly.' 2
    }
    # Listing only; do not download, open, change or hash any unidentified user file.
    $fileNames = @(& adb -d shell ls -1 $directory 2>&1)
    $fileExit = $LASTEXITCODE
    if ($fileExit -ne 0) {
        Write-Host 'ARCHIVE_DIRECTORY: NOT ACCESSIBLE OR NOT CREATED'
        Write-Host 'PASEKA02_ARCHIVES: NOT VERIFIED'
    } else {
        $archiveFiles = @($fileNames | Where-Object { $_ -match '^paseka-full-backup-\d{4}-\d{2}-\d{2}(?: \(\d+\))?\.paseka$' })
        Write-Host ('ARCHIVE_DIRECTORY: ACCESSIBLE; matching filenames: ' + $archiveFiles.Count)
        if ($InspectHeaders) {
            if ($archiveFiles.Count -gt 20) {
                Finish 'BLOCKED' 'More than 20 matching filenames; refusing unbounded file reads.' 2
            }
            $paseka02Count = 0
            $index = 0
            foreach ($entry in $archiveFiles) {
                $index++
                $safeName = ([string]$entry).TrimEnd([char]13)
                if ($safeName -notmatch '^paseka-full-backup-\d{4}-\d{2}-\d{2}(?: \(\d+\))?\.paseka$') {
                    Finish 'BLOCKED' 'Unexpected filename during header inspection.' 2
                }
                $safePath = $directory + '/' + $safeName
                # Exact whitelist above prevents quote injection. Android shell single quotes preserve Unicode and spaces.
                $magic = AdbOutput -arguments @('-d','shell',("head -c 8 '" + $safePath + "'"))
                $length = AdbOutput -arguments @('-d','shell',("stat -c %s '" + $safePath + "'"))
                if ($length -notmatch '^\d+$') {
                    Finish 'BLOCKED' 'Invalid file size from Android stat.' 2
                }
                if ($magic -eq 'PASEKA02') { $paseka02Count++ }
                elseif ($magic -eq 'PASEKA01') { }
                else { $magic = 'OTHER_OR_UNREADABLE' }
                Write-Host ('ARCHIVE[' + $index + ']: ' + $safeName + ' | header=' + $magic + ' | size=' + $length)
            }
            Write-Host ('PASEKA02_HEADERS: ' + $paseka02Count + ' of ' + $archiveFiles.Count)
            Write-Host 'PASEKA02_CONTENT: NOT VERIFIED; archive provenance and video integrity unknown.'
        } else {
            Write-Host 'PASEKA02_ARCHIVES: NOT VERIFIED (names only; no files read)'
        }
    }
    if ($InspectHeaders) {
        Write-Host 'DATA_ACTIONS: READ-ONLY HEADERS AND FILE LENGTHS; no stop, deletion, installation, or restore.'
    } else {
        Write-Host 'DATA_ACTIONS: NONE; no stop, deletion, installation, restore, or archive read.'
    }
    Finish 'PREFLIGHT_COMPLETE' 'Physical ADB preflight only. IndexedDB/video integrity NOT TESTED.' 0
} catch {
    Finish 'BLOCKED' ('Read-only preflight failed: ' + $_.Exception.Message) 2
}
