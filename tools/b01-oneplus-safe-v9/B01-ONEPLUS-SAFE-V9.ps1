# PASEKA B01/V9: read-only phone -> NEW local candidate file. Windows PowerShell 5.1.
# This is NOT an independent restore and never marks fullBackupVerified.
# No Android writes, no install/uninstall/clear/force-stop/restore/delete/network.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$pkg = 'ru.paseka.journal'
$maxBytes = [long]8 * 1024 * 1024 * 1024
$base = $PSScriptRoot
$results = Join-Path $base 'results'
[void][IO.Directory]::CreateDirectory($results)
$runFolder = Join-Path $results ('run-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
[void][IO.Directory]::CreateDirectory($runFolder)
$reportPath = Join-Path $runFolder 'b01-v9-result.json'
$report = [ordered]@{
    schema = 'paseka-b01-private-readonly-v9'
    generatedUtc = [DateTime]::UtcNow.ToString('o')
    status = 'BLOCKED'
    stage = 'PREFLIGHT'
    code = 'NOT_STARTED'
    packageId = $pkg
    deviceModel = $null
    adbVersion = $null
    shellV2Advertised = $false
    publicTar = 'NOT_TESTED'
    privateTar = 'NOT_ATTEMPTED'
    privateTarBytes = 0
    privateTarSha256 = $null
    privateTarEntries = 0
    backupCompleteness = 'NOT_VERIFIED'
    independentRestore = 'NOT_TESTED'
    mediaStoreGalleryCoverage = 'NOT_TESTED'
    phoneWrites = 'NOT_ATTEMPTED'
    install = 'NOT_ATTEMPTED'
    uninstall = 'NOT_ATTEMPTED'
    forceStop = 'NOT_ATTEMPTED'
    clear = 'NOT_ATTEMPTED'
    restore = 'NOT_ATTEMPTED'
    deleteOriginals = 'NOT_ATTEMPTED'
    network = 'NOT_ATTEMPTED'
}
function Save-Report {
    $report.generatedUtc = [DateTime]::UtcNow.ToString('o')
    $json = ConvertTo-Json -InputObject $report -Depth 6
    [IO.File]::WriteAllText($reportPath, $json, (New-Object Text.UTF8Encoding($false)))
}
function Fail([string]$code) {
    $report.status='BLOCKED'
    $report.code=$code
    Save-Report
    throw $code
}
function Find-ModernAdb {
    $paths = @(
        (Join-Path $base 'platform-tools\adb.exe'),
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe')
    )
    foreach ($path in $paths) {
        if(-not [IO.File]::Exists($path)) { continue }
        # Treat SDK installation path as a bundle: adb.exe and shipped DLLs belong together.
        if(-not [IO.File]::Exists((Join-Path (Split-Path -Parent $path) 'AdbWinApi.dll'))) { continue }
        return $path
    }
    Fail 'MODERN_ADB_NOT_FOUND'
}
function Invoke-ProcessCapture {
    param(
        [string]$ArgsLine,
        [string]$OutputFile = '',
        [long]$Limit = 1048576
    )
    # Binary stdout -> raw FileStream. Host stderr is read concurrently. No PowerShell text pipe.
    $si=New-Object Diagnostics.ProcessStartInfo
    $si.FileName=$script:adb
    $si.Arguments=$ArgsLine
    $si.UseShellExecute=$false
    $si.CreateNoWindow=$true
    $si.RedirectStandardOutput=$true
    $si.RedirectStandardError=$true
    $si.RedirectStandardInput=$true
    $p=New-Object Diagnostics.Process
    $p.StartInfo=$si
    $outBytes=New-Object IO.MemoryStream
    $file=$null
    try {
        if($OutputFile) {
            # CreateNew: never overwrite an old candidate or user file.
            $file=New-Object IO.FileStream($OutputFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        }
        if(-not $p.Start()) { Fail 'ADB_PROCESS_START_FAILED' }
        $p.StandardInput.Close()
        $stderrTask=$p.StandardError.ReadToEndAsync()
        $buf=New-Object byte[] 65536
        $total=[long]0
        $exceeded=$false
        while(($read=$p.StandardOutput.BaseStream.Read($buf,0,$buf.Length)) -gt 0) {
            $total += [long]$read
            if($total -gt $Limit) { $exceeded=$true; break }
            if($file) { $file.Write($buf,0,$read) }
            else { $outBytes.Write($buf,0,$read) }
        }
        if($exceeded) {
            try { $p.Kill() } catch {}
            Fail 'STDOUT_SIZE_LIMIT_EXCEEDED'
        }
        if(-not $p.WaitForExit(180000)) {
            try { $p.Kill() } catch {}
            Fail 'ADB_PROCESS_TIMEOUT'
        }
        $stderr=$stderrTask.GetAwaiter().GetResult()
        $result=[pscustomobject]@{
            exitCode = [int]$p.ExitCode
            stderr = [string]$stderr
            bytes = $total
            text = if($file) { '' } else { [Text.Encoding]::UTF8.GetString($outBytes.ToArray()) }
        }
        return $result
    }
    finally {
        if($file) { $file.Flush(); $file.Dispose() }
        $outBytes.Dispose()
        $p.Dispose()
    }
}
function SafeText([string]$command,[int]$limit=1048576) {
    $r=Invoke-ProcessCapture -ArgsLine $command -Limit $limit
    # Never echo remote stderr, which could contain private paths.
    if($r.exitCode -ne 0 -or $r.stderr.Length -gt 0) { Fail 'ADB_READONLY_COMMAND_FAILED' }
    return $r.text.Trim()
}
function Is-AppStopped {
    $out=SafeText ('-s '+$script:serial+' shell ps -A')
    $lines=@($out -split "`r?`n")
    if($lines.Count -lt 2 -or $lines[0] -notmatch '\bPID\b' -or $lines[0] -notmatch '\bNAME\b') {
        Fail 'PROCESS_LIST_UNRELIABLE'
    }
    foreach($line in $lines | Select-Object -Skip 1) {
        if(-not $line.Trim()) { continue }
        $parts=@($line.Trim() -split '\s+')
        if($parts.Count -lt 3) { Fail 'PROCESS_LIST_UNRELIABLE' }
        $name=$parts[-1]
        if($name -eq $pkg -or $name.StartsWith($pkg+':',[StringComparison]::Ordinal)) { return $false }
    }
    return $true
}
function Get-Octal([byte[]]$block,[int]$start,[int]$width) {
    $s=[Text.Encoding]::ASCII.GetString($block,$start,$width).Trim([char[]]@([char]0,[char]32))
    if($s -notmatch '^[0-7]{1,12}$') { throw 'TAR_OCTAL_FIELD_INVALID' }
    return [Convert]::ToInt64($s,8)
}
function Inspect-Tar([string]$path) {
    $fi=New-Object IO.FileInfo($path)
    if($fi.Length -lt 1536 -or ($fi.Length % 512) -ne 0 -or $fi.Length -gt $maxBytes) { throw 'TAR_BLOCK_ALIGNMENT_OR_LENGTH_INVALID' }
    $fs=New-Object IO.FileStream($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try {
        $buf=New-Object byte[] 512
        $pos=[long]0; $headers=0; $endBlocks=0; $webviewHints=0; $databaseHints=0
        while($pos -lt $fi.Length) {
            $got=$fs.Read($buf,0,512)
            if($got -ne 512) { throw 'TAR_TRUNCATED_HEADER' }
            $pos += 512
            $allZero=$true
            foreach($value in $buf) { if($value -ne 0) { $allZero=$false; break } }
            if($allZero) {
                $endBlocks++
                # No nonzero trailer, including diagnostics accidentally merged with stdout.
                continue
            }
            if($endBlocks -gt 0) { throw 'TAR_NONZERO_AFTER_EOF' }
            $claimed=Get-Octal $buf 148 8
            $actual=[long]0
            for($i=0;$i -lt 512;$i++) {
                if($i -ge 148 -and $i -lt 156) { $actual += 32 }
                else { $actual += [long]$buf[$i] }
            }
            if($claimed -ne $actual) { throw 'INVALID_TAR_HEADER_CHECKSUM' }
            # Only classify fixed header fields in memory; never log member names.
            $member=[Text.Encoding]::UTF8.GetString($buf,0,100).Split([char]0)[0]
            if($member -match '(^|/)app_webview(/|$)') { $webviewHints++ }
            if($member -match '(^|/)databases(/|$)') { $databaseHints++ }
            $length=Get-Octal $buf 124 12
            if($length -lt 0 -or $length -gt $maxBytes) { throw 'TAR_MEMBER_SIZE_OUT_OF_RANGE' }
            $rounded=([long][Math]::Ceiling([double]$length / 512.0))*512
            if($rounded -gt $fi.Length - $pos) { throw 'TAR_PAYLOAD_TRUNCATED' }
            $fs.Seek($rounded,[IO.SeekOrigin]::Current) | Out-Null
            $pos += $rounded
            $headers++
        }
        if($headers -lt 1 -or $endBlocks -lt 2) { throw 'TAR_MISSING_ENTRIES_OR_EOF' }
        return [pscustomobject]@{entries=$headers;webviewHints=$webviewHints;databaseHints=$databaseHints}
    } finally { $fs.Dispose() }
}
function GrabTar([string]$argsLine,[string]$fileName,[string]$kind) {
    $out=Join-Path $runFolder $fileName
    # The output file never exists before capture and is never overwritten. On failure it
    # remains for local forensic review; it is not a validated backup.
    $r=Invoke-ProcessCapture -ArgsLine $argsLine -OutputFile $out -Limit $maxBytes
    if($r.exitCode -ne 0 -or $r.stderr.Length -gt 0) { Fail ($kind+'_ADB_EXIT_OR_STDERR') }
    try { $audit=Inspect-Tar $out }
    catch { Fail ($kind+'_TAR_INVALID_'+[string]$_.Exception.Message) }
    $hash=(Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant()
    return [pscustomobject]@{bytes=$r.bytes;entries=$audit.entries;webviewHints=$audit.webviewHints;databaseHints=$audit.databaseHints;sha256=$hash}
}
try {
    Save-Report
    $script:adb=Find-ModernAdb
    $version=SafeText 'version'
    $m=[regex]::Match($version,'Android Debug Bridge version\s+(\d+)\.(\d+)\.(\d+)')
    if(-not $m.Success) { Fail 'ADB_VERSION_UNPARSABLE' }
    $ver=[Version]::Parse(($m.Groups[1].Value+'.'+$m.Groups[2].Value+'.'+$m.Groups[3].Value))
    $report.adbVersion=$ver.ToString()
    if($ver -lt ([Version]::Parse('1.0.41'))) { Fail 'ADB_TOO_OLD' }
    $devices=SafeText 'devices -l'
    $rows=@($devices -split "`r?`n" | Where-Object { $_ -match '^\S+\s+(device|offline|unauthorized)\b' })
    if($rows.Count -ne 1 -or $rows[0] -notmatch '^(\S+)\s+device\b') { Fail 'EXACTLY_ONE_AUTHORIZED_DEVICE_REQUIRED' }
    $script:serial=([regex]::Match($rows[0],'^(\S+)\s+device\b')).Groups[1].Value
    if($script:serial -notmatch '^[A-Za-z0-9_.:-]{1,128}$') { Fail 'DEVICE_SERIAL_INVALID' }
    $model=SafeText ('-s '+$script:serial+' shell getprop ro.product.model')
    if($model -ne 'NE2213') { Fail 'DEVICE_MODEL_MISMATCH' }
    $report.deviceModel=$model
    $features=SafeText ('-s '+$script:serial+' features')
    $report.shellV2Advertised=(@($features -split '[,\s]+' | Where-Object {$_ -eq 'shell_v2'}).Count -gt 0)
    if(-not $report.shellV2Advertised) { Fail 'SHELL_V2_NOT_NEGOTIATED' }
    $probe=SafeText ('-s '+$script:serial+' shell run-as '+$pkg+' pwd')
    if(-not $probe -or $probe -notmatch '/'+[regex]::Escape($pkg)+'$') { Fail 'RUN_AS_PRIVATE_CWD_UNKNOWN' }
    if(-not (Is-AppStopped)) { Fail 'APP_PROCESS_RUNNING_NO_CAPTURE' }
    $report.stage='PUBLIC_TAR_GATE'; Save-Report
    $publicFile=$null
    foreach($candidate in @('/system/build.prop','/system/etc/hosts')) {
        $r=Invoke-ProcessCapture -ArgsLine ('-s '+$script:serial+' shell run-as '+$pkg+' test -r '+$candidate) -Limit 1024
        if($r.exitCode -eq 0 -and $r.stderr.Length -eq 0 -and $r.bytes -eq 0) { $publicFile=$candidate;break }
    }
    if(-not $publicFile) { Fail 'NO_VERIFIED_READABLE_PUBLIC_FILE' }
    $parent=[regex]::Replace($publicFile,'/[^/]+$','')
    $name=($publicFile -split '/')[-1]
    $pArgs='-s '+$script:serial+' shell run-as '+$pkg+' tar -cf - -C '+$parent+' '+$name
    $pub=GrabTar $pArgs 'public-only-v9.tar' 'PUBLIC'
    $report.publicTar='STRUCTURALLY_VALID_PUBLIC_TAR'
    Save-Report
    if(-not (Is-AppStopped)) { Fail 'PROCESS_STARTED_DURING_PUBLIC_GATE' }
    $report.stage='AWAITING_PRIVATE_READ_CONFIRMATION'
    Save-Report
    Write-Host 'PUBLIC TAR PASS. No private files read.' -ForegroundColor Green
    Write-Host 'For a new confidential PC-only candidate (NOT full verified backup), type CAPTURE.'
    Write-Host 'Anything else exits without private capture.'
    $answer=Read-Host 'Action'
    if($answer -cne 'CAPTURE') {
        $report.status='PUBLIC_ONLY_PASS'
        $report.code='USER_SKIPPED_PRIVATE_READ'
        Save-Report
        return
    }
    if(-not (Is-AppStopped)) { Fail 'APP_PROCESS_RUNNING_NO_CAPTURE' }
    $report.stage='PRIVATE_READ_CANDIDATE'
    Save-Report
    $name='private-candidate-v9-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.tar'
    $private=GrabTar ('-s '+$script:serial+' shell run-as '+$pkg+' tar -cf - .') $name 'PRIVATE'
    if(-not (Is-AppStopped)) { Fail 'PROCESS_STARTED_DURING_PRIVATE_CAPTURE' }
    if($private.webviewHints -lt 1 -and $private.databaseHints -lt 1) { Fail 'PRIVATE_EXPECTED_STORAGE_HINTS_MISSING' }
    $report.privateTar='STRUCTURALLY_VALID_CANDIDATE_RESTORE_NOT_VERIFIED'
    $report.privateTarBytes=$private.bytes
    $report.privateTarSha256=$private.sha256
    $report.privateTarEntries=$private.entries
    $report.webviewPathHints=$private.webviewHints
    $report.databasePathHints=$private.databaseHints
    $report.status='CANDIDATE_ONLY'
    $report.code='PRIVATE_TAR_STRUCTURALLY_VALID_RESTORE_NOT_VERIFIED'
    Save-Report
    Write-Host 'Candidate TAR verified structurally. THIS IS NOT A FULL OR RESTORED BACKUP.' -ForegroundColor Yellow
} catch {
    if($report.code -eq 'NOT_STARTED') { $report.code='UNEXPECTED_SCRIPT_ERROR' }
    $report.status='BLOCKED'; Save-Report
    Write-Host ('BLOCKED: '+$report.code) -ForegroundColor Red
} finally { Save-Report }
Write-Host ('Report (share JSON only): '+$reportPath)
