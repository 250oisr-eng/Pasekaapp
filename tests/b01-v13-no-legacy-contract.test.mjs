import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const dir=join(root,'tools','b01-oneplus-safe-v9');
const v13=readFileSync(join(dir,'RUN-ONEPLUS-UNIFIED-V13.ps1'),'utf8');
const v91=readFileSync(join(dir,'B01-ONEPLUS-SAFE-V9.ps1'),'utf8');
const launch=readFileSync(join(dir,'START-UNIFIED-V13.cmd'),'utf8');
const readme=readFileSync(join(dir,'README-UNIFIED-V13.txt'),'utf8');
const agents=readFileSync(join(root,'AGENTS.md'),'utf8');
const rules=readFileSync(join(root,'docs','ПРАВИЛА-РАЗРАБОТКИ.md'),'utf8');
test('V13 clean slate single launcher and report with no historical test requirements',()=>{
  assert.match(launch,/RUN-ONEPLUS-UNIFIED-V13\.ps1/);
  assert.match(launch,/%~dp0/);
  assert.match(v13,/schema='paseka-b01-unified-public-only-v13'/);
  assert.match(v13,/previousTestRequired=\$false/);
  assert.match(v13,/unified-results/);
  assert.doesNotMatch(v13,/Find-ExistingPublicTar|Build-SearchRoots|SearchRoots|FixedSearchRoots|Choose-ExistingPublicTar|PreviousPublicTarFound/);
  assert.doesNotMatch(v13,/Copy-Item|Move-Item|Remove-Item|Invoke-WebRequest|DownloadFile/);
  assert.match(readme,/REQUIRES NO PREVIOUS TESTS/);
});
test('V13 only calls bundled public-only branch and refuses private read',()=>{
  assert.match(v13,/\& \$v91 -PublicOnly/);
  assert.match(v13,/PRIVATE_OR_PHONE_WRITE_GATE_VIOLATION/);
  assert.match(v13,/data\.privateTar -ne 'NOT_ATTEMPTED'/);
  assert.match(v91,/param\(\[switch\]\$PublicOnly\)/);
  assert.match(v91,/if\(\$PublicOnly\)/);
  assert.match(v13,/privateTar='NOT_ATTEMPTED'/);
  assert.doesNotMatch(v13,/Read-Host|Invoke-WebRequest|start-process/i);
});
test('V13 reports only public TAR proof and never asserts recoverability',()=>{
  assert.match(v13,/publicTarBytes/);
  assert.match(v13,/publicTarRemainder512/);
  assert.match(v13,/publicTarTailErrorLike/);
  assert.match(v13,/fullBackupVerified=\$false/);
  assert.match(v13,/backupCompleteness='NOT_VERIFIED'/);
  assert.match(v13,/independentRestore='NOT_TESTED'/);
  assert.match(v13,/mediaStoreGalleryCoverage='NOT_TESTED'/);
  assert.match(v13,/phoneWrites='NOT_ATTEMPTED'/);
  assert.doesNotMatch(v13,/\$report\.(archivePath|deviceSerial|tarContents)\s*=/);
});
test('V13 PowerShell 5.1 script ASCII-only, no network and no extra prerequisites',()=>{
  assert.ok([...v13].every(ch=>ch.charCodeAt(0)<128));
  assert.match(v13,/B01-PUBLIC-TAR-FORENSIC-V10\.ps1/);
  assert.match(v13,/B01-ONEPLUS-SAFE-V9\.ps1/);
});
test('new policy explicitly treats previous tests as deleted and requires autonomy',()=>{
  assert.match(agents,/предыдущие тесты пользователь удаляет/);
  assert.match(agents,/все разрешённые этапы без «продолжай»/);
  assert.match(rules,/Предыдущие тесты пользователь удаляет/);
  assert.match(rules,/один конечный обезличенный JSON/);
  assert.match(rules,/Максимальная автономия работы/);
  assert.doesNotMatch(rules,/расширить поиск по разрешённым локальным фиксированным дискам/);
});
