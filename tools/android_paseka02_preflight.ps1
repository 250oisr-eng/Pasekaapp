# PASEKA02 Android 16 read-only preflight. Never clears data, stops apps or deletes files.
# Run only after reviewing this file from the trusted Pasekaapp repository.
[CmdletBinding()]
param([switch]$InspectHeaders, [switch]$CheckNewExport, [switch]$VerifyContents)
$ErrorActionPreference = 'Stop'
if ($VerifyContents) { $CheckNewExport = $true }
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
    # A completed export remains accessible when Android suspends or kills the app.
    # The read-only export verifier never needs a running process, so avoid pidof altogether.
    if ($CheckNewExport) {
        Write-Host 'PROCESS: NOT REQUIRED (read-only saved-file check)'
    } else {
        # pidof is only informational for the other diagnostic modes.
        $pids = @(& adb -d shell pidof $package 2>&1)
        $pidExit = $LASTEXITCODE
        $pidText = ($pids | Out-String).Trim()
        if ($pidExit -eq 0 -and $pidText -match '^[1-9]\d*(?:\s+[1-9]\d*)*$') {
            Write-Host 'PROCESS: RUNNING'
        } elseif (($pidExit -eq 1 -or $pidExit -eq 0) -and -not $pidText) {
            Write-Host 'PROCESS: STOPPED (no action taken)'
        } else {
            Finish 'BLOCKED' 'Process state could not be determined cleanly.' 2
        }
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
    if ($CheckNewExport) {
        # Narrow the scan to today's newly created test export; never inspect unknown old archives.
        if ($fileExit -ne 0) {
            Finish 'BLOCKED' 'The Android Downloads archive folder is unavailable.' 2
        }
        $newCandidates = @($archiveFiles | Where-Object { $_ -match '^paseka-full-backup-2026-11-21(?: \(\d+\))?\.paseka$' })
        if ($newCandidates.Count -ne 1) {
            Finish 'BLOCKED' ('Expected exactly one 2026-11-21 export, found ' + $newCandidates.Count + '. No archives read.') 2
        }
        $newName = [string]$newCandidates[0]
        if ($newName -notmatch '^paseka-full-backup-2026-11-21(?: \(\d+\))?\.paseka$') {
            Finish 'BLOCKED' 'Unexpected test archive name.' 2
        }
        $newPath = $directory + '/' + $newName
        $quoted = "'" + $newPath + "'"
        $type = AdbOutput -arguments @('-d','shell',("stat -c %F " + $quoted))
        if ($type -ne 'regular file') {
            Finish 'BLOCKED' 'New archive is not a regular file.' 2
        }
        $length = AdbOutput -arguments @('-d','shell',("stat -c %s " + $quoted))
        if ($length -notmatch '^\d+$' -or [int64]$length -lt 12 -or [int64]$length -gt 536870912) {
            Finish 'BLOCKED' 'Invalid or out-of-range archive length.' 2
        }
        $header = AdbOutput -arguments @('-d','shell',("head -c 8 " + $quoted))
        if ($header -ne 'PASEKA01') {
            Finish 'BLOCKED' 'The current Android app exports PASEKA01, not this header.' 2
        }
        $hashLine1 = AdbOutput -arguments @('-d','shell',("sha256sum " + $quoted))
        $hashLine2 = AdbOutput -arguments @('-d','shell',("sha256sum " + $quoted))
        $digestRegex = '^([a-f0-9]{64})\s+'
        if ($hashLine1 -notmatch $digestRegex) {
            Finish 'BLOCKED' 'First SHA-256 reply is malformed.' 2
        }
        $digest1 = $Matches[1]
        if ($hashLine2 -notmatch $digestRegex) {
            Finish 'BLOCKED' 'Second SHA-256 reply is malformed.' 2
        }
        if ($digest1 -ne $Matches[1]) {
            Finish 'FAIL' 'Archive SHA-256 changed between two reads.' 1
        }
        if ($VerifyContents) {
            # No restoration or mutation: pull only this SHA-pinned file to a fresh disposable local copy.
            # 16 MiB conservative staging cap; larger exports require a separate streaming verifier.
            if ([int64]$length -gt 16777216) {
                Finish 'BLOCKED' 'Archive is over the 16 MiB bounded local-verification limit.' 2
            }
            $workingDir = Join-Path ([IO.Path]::GetTempPath()) ('paseka-verify-' + [guid]::NewGuid().ToString('N'))
            $null = New-Item -Path $workingDir -ItemType Directory -ErrorAction Stop
            $copy = Join-Path $workingDir 'test-export.paseka'
            try {
                $pullReply = @(& adb -d pull $newPath $copy 2>&1)
                if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $copy -PathType Leaf)) {
                    throw 'ADB pull of the selected archive failed.'
                }
                $bytes = [IO.File]::ReadAllBytes($copy)
                if ($bytes.Length -ne [int64]$length) { throw 'Local archive length differs from Android.' }
                $sha = [Security.Cryptography.SHA256]::Create()
                try {
                    $localDigest = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
                    if ($localDigest -ne $digest1) { throw 'The copied archive SHA differs from the device SHA.' }
                    if ($bytes.Length -lt 14 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 8) -ne 'PASEKA01') { throw 'Invalid archive header.' }
                    if (-not [BitConverter]::IsLittleEndian) { throw 'Unsupported host byte order.' }
                    $manifestLength = [int64][BitConverter]::ToUInt32($bytes, 8)
                    if ($manifestLength -lt 2 -or $manifestLength -gt 4194304 -or 12 + $manifestLength -gt $bytes.Length) {
                        throw 'Invalid manifest length.'
                    }
                    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
                    $manifestText = $utf8.GetString($bytes, 12, [int]$manifestLength)
                    $manifest = ConvertFrom-Json -InputObject $manifestText -ErrorAction Stop
                    if ($manifest.format -cne 'paseka-archive' -or $manifest.version -ne 1) { throw 'Unsupported manifest format or version.' }
                    if (-not ([string]$manifest.backupId).Trim() -or $manifest.backupId.Length -gt 128) { throw 'Invalid backup ID.' }
                    if ([string]$manifest.schemaVersion -notmatch '^[1-9][0-9]{0,2}$') { throw 'Invalid schema version.' }
                    if ([string]$manifest.createdAt -notmatch '^\d{4}-\d\d-\d\dT') { throw 'Invalid creation timestamp.' }
                    $entries = @($manifest.entries)
                    if ($entries.Count -lt 1 -or $entries.Count -gt 512) { throw 'Invalid entry count.' }
                    $cursor = [int64](12 + $manifestLength)
                    $stateCount = 0
                    $videoCount = 0
                    $paths = @{}
                    $videoIds = @{}
                    for ($i = 0; $i -lt $entries.Count; $i++) {
                        $item = $entries[$i]
                        $pathName = [string]$item.path
                        if (-not $pathName -or $paths.ContainsKey($pathName)) { throw 'Missing or duplicate entry path.' }
                        $paths[$pathName] = $true
                        if ([string]$item.size -notmatch '^[1-9][0-9]*$') { throw 'Invalid entry size.' }
                        $entryLength = [int64]$item.size
                        if ($entryLength -gt 262144000 -or $cursor + $entryLength -gt $bytes.Length) { throw 'Entry outside archive bounds.' }
                        if ($item.chunkSize -ne 1048576) { throw 'Unsupported chunk size.' }
                        $hashes = @($item.chunkSha256)
                        $expectedChunks = [int][Math]::Ceiling($entryLength / 1048576.0)
                        if ($hashes.Count -ne $expectedChunks) { throw 'Invalid chunk digest count.' }
                        if ($i -eq 0) {
                            if ($item.kind -cne 'state' -or $pathName -cne 'state.json' -or $item.mimeType -cne 'application/json' -or $null -ne $item.metadata) {
                                throw 'The first archive entry must be state.json.'
                            }
                            $stateCount++
                        } else {
                            $videoCount++
                            $requiredPath = 'entrance-media/{0:D6}.blob' -f $videoCount
                            if ($item.kind -cne 'entrance_video' -or $pathName -cne $requiredPath) { throw 'Invalid video entry path.' }
                            if ($null -eq $item.metadata -or -not $item.metadata.id -or -not $item.metadata.hiveId) { throw 'Missing video metadata.' }
                            if ([string]$item.metadata.bytes -ne [string]$entryLength -or $item.mimeType -cne $item.metadata.mimeType -or $item.mimeType -notmatch '^video/') {
                                throw 'Video metadata size or MIME mismatch.'
                            }
                            $videoId = [string]$item.metadata.id
                            if ($videoIds.ContainsKey($videoId)) { throw 'Duplicate video ID.' }
                            $videoIds[$videoId] = $true
                        }
                        for ($chunkIndex = 0; $chunkIndex -lt $expectedChunks; $chunkIndex++) {
                            $expectedHash = [string]$hashes[$chunkIndex]
                            if ($expectedHash -cnotmatch '^[a-f0-9]{64}$') { throw 'Malformed archive chunk SHA-256.' }
                            $chunkOffset = [int64]$chunkIndex * 1048576
                            $chunkLength = [int][Math]::Min(1048576, $entryLength - $chunkOffset)
                            $chunk = New-Object byte[] $chunkLength
                            [Array]::Copy($bytes, [int]($cursor + $chunkOffset), $chunk, 0, $chunkLength)
                            $actualHash = [BitConverter]::ToString($sha.ComputeHash($chunk)).Replace('-', '').ToLowerInvariant()
                            if ($actualHash -cne $expectedHash) { throw ('Chunk SHA mismatch in entry ' + ($i + 1)) }
                        }
                        if ($i -eq 0) {
                            $stateText = $utf8.GetString($bytes, [int]$cursor, [int]$entryLength)
                            $stateWrapper = ConvertFrom-Json -InputObject $stateText -ErrorAction Stop
                            if ($stateWrapper.app -cne 'Paseka' -or $null -eq $stateWrapper.state -or $null -eq $stateWrapper.state.meta) {
                                throw 'Invalid Paseka state wrapper.'
                            }
                            if ([string]$stateWrapper.state.meta.schemaVersion -ne [string]$manifest.schemaVersion) {
                                throw 'State schema version differs from manifest.'
                            }
                        }
                        $cursor += $entryLength
                    }
                    if ($stateCount -ne 1 -or $cursor -ne $bytes.Length) { throw 'Archive end or state-entry mismatch.' }
                    Write-Host ('ARCHIVE_MANIFEST: PASS | entries=' + $entries.Count + ' | schema=' + $manifest.schemaVersion)
                    Write-Host ('ARCHIVE_CHUNKS_SHA256: PASS | verified entries=' + $entries.Count)
                    Write-Host ('ARCHIVE_VIDEO_ENTRIES: ' + $videoCount)
                    Write-Host 'ARCHIVE_STATE_WRAPPER: PASS (JSON parsed and matching schema)'
                    Write-Host 'ARCHIVE_RESTORE: NOT TESTED (no IndexedDB writes)'
                    Write-Host 'VIDEO_PROVENANCE: NOT TESTED (embedded hashes only)'
                } finally {
                    $sha.Dispose()
                }
            } finally {
                # Only remove the scratch copy and directory created by this exact invocation.
                if ((Test-Path -LiteralPath $workingDir -PathType Container) -and
                    (Split-Path -Leaf $workingDir) -match '^paseka-verify-[a-f0-9]{32}$') {
                    Remove-Item -LiteralPath $workingDir -Force -Recurse -ErrorAction Stop
                }
            }
        }
        Write-Host ('NEW_EXPORT_FILENAME: ' + $newName)
        Write-Host ('NEW_EXPORT_FORMAT: ' + $header)
        Write-Host ('NEW_EXPORT_BYTES: ' + $length)
        Write-Host ('NEW_EXPORT_SHA256_TWICE: ' + $digest1)
        Write-Host 'ARCHIVE_HASH: PASS (stable on two reads, NOT compared to a pre-export source)'
        if (-not $VerifyContents) { Write-Host 'ARCHIVE_STRUCTURE: NOT TESTED (manifest/chunks/video not verified)' }
        Write-Host 'INDEXEDDB: NOT TESTED; no process stopped'
        Write-Host 'PROVENANCE: NOT TESTED (filename does not prove synthetic-only data)'
        if ($VerifyContents) {
            Write-Host 'DATA_ACTIONS: READ-ONLY DEVICE; local scratch copy removed, no install/stop/restore.'
        } else {
            Write-Host 'DATA_ACTIONS: READ-ONLY; no install, stop, restore, deletion or copying'
        }
        if ($VerifyContents) {
            Finish 'ARCHIVE_STRUCTURE_VERIFIED' 'Archive bytes, manifest, chunks and state wrapper checked; restore/video provenance NOT TESTED.' 0
        }
        Finish 'EXPORT_CHECK_COMPLETE' 'New PASEKA01 archive signature, size and repeated SHA read; not restore-proof.' 0
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
