import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const folder=join(root,'tools/b01-oneplus-safe-v9');
const runner=readFileSync(join(folder,'RUN-ONEPLUS-UNIFIED-V14.ps1'),'utf8');
const child=readFileSync(join(folder,'B01-ONEPLUS-SAFE-V9.ps1'),'utf8');
const launcher=readFileSync(join(folder,'START-UNIFIED-V14.cmd'),'utf8');
const guide=readFileSync(join(folder,'README-UNIFIED-V14.txt'),'utf8');
const mock=readFileSync(join(root,'tests/b01-v9-MockAdb.cs'),'utf8');
test('V14 provides exactly one visible root JSON and no legacy dependency',()=>{
  assert.match(launcher,/RUN-ONEPLUS-UNIFIED-V14.ps1/);
  assert.match(launcher,/explorer\.exe \/select/);
  assert.match(runner,/Join-Path \$base 'B01-RESULT.json'/);
  assert.match(runner,/already exists\. It was not overwritten/);
  assert.match(runner,/previousTestRequired=\$false/);
  assert.doesNotMatch(runner,/Find-ExistingPublicTar|Build-SearchRoots|Read-Host|Copy-Item|Move-Item|Remove-Item/);
  assert.match(guide,/No previous tests needed|No previous tests? .*needed/i);
});
test('V14 compares only independent public shell then exec-out on TAR failure',()=>{
  assert.match(runner,/Run-PublicProbe 'SHELL'/);
  assert.match(runner,/Run-PublicProbe 'EXEC_OUT'/);
  assert.match(runner,/elseif\(\$shell.stage -ne 'PUBLIC_TAR_GATE'\)/);
  assert.match(runner,/& \$script:v91 -PublicOnly -PublicTransport \$transport/);
  assert.match(child,/\[ValidateSet\('SHELL','EXEC_OUT'\)\]/);
  assert.match(child,/\$transport=if\(\$PublicTransport -eq 'EXEC_OUT'\)\{'exec-out'\}/);
  assert.match(child,/publicTarBytes=\[long\]\$r.bytes/);
  assert.match(child,/publicTarModulo512=\[int\]\(\$r.bytes % 512\)/);
  assert.match(child,/publicTarHostStderrClass=/);
  assert.match(mock,/SHELL_EMPTY_TAR_EXEC_VALID/);
  assert.match(mock,/BOTH_PUBLIC_EMPTY_TAR/);
});
test('V14 redacts all sensitive raw information and cannot claim full backup',()=>{
  for(const contract of [
    "privateTar='NOT_ATTEMPTED'",
    "fullBackupVerified=$false",
    "backupCompleteness='NOT_VERIFIED'",
    "independentRestore='NOT_TESTED'",
    "mediaStoreGalleryCoverage='NOT_TESTED'",
    "phoneWrites='NOT_ATTEMPTED'",
    "deleteOriginals='NOT_ATTEMPTED'",
    "network='NOT_ATTEMPTED'",
    "previousTestRequired=$false"
  ])assert.ok(runner.includes(contract),contract);
  assert.match(runner,/UNSAFE_CHILD_RESULT_REJECTED/);
  assert.match(runner,/PUBLIC_\x27\+\$transport\+\x27_BYTES_MISMATCH/);
  assert.doesNotMatch(runner,/\$report\.(serial|archivePath|tarContents|rawText|stderr)\s*=/);
  assert.match(runner,/BOTH_PUBLIC_TRANSPORTS_FAILED_CLASSIFIED/);
});
test('V14 is compatible with Windows PowerShell 5.1 without a BOM',()=>{
  assert.ok([...runner].every(c=>c.charCodeAt(0)<128));
  assert.match(launcher,/%~dp0/);
  assert.match(guide,/ONE LAUNCH:/);
  assert.match(guide,/B01-RESULT.json/);
});

test('PUBLIC capture bounded to forensic 64 MiB; private route remains separately gated',()=>{
  assert.ok(child.includes("$captureLimit=if($kind -eq 'PUBLIC'){[long]64*1024*1024}else{$maxBytes}"));
  assert.match(child,/EXEC_OUT_PUBLIC_ONLY/);
  assert.match(child,/if\(\$PublicTransport -eq 'EXEC_OUT' -and -not \$PublicOnly\)/);
});
