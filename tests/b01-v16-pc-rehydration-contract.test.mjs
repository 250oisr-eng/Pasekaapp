import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const bundle=join(root,'tools/b01-oneplus-safe-v9');
const runner=readFileSync(join(bundle,'RUN-ONEPLUS-UNIFIED-V16.ps1'),'utf8');
const start=readFileSync(join(bundle,'START-UNIFIED-V16.cmd'),'utf8');
const readme=readFileSync(join(bundle,'README-UNIFIED-V16.txt'),'utf8');
test('V16 is fully standalone with one launcher and one redacted result',()=>{
  assert.match(start,/RUN-ONEPLUS-UNIFIED-V16\.ps1/);
  assert.match(start,/explorer\.exe \/select/);
  assert.match(runner,/Join-Path \$base 'B01-RESULT.json'/);
  assert.match(runner,/Result already exists; no overwrite/);
  assert.match(runner,/priorTestFilesRequired=\$false/);
  assert.match(readme,/No old tests needed|NO USB or Android phone needed/i);
  assert.doesNotMatch(runner,/adb\.exe|Find-ModernAdb|Start-Process|Invoke-WebRequest|Copy-Item|Move-Item|Remove-Item|Read-Host/i);
});
test('V16 validates manifest, original SHA and TAR structure before writing',()=>{
  for(const code of ['CANDIDATE_SHA256_MISMATCH','TAR_HEADER_CHECKSUM_INVALID',
      'TAR_PAYLOAD_TRUNCATED','TAR_MANIFEST_ENTRY_COUNT_MISMATCH',
      'TAR_MISSING_EOF_OR_MEMBERS','TAR_NONZERO_AFTER_EOF','EXPECTED_EXACTLY_ONE_PRIVATE_TAR',
      'CANDIDATE_MANIFEST_UNSAFE','TAR_DUPLICATE_WINDOWS_MEMBER_PATH']){
    assert.ok(runner.includes(code),code);
  }
  const hash=runner.indexOf("Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256");
  const parse=runner.indexOf("$report.stage='READONLY_TAR_PREFLIGHT'");
  const write=runner.indexOf("$report.stage='SAFE_PC_RECONSTRUCTION'");
  assert.ok(hash>0 && parse>hash && write>parse);
  assert.match(runner,/appDatabasePathHints/);
  assert.match(runner,/indexedDbPathHints/);
});
test('V16 reconstruction destination protects from traversal/symlinks/overwrite',()=>{
  for(const code of ['PERSISTENT_ROOT_REPARSE_POINT','PERSISTENT_CANDIDATE_INSIDE_DISPOSABLE_TEST',
    'TAR_UNSAFE_MEMBER_PATH','TAR_LINK_OR_SPECIAL_ENTRY_NOT_SAFE_FOR_PC_RECONSTRUCTION',
    'TAR_DESTINATION_OUTSIDE_EMPTY_PC_ROOT','INVALID-PC-RECONSTRUCTION-NOT-BACKUP.txt',
    'FileMode]::CreateNew','pc-reconstruction-']){
      assert.ok(runner.includes(code),code);
  }
  assert.match(runner,/Fixed/);
  assert.match(runner,/independentlyComparedFiles/);
  assert.match(runner,/PC_REBUILT_FILE_BYTES_MISMATCH/);
});
test('V16 never claims Android app restoration or phone/media coverage',()=>{
  for(const code of [
    "adbUsed='NO'","phoneReads='NOT_ATTEMPTED'","phoneWrites='NOT_ATTEMPTED'",
    "appRestored='NOT_TESTED'","independentRestore='NOT_TESTED'",
    "fullBackupVerified=$false","backupCompleteness='NOT_VERIFIED'",
    "mediaStoreGalleryCoverage='NOT_TESTED'","videoCleanup='NOT_ATTEMPTED'",
    "network='NOT_ATTEMPTED'","install='NOT_ATTEMPTED'",
    "clear='NOT_ATTEMPTED'"]){
    assert.ok(runner.includes(code),code);
  }
  assert.match(runner,/PC_FILES_RECONSTRUCTED_NOT_ANDROID_RESTORE/);
  assert.match(readme,/NOT a functioning app restore/);
  assert.doesNotMatch(runner,/\$report\.(archivePath|sourcePaths|fileNames|tarMemberNames|privateContents)\s*=/);
});
test('V16 uses PowerShell 5.1 safe ASCII and no external tools',()=>{
 assert.ok([...runner].every(c=>c.charCodeAt(0)<128));
 assert.match(readme,/Windows PowerShell 5\.1/);
 assert.match(start,/%~dp0/);
 assert.match(readme,/SECOND local plaintext copy/);
 assert.doesNotMatch(readme,/[a-f0-9]{64}/);
});
