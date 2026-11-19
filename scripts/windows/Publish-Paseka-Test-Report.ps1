param(
  [ValidateSet('Configure','Upload','RetryPending','DryRun','SelfTest')]
  [string]$Action = 'Upload',
  [string]$ReportPath = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Intentionally fixed to the dedicated public, synthetic-only reporting issue.
$Repository = '250oisr-eng/Pasekaapp'
$IssueNumber = 198
$HomeDir = Join-Path $env:LOCALAPPDATA 'PasekaTestAgent'
$PendingDir = Join-Path $HomeDir 'pending'
$SecretPath = Join-Path $HomeDir 'github-issues-token.dpapi'
$KitDir = $PSScriptRoot

function Fail([string]$Why) { throw $Why }
function Read-Token {
  if (!(Test-Path -LiteralPath $SecretPath -PathType Leaf)) {
    Fail 'GitHub token not configured. Launch SETUP-REPORT-UPLOAD.cmd first.'
  }
  $cipher = (Get-Content -LiteralPath $SecretPath -Raw).Trim()
  $secure = ConvertTo-SecureString -String $cipher
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function Auth-Headers {
  $token = Read-Token
  if ($token -notmatch '^[A-Za-z0-9_]{20,255}$') { Fail 'Invalid locally encrypted token.' }
  return @{
    Authorization = 'Bearer ' + $token
    Accept = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent' = 'Paseka-Win11-Manual-Test-Agent'
  }
}
function Gh-Request([string]$Method, [string]$Url, $Headers, [string]$Body = '') {
  $args = @{ Method = $Method; Uri = $Url; Headers = $Headers; TimeoutSec = 30 }
  if ($Method -eq 'Post') {
    $args.ContentType = 'application/json; charset=utf-8'
    $args.Body = [Text.Encoding]::UTF8.GetBytes($Body)
  }
  return Invoke-RestMethod @args
}
function Configure-Token {
  [void](New-Item -Path $HomeDir -ItemType Directory -Force)
  Write-Host 'Create a GitHub fine-grained personal access token: ONLY repo 250oisr-eng/Pasekaapp, Issues: Read and write.'
  Write-Host 'Never paste the token into ChatGPT or a GitHub issue. Stored with Windows user DPAPI.'
  $secret = Read-Host 'Paste token here (hidden)' -AsSecureString
  if ($null -eq $secret -or $secret.Length -lt 20) { Fail 'Token missing or too short.' }
  $cipher = ConvertFrom-SecureString -SecureString $secret
  [IO.File]::WriteAllText($SecretPath, $cipher, (New-Object Text.UTF8Encoding($false)))
  try {
    $null = Gh-Request -Method 'Get' -Url ('https://api.github.com/repos/' + $Repository + '/issues/' + $IssueNumber) -Headers (Auth-Headers)
    Write-Host 'GitHub issue is reachable. Token saved for this Windows user; write permission is checked on upload.'
  } catch {
    Remove-Item -LiteralPath $SecretPath -Force -ErrorAction SilentlyContinue
    Fail 'GitHub issue access failed. Token was not retained. Check scope and expiration.'
  }
}
function Require-KitIdentity {
  $packageFile = Join-Path $KitDir 'device-package.txt'
  $shaFile = Join-Path $KitDir 'device-build-sha.txt'
  $apk = Join-Path $KitDir 'paseka-device-test.apk'
  $checksumFile = Join-Path $KitDir 'paseka-device-test.sha256'
  foreach ($path in @($packageFile,$shaFile,$apk,$checksumFile)) {
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { Fail 'Incomplete isolated kit metadata: cannot publish.' }
  }
  $package = (Get-Content -LiteralPath $packageFile -Raw).Trim()
  if ($package -cnotmatch '^ru\.paseka\.journal\.device\.r[0-9]{6,20}a[1-9][0-9]{0,3}$') {
    Fail 'Unsafe Android package: refusing report upload.'
  }
  $sha = (Get-Content -LiteralPath $shaFile -Raw).Trim()
  if ($sha -cnotmatch '^[a-f0-9]{40}$') { Fail 'Invalid exact CI commit SHA.' }
  $expected = ((Get-Content -LiteralPath $checksumFile -Raw).Trim() -split '\s+')[0]
  if ($expected -cnotmatch '^[A-Fa-f0-9]{64}$') { Fail 'Invalid APK checksum.' }
  $actual = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash
  if ($actual -cne $expected.ToUpperInvariant()) { Fail 'APK hash mismatch. Never upload a report for altered APK.' }
  return @{ Package = $package; Sha = $sha }
}
function Field($Object, [string]$Name) {
  if ($null -eq $Object) { return $null }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return $property.Value
}
function Phase-Checks($Phase) {
  $allowed = @(
    'offline_network_disabled_before_archive','app_startup_and_webview',
    'hive_card_last_event_and_empty_hive','archive_export_preflight_commit_rollback',
    'native_downloads_reject_incomplete_and_oversize','native_downloads_archive_hash_and_cleanup',
    'archive_rejects_unconfirmed_treatment','archive_revision_guard_preserves_new_treatment',
    'offline_network_disabled_after_restart','real_android_restart_persists_indexeddb',
    'real_card_renderer_after_restart'
  )
  $items = @()
  if ($null -eq $Phase) { return @() }
  if ((Field $Phase 'format') -cne 'paseka-device-test-v1') { Fail 'Unexpected device report format.' }
  foreach ($item in @(Field $Phase 'checks')) {
    if ($null -eq $item) { Fail 'Invalid empty check.' }
    $name = [string](Field $item 'name')
    $result = [string](Field $item 'result')
    if ($allowed -cnotcontains $name -or @('PASS','FAIL') -cnotcontains $result) {
      Fail 'Unknown check name or result: refuse to publish.'
    }
    if (@($items | Where-Object { $_.Name -ceq $name }).Count -gt 0) { Fail 'Duplicate check in report.' }
    $items += [PSCustomObject]@{ Name = $name; Result = $result }
  }
  if ($items.Count -gt 11) { Fail 'Too many checks.' }
  return ,$items
}
function Sanitize-Report([string]$Path) {
  $root = [IO.Path]::GetFullPath((Join-Path $KitDir 'reports')) + [IO.Path]::DirectorySeparatorChar
  $full = [IO.Path]::GetFullPath($Path)
  if (!$full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { Fail 'Report is not inside this isolated kit reports directory.' }
  if (!(Test-Path -LiteralPath $full -PathType Leaf)) { Fail 'No local report.json.' }
  if ((Get-Item -LiteralPath $full).Length -gt 128KB) { Fail 'Report too large.' }
  $identity = Require-KitIdentity
  $report = Get-Content -LiteralPath $full -Raw | ConvertFrom-Json
  if ((Field $report 'format') -cne 'paseka-windows-test-report-v1') { Fail 'Unexpected report format.' }
  $runId = [string](Field $report 'runId')
  if ($runId -cnotmatch '^[a-f0-9]{20}$') { Fail 'Invalid test run identifier.' }
  if ((Field $report 'testedPackage') -cne $identity.Package) { Fail 'Report is not for this isolated APK.' }
  $mode = [string](Field $report 'mode')
  $status = [string](Field $report 'status')
  if (@('normal','manual-offline') -cnotcontains $mode -or @('PASS','FAIL') -cnotcontains $status) {
    Fail 'Invalid mode or result.'
  }
  $phaseOne = Field $report 'phaseOne'
  $final = Field $report 'final'
  $pre = Phase-Checks $phaseOne
  $post = Phase-Checks $final
  foreach ($phase in @($phaseOne,$final)) {
    if ($null -ne $phase) {
      if ((Field $phase 'runId') -cne $runId -or (Field $phase 'mode') -cne $mode) {
        Fail 'Device and Windows report identities differ.'
      }
    }
  }
  $expectedPre = $(if ($mode -eq 'manual-offline') { 8 } else { 7 })
  $expectedPost = $(if ($mode -eq 'manual-offline') { 11 } else { 9 })
  if ($status -eq 'PASS') {
    if ($null -eq $phaseOne -or $null -eq $final -or
      (Field $phaseOne 'phase') -cne 'awaiting_restart' -or
      (Field $final 'phase') -cne 'complete' -or
      (Field $phaseOne 'pass') -cne $true -or (Field $final 'pass') -cne $true -or
      $pre.Count -ne $expectedPre -or $post.Count -ne $expectedPost -or
      @($post | Where-Object { $_.Result -cne 'PASS' }).Count -gt 0) {
      Fail 'PASS does not match expected test phases and check counts.'
    }
  }
  $lines = @(
    '<!-- paseka-test-agent:' + $runId + ' -->',
    '**Ручной тест Пасека / ' + $status + '**',
    '',
    '- Режим: ' + $mode,
    '- Test-only Android: ' + $identity.Package,
    '- CI SHA: ' + $identity.Sha,
    '- ID запуска: ' + $runId,
    '- Проверок до перезапуска: ' + @($pre | Where-Object { $_.Result -ceq 'PASS' }).Count + '/' + $pre.Count,
    '- Проверок после перезапуска: ' + @($post | Where-Object { $_.Result -ceq 'PASS' }).Count + '/' + $post.Count,
    '- Источник: локальный Windows 11 + USB/ADB, не CI и не production',
    '',
    '| Проверка | Результат |',
    '|---|---|'
  )
  foreach ($check in $post) { $lines += ('| ' + $check.Name + ' | ' + $check.Result + ' |') }
  $lines += ''
  $lines += 'Исходный JSON, детали ошибок, скриншоты и пользовательские данные **не передавались**.'
  if ($status -eq 'FAIL') { $lines += 'Диагностика FAIL доступна только в локальной папке reports.' }
  return [PSCustomObject]@{ Id=$runId; Body=($lines -join [Environment]::NewLine) }
}
function Page-ContainsMarker([object[]]$Comments, [string]$Marker) {
  foreach ($comment in $Comments) {
    # Windows PowerShell 5.1 may materialize an empty REST list as a null
    # element in @(...). Never access .body on a null under StrictMode.
    if ($null -eq $comment) { continue }
    $bodyProperty = $comment.PSObject.Properties['body']
    if ($null -eq $bodyProperty -or $null -eq $bodyProperty.Value -or
        $bodyProperty.Value -isnot [string]) {
      Fail 'Invalid GitHub comments response; refusing duplicate-unsafe upload.'
    }
    if ($bodyProperty.Value.Contains($Marker)) { return $true }
  }
  return $false
}
function Marker-Exists([string]$Marker,$Headers) {
  $baseUrl = 'https://api.github.com/repos/' + $Repository + '/issues/' + $IssueNumber + '/comments'
  for ($page=1; $page -le 100; $page++) {
    $result = Gh-Request -Method 'Get' -Url ($baseUrl + '?per_page=100&page=' + $page) -Headers $Headers
    $comments = @($result | Where-Object { $null -ne $_ })
    if (Page-ContainsMarker -Comments $comments -Marker $Marker) { return $true }
    if ($comments.Count -lt 100) { return $false }
  }
  Fail 'GitHub comment pagination limit reached: cannot safely prevent duplicates.'
}
function Test-CommentPagination {
  $marker = '<!-- paseka-test-agent:1234567890abcdefabcd -->'
  if (Page-ContainsMarker -Comments @($null) -Marker $marker) {
    Fail 'SelfTest: empty/null GitHub comments page was reported as a match.'
  }
  if (Page-ContainsMarker -Comments @() -Marker $marker) {
    Fail 'SelfTest: empty GitHub comments page was reported as a match.'
  }
  if (!(Page-ContainsMarker -Comments @([PSCustomObject]@{ body = $marker }) -Marker $marker)) {
    Fail 'SelfTest: matching GitHub comment was not detected.'
  }
  if (Page-ContainsMarker -Comments @([PSCustomObject]@{ body = 'unrelated comment' }) -Marker $marker) {
    Fail 'SelfTest: unrelated GitHub comment was reported as a match.'
  }
  $refused = $false
  try {
    [void](Page-ContainsMarker -Comments @([PSCustomObject]@{ id = 12 }) -Marker $marker)
  } catch {
    $refused = $_.Exception.Message -like '*Invalid GitHub comments response*'
  }
  if (!$refused) { Fail 'SelfTest: malformed GitHub comment was not rejected.' }
  Write-Host 'PASS: empty, null, matching, unrelated and malformed GitHub comments handled safely.'
}
function Send-Pending {
  if (!(Test-Path -LiteralPath $PendingDir)) { Write-Host 'No pending results.'; return }
  $files = @(Get-ChildItem -LiteralPath $PendingDir -Filter '*.txt' -File | Sort-Object Name)
  if ($files.Count -eq 0) { Write-Host 'No pending results.'; return }
  $headers = Auth-Headers
  $url = 'https://api.github.com/repos/' + $Repository + '/issues/' + $IssueNumber + '/comments'
  foreach ($file in $files) {
    $id = [IO.Path]::GetFileNameWithoutExtension($file.Name)
    if ($id -cnotmatch '^[a-f0-9]{20}$') { Fail 'Unsafe pending filename.' }
    $body = Get-Content -LiteralPath $file.FullName -Raw
    $marker = '<!-- paseka-test-agent:' + $id + ' -->'
    if (!$body.StartsWith($marker)) { Fail 'Pending report marker mismatch.' }
    if ($body.Length -gt 8000) { Fail 'Pending summary too large.' }
    if (Marker-Exists -Marker $marker -Headers $headers) {
      Remove-Item -LiteralPath $file.FullName -Force
      Write-Host ('Already published: ' + $id)
      continue
    }
    $payload = @{ body = $body } | ConvertTo-Json -Compress
    $response = Gh-Request -Method 'Post' -Url $url -Headers $headers -Body $payload
    if ([string]$response.html_url -notlike 'https://github.com/250oisr-eng/Pasekaapp/issues/198*') {
      Fail 'Unexpected GitHub response; pending result retained.'
    }
    Remove-Item -LiteralPath $file.FullName -Force
    Write-Host ('Uploaded synthetic summary: ' + $response.html_url)
  }
}
try {
  if ($Action -eq 'SelfTest') { Test-CommentPagination; exit 0 }
  if ($Action -eq 'Configure') { Configure-Token; exit 0 }
  if ($Action -eq 'RetryPending') { Send-Pending; exit 0 }
  if ([string]::IsNullOrWhiteSpace($ReportPath)) { Fail 'ReportPath is required.' }
  $sanitized = Sanitize-Report -Path $ReportPath
  if ($Action -eq 'DryRun') {
    Write-Output $sanitized.Body
    exit 0
  }
  [void](New-Item -Path $PendingDir -ItemType Directory -Force)
  $out = Join-Path $PendingDir ($sanitized.Id + '.txt')
  if (Test-Path -LiteralPath $out) { Fail 'Same report already pending. Use RetryPending to avoid duplicates.' }
  [IO.File]::WriteAllText($out, $sanitized.Body, (New-Object Text.UTF8Encoding($false)))
  Write-Host 'Sanitized report saved locally. Sending to GitHub issue #198...'
  Send-Pending
} catch {
  Write-Host ('REPORT UPLOAD NOT CONFIRMED: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Local report is preserved; retry with RETRY-REPORT-UPLOAD.cmd.'
  exit 1
}
