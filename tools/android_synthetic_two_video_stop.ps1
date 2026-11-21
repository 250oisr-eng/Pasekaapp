# Physical USB-only proof for a NEW external PASEKA01 file with two synthetic byte blobs.
# No production package, no IndexedDB access, no restoration, no Android deletions.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$package = 'ru.paseka.journal.archive.test'
$folder = '/sdcard/Download/Пасека/isolated-archive-synthetic-tests'
function EndTest([string]$status,[string]$message,[int]$code) {
    Write-Host ('STATUS: ' + $status)
    Write-Host ('DETAIL: ' + $message)
    exit $code
}
function InvokeNativeAdb([string[]]$argv) {
    $oldPreference = $ErrorActionPreference
    try {
        # Native adb can emit normal transfer progress to stderr in Windows PS5.1.
        $ErrorActionPreference = 'Continue'
        $output = (& adb @argv 2>&1 | Out-String).Trim()
        $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    return [pscustomobject]@{ Code = $exitCode; Output = [string]$output }
}
function RequireAdb([string[]]$argv) {
    $result = InvokeNativeAdb $argv
    if ($result.Code -ne 0) { throw ('ADB command exited ' + $result.Code + ' (' + ($argv[0..([Math]::Min($argv.Count-1,2))] -join ' ') + ')') }
    return $result.Output
}
function HexHash([byte[]]$content) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($content)).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function RemoteSha([string]$remotePath) {
    $reply = RequireAdb -argv @('-d','shell',("sha256sum '" + $remotePath + "'"))
    if ($reply -notmatch '^([a-f0-9]{64})\s+') { throw 'Android sha256sum response invalid' }
    return $Matches[1]
}
try {
    $null = Get-Command adb -CommandType Application -ErrorAction Stop
    $devices = RequireAdb -argv @('devices','-l')
    $online = @($devices -split "[\r\n]+" | Where-Object { $_ -match '^\S+\s+device\s+' })
    $offline = @($devices -split "[\r\n]+" | Where-Object { $_ -match '^\S+\s+(offline|unauthorized|recovery|sideload)\b' })
    if ($online.Count -ne 1 -or $offline.Count -gt 0) { throw 'Exactly one authorized Android USB device required' }
    $model = RequireAdb -argv @('-d','shell','getprop ro.product.model')
    $api = RequireAdb -argv @('-d','shell','getprop ro.build.version.sdk')
    if ($model -ne 'NE2213' -or $api -ne '36') { throw 'Expected physical OnePlus NE2213 Android API 36 only' }
    $installed = RequireAdb -argv @('-d','shell',('pm path ' + $package))
    if ($installed -notmatch '^package:/data/app/') { throw 'Isolated test APK not installed' }
    # Byte-only synthetic stand-ins; NOT playable MP4, NOT actual camera footage.
    $videoA = [Text.Encoding]::ASCII.GetBytes(("PASEKA SYNTHETIC VIDEO BLOB A -- NOT A CAMERA VIDEO" + [char]10) * 5)
    $videoB = [Text.Encoding]::ASCII.GetBytes(("PASEKA SYNTHETIC VIDEO BLOB B -- NOT A CAMERA VIDEO" + [char]10) * 7)
    $state = [Text.Encoding]::UTF8.GetBytes('{"app":"Paseka","state":{"meta":{"schemaVersion":15},"hives":[]}}')
    $created = '2026-11-21T00:00:00.000Z'
    $entries = @(
        [ordered]@{path='state.json';kind='state';size=$state.Length;mimeType='application/json';chunkSize=1048576;chunkSha256=@((HexHash $state))},
        [ordered]@{path='entrance-media/000001.blob';kind='entrance_video';size=$videoA.Length;mimeType='video/mp4';chunkSize=1048576;chunkSha256=@((HexHash $videoA));metadata=[ordered]@{id='isolated-synthetic-video-1';hiveId='isolated-synthetic-hive';capturedAt=$created;durationSec=1;width=16;height=16;bytes=$videoA.Length;mimeType='video/mp4';name='synthetic-stand-in-1.mp4';status='waiting_for_server'}},
        [ordered]@{path='entrance-media/000002.blob';kind='entrance_video';size=$videoB.Length;mimeType='video/mp4';chunkSize=1048576;chunkSha256=@((HexHash $videoB));metadata=[ordered]@{id='isolated-synthetic-video-2';hiveId='isolated-synthetic-hive';capturedAt=$created;durationSec=1;width=16;height=16;bytes=$videoB.Length;mimeType='video/mp4';name='synthetic-stand-in-2.mp4';status='waiting_for_server'}}
    )
    $manifest = [ordered]@{format='paseka-archive';version=1;backupId='isolated-synthetic-two-video-fixture';createdAt=$created;schemaVersion=15;entries=$entries}
    $manifestBytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $manifest -Depth 12 -Compress))
    if ($manifestBytes.Length -lt 2 -or $manifestBytes.Length -gt 4194304) { throw 'Invalid generated manifest size' }
    $stream = [IO.MemoryStream]::new()
    try {
        $stream.Write([Text.Encoding]::ASCII.GetBytes('PASEKA01'),0,8)
        $stream.Write([BitConverter]::GetBytes([uint32]$manifestBytes.Length),0,4)
        foreach ($part in @($manifestBytes,$state,$videoA,$videoB)) {
            $stream.Write([byte[]]$part,0,$part.Length)
        }
        $archive = $stream.ToArray()
    } finally { $stream.Dispose() }
    if ($archive.Length -gt 1048576) { throw 'Fixture exceeded strict 1 MiB cap' }
    $expectedSha = HexHash $archive
    $testToken = [guid]::NewGuid().ToString('N')
    $testFolder = $folder + '/' + $testToken
    $remote = $testFolder + '/synthetic-two-video.paseka'
    # First potential Android write must come after strictly confirming new path.
    $existing = InvokeNativeAdb -argv @('-d','shell',("test -e '" + $testFolder + "'"))
    if ($existing.Code -ne 1 -or $existing.Output) { throw 'Destination exists or cannot be verified absent; no write performed' }
    $scratch = Join-Path ([IO.Path]::GetTempPath()) ('paseka-synthetic-' + [guid]::NewGuid().ToString('N'))
    $null = New-Item -Path $scratch -ItemType Directory -ErrorAction Stop
    try {
        $local = Join-Path $scratch 'synthetic-two-video.paseka'
        [IO.File]::WriteAllBytes($local,$archive)
        if ((HexHash ([IO.File]::ReadAllBytes($local))) -ne $expectedSha) { throw 'Fixture changed on PC before upload' }
        Write-Host ('DEVICE: ' + $model + ' Android API ' + $api)
        Write-Host ('TEST_PACKAGE: ' + $package)
        Write-Host ('SYNTHETIC_BLOBS: 2 (NOT playable videos)')
        Write-Host ('SYNTHETIC_SOURCE_SHA256: ' + $expectedSha)
        $null = RequireAdb -argv @('-d','shell',("mkdir -p '" + $testFolder + "'"))
        $null = RequireAdb -argv @('-d','push',$local,$remote)
        if ((RemoteSha $remote) -ne $expectedSha) { throw 'Transferred bytes differ; no force-stop performed' }
        Write-Host 'ANDROID_COPY_BEFORE_STOP: PASS'
        $launch = RequireAdb -argv @('-d','shell',("monkey -p " + $package + " -c android.intent.category.LAUNCHER 1"))
        if ($launch -notmatch 'Events injected:\s*1') { throw 'Isolated app start not confirmed; no force-stop' }
        $null = RequireAdb -argv @('-d','shell',("am force-stop " + $package))
        $processState = InvokeNativeAdb -argv @('-d','shell',('pidof ' + $package))
        if (-not (($processState.Code -eq 1 -or $processState.Code -eq 0) -and -not $processState.Output)) {
            throw 'Isolated test process not confirmed stopped'
        }
        if ((RemoteSha $remote) -ne $expectedSha) { throw 'External archive changed after test app force-stop' }
        Write-Host 'ANDROID_COPY_AFTER_STOP: PASS'
        $restart = RequireAdb -argv @('-d','shell',("monkey -p " + $package + " -c android.intent.category.LAUNCHER 1"))
        if ($restart -notmatch 'Events injected:\s*1') { throw 'Isolated app relaunch not confirmed' }
        if ((RemoteSha $remote) -ne $expectedSha) { throw 'External archive changed after relaunch' }
        Write-Host 'ANDROID_COPY_AFTER_RELAUNCH: PASS'
        Write-Host ('SYNTHETIC_VIDEO_1_SHA256: ' + (HexHash $videoA))
        Write-Host ('SYNTHETIC_VIDEO_2_SHA256: ' + (HexHash $videoB))
        Write-Host ('TEST_FILE_RETAINED_ON_PHONE: ' + $remote)
        Write-Host 'INDEXEDDB_AND_APP_EXPORT_WITH_VIDEOS: NOT TESTED'
        Write-Host 'ANDROID_FILES_DELETED: NONE; local generated scratch cleared'
        EndTest 'EXTERNAL_TWO_BLOB_SHA_PASS' 'Only a synthetic external PASEKA01 file was tested, not application IndexedDB or usable MP4.' 0
    } finally {
        # Only locally created scratch is removed; phone test artifact is never deleted.
        if ((Test-Path -LiteralPath $scratch -PathType Container) -and
            (Split-Path -Leaf $scratch) -match '^paseka-synthetic-[a-f0-9]{32}$') {
            Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction Stop
        }
    }
} catch {
    EndTest 'BLOCKED' ('Test did not finish: ' + $_.Exception.Message + '. Any uploaded test file was retained; no Android deletion.') 2
}
