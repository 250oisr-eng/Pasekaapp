import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const folder=join(root,'tools/b01-oneplus-safe-v9');
const runner=readFileSync(join(folder,'RUN-ONEPLUS-UNIFIED-V11.ps1'),'utf8');
const launcher=readFileSync(join(folder,'START-ONEPLUS-UNIFIED.cmd'),'utf8');
const guide=readFileSync(join(folder,'README-UNIFIED-V11.txt'),'utf8');
const rules=readFileSync(join(root,'AGENTS.md'),'utf8');
test('V11 one independent double-click entry with self-contained sibling scripts',()=>{
  assert.match(launcher,/RUN-ONEPLUS-UNIFIED-V11\.ps1/);
  assert.match(launcher,/%~dp0/);
  assert.match(runner,/B01-PUBLIC-TAR-FORENSIC-V10\.ps1/);
  assert.match(runner,/B01-ONEPLUS-SAFE-V9\.ps1/);
  assert.match(runner,/unified-results/);
  assert.match(guide,/НИЧЕГО переносить/);
});
test('V11 scans only bounded local directories, original result paths remain unchanged',()=>{
  assert.match(runner,/Find-ExistingPublicTar/);
  assert.match(runner,/\$scanned -lt 6000/);
  assert.match(runner,/\$node\.depth -ge 7/);
  assert.match(runner,/ReparsePoint/);
  assert.match(runner,/public-only-v9\.tar/);
  assert.match(runner,/if\(\$found\.Count -eq 0\)\{return \$null\}/);
  assert.match(runner,/Sort-Object LastWriteTimeUtc -Descending/);
  assert.doesNotMatch(runner,/Copy-Item|Move-Item|Remove-Item|Invoke-WebRequest|DownloadFile\(/);
});
test('V11 default local mode cannot silently invoke USB or private capture',()=>{
  assert.match(runner,/\[ValidateSet\('Auto','Local','USB'\)\]\[string\]\$Mode = 'Auto'/);
  assert.match(runner,/if\(\$Mode -eq 'USB'\)/);
  assert.match(runner,/\$answer -cne 'USB'/);
  assert.match(runner,/Choose-ExistingPublicTar/);
  assert.match(runner,/\[switch\]\$NoPicker/);
  assert.doesNotMatch(runner,/Read-Host ['\"]?CAPTURE/);
});
test('V11 final sanitized JSON cannot claim full restoration or leak filenames',()=>{
  assert.match(runner,/fullBackupVerified=\$false/);
  assert.match(runner,/backupCompleteness='NOT_VERIFIED'/);
  assert.match(runner,/independentRestore='NOT_TESTED'/);
  assert.match(runner,/mediaStoreGalleryCoverage='NOT_TESTED'/);
  assert.match(runner,/originalFilesDeleted='NO'/);
  assert.match(runner,/Get-Content -LiteralPath \$new\[0\]\.FullName -Raw/);
  assert.match(runner,/PUBLIC_TAR_DIAGNOSED_BACKUP_NOT_VERIFIED/);
  assert.doesNotMatch(runner,/\.archivePath\s*=|\$report\.serial|\$report\.tarContents/);
});
test('mandatory project rule favors standalone one-launch tools over patching old folders',()=>{
  assert.match(rules,/Каждый тест — один самостоятельный ZIP\/START\/JSON/);
  assert.match(rules,/старые тесты пользователь удаляет/i);
});

test('V11 remains parseable under Windows PowerShell 5.1 default file encoding',()=>{
  assert.ok([...runner].every(c=>c.charCodeAt(0)<128),
    'Standalone PowerShell 5.1 entry should be 7-bit ASCII without a BOM');
  assert.match(runner,/\[IO\.DirectoryInfo\]::new\(\$root\)/);
  assert.match(runner,/\[IO\.FileInfo\]::new\(\$candidate\)/);
});
