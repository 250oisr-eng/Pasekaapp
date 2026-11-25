import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const base=join(root,'tools','b01-oneplus-safe-v9');
const parent=readFileSync(join(base,'RUN-ONEPLUS-UNIFIED-V15.ps1'),'utf8');
const child=readFileSync(join(base,'B01-ONEPLUS-SAFE-V9.ps1'),'utf8');
const starter=readFileSync(join(base,'START-UNIFIED-V15.cmd'),'utf8');
const guide=readFileSync(join(base,'README-UNIFIED-V15.txt'),'utf8');
test('V15 one independent clean ZIP/START and single redacted root JSON',()=>{
  assert.match(starter,/RUN-ONEPLUS-UNIFIED-V15\.ps1/);
  assert.match(starter,/B01-RESULT\.json/);
  assert.match(starter,/explorer\.exe \/select/);
  assert.match(parent,/Join-Path \$base 'B01-RESULT.json'/);
  assert.match(parent,/priorTestRequired=\$false/);
  assert.doesNotMatch(parent,/Find-ExistingPublicTar|Build-SearchRoots|Copy-Item|Remove-Item|Move-Item/);
  assert.match(guide,/No old tests needed/);
});
test('V15 uses exec-out PUBLIC before exact user CAPTURE on private path',()=>{
  assert.match(parent,/\& \$child -PublicTransport EXEC_OUT -GatedPrivateCandidate/);
  assert.match(child,/if\(\$GatedPrivateCandidate -and \$PublicOnly\)/);
  assert.match(child,/if\(\$GatedPrivateCandidate -and \$PublicTransport -ne 'EXEC_OUT'\)/);
  assert.match(child,/if\(\$answer -cne 'CAPTURE'\)/);
  const publicStart=child.indexOf("$report.stage='PUBLIC_TAR_GATE'");
  const privatePrompt=child.indexOf("$answer=Read-Host 'Action'");
  const privateGrab=child.indexOf("$private=GrabTar");
  assert.ok(publicStart>0 && privatePrompt>publicStart && privateGrab>privatePrompt);
  assert.match(child,/exec-out run-as '\+\$pkg\+' tar -cf - \.'/);
  assert.match(child,/PRIVATE_CAPTURE_REQUIRES_GATED_WORKFLOW/);
  assert.match(child,/CONFLICTING_CAPTURE_FLAGS/);
});
test('V15 private candidate remains outside deleted tests and cannot be overwritten',()=>{
  assert.match(child,/PASEKA-B01-KEEP-PRIVATE-CANDIDATES/);
  assert.match(child,/CANDIDATE_INSIDE_DISPOSABLE_TEST_FOLDER/);
  assert.match(child,/CANDIDATE_DRIVE_NOT_FIXED_READY/);
  assert.match(child,/CANDIDATE_PATH_REPARSE_POINT/);
  assert.match(child,/FileMode\]::CreateNew/);
  assert.match(child,/candidateOutsideTestFolder=\$true/);
  assert.match(child,/candidateManifestWritten=\$true/);
  assert.match(child,/MANIFEST.json/);
  assert.match(child,/INVALID-CANDIDATE-NOT-BACKUP.txt/);
  assert.match(child,/FileMode\]::CreateNew/);
  assert.match(child,/privateTarSha256/);
});
test('V15 no false full backup or phone writes even with candidate success',()=>{
  const contracts=[
    "fullBackupVerified=$false",
    "backupCompleteness='NOT_VERIFIED'",
    "independentRestore='NOT_TESTED'",
    "mediaStoreGalleryCoverage='NOT_TESTED'",
    "phoneWrites='NOT_ATTEMPTED'",
    "deleteOriginals='NOT_ATTEMPTED'",
    "restore='NOT_ATTEMPTED'",
    "network='NOT_ATTEMPTED'"
  ];
  for(const item of contracts) assert.ok(parent.includes(item),item);
  assert.match(parent,/BUNDLED_CAPTURE_SAFETY_GATE_VIOLATION/);
  assert.match(parent,/PC_PRIVATE_CANDIDATE_ONLY/);
  assert.match(parent,/candidateManifestWritten -eq \$true/);
  assert.match(guide,/NOT a complete backup/);
  assert.doesNotMatch(parent,/\$r\.(serial|archivePath|stderr|tarContents|personalData)\s*=/);
});
test('V15 PowerShell source is ASCII safe for Windows PowerShell 5.1',()=>{
  assert.ok([...parent].every(c=>c.charCodeAt(0)<128));
  assert.match(starter,/%~dp0/);
  assert.match(guide,/CAPTURE/);
});
