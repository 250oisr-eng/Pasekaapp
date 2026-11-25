import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const tool=join(root,'tools','b01-oneplus-safe-v9');
const runner=readFileSync(join(tool,'RUN-ONEPLUS-UNIFIED-V12.ps1'),'utf8');
const v91=readFileSync(join(tool,'B01-ONEPLUS-SAFE-V9.ps1'),'utf8');
const cmd=readFileSync(join(tool,'START-UNIFIED-V12.cmd'),'utf8');
const guidance=readFileSync(join(tool,'README-UNIFIED-V12.txt'),'utf8');
test('V12 is standalone one click, preserves old archives and reports',()=>{
  assert.match(cmd,/RUN-ONEPLUS-UNIFIED-V12\.ps1/);
  assert.match(cmd,/%~dp0/);
  assert.match(runner,/unified-results/);
  assert.match(guidance,/SINGLE ZIP/);
  assert.match(guidance,/Do NOT copy/);
  assert.doesNotMatch(runner,/Copy-Item|Move-Item|Remove-Item|Invoke-WebRequest|DownloadFile\(/);
});
test('V12 expands read-only history search without remote roots or symlinks',()=>{
  assert.match(runner,/Build-SearchRoots/);
  assert.match(runner,/Build-FixedDriveRoots/);
  assert.ok(runner.includes('$script:scanned -ge 25000'));
  assert.ok(runner.includes('$watch.Elapsed.TotalSeconds -gt 90'));
  assert.match(runner,/DriveType\]::Fixed/);
  assert.match(runner,/User Shell Folders/);
  assert.match(runner,/Search-Roots @\(Build-FixedDriveRoots\)/);
  assert.match(runner,/ReparsePoint/);
  assert.match(runner,/SearchRoots = @\(\)/);
  assert.match(runner,/FixedSearchRoots = @\(\)/);
});
test('V12 does not turn file absence into implied USB authorization',()=>{
  assert.ok(runner.includes("$answer -cne 'PUBLIC'"));
  assert.match(runner,/NO_PREVIOUS_TAR_PUBLIC_USB_NOT_APPROVED/);
  assert.match(runner,/if\(\$Mode -eq 'USB'\)/);
  assert.ok(runner.includes('$scriptPath -PublicOnly'));
  assert.match(runner,/USB_PRIVATE_GATE_VIOLATION/);
  assert.doesNotMatch(runner,/\bCAPTURE\b/);
  assert.match(v91,/param\(\[switch\]\$PublicOnly,/);
  assert.match(v91,/if\(\$PublicOnly\)/);
  assert.match(v91,/PUBLIC_ONLY_EXPLICIT_MODE_NO_PRIVATE_READ/);
});
test('V12 never asserts a full backup; final output path-free and private-free',()=>{
  assert.match(runner,/fullBackupVerified=\$false/);
  assert.match(runner,/independentRestore='NOT_TESTED'/);
  assert.match(runner,/mediaStoreGalleryCoverage='NOT_TESTED'/);
  assert.match(runner,/priorPublicTarBytes/);
  assert.match(runner,/searchDirectoriesChecked/);
  assert.match(runner,/searchTruncated/);
  assert.doesNotMatch(runner,/\$report\.archivePath\s*=|\$report\.serial\s*=|\$report\.tarContents\s*=/);
});
test('V12 primary PowerShell script compatible with Windows PowerShell 5.1 encoding',()=>{
  assert.ok([...runner].every(x=>x.charCodeAt(0)<128),'V12 source must be ASCII');
  assert.ok(runner.includes('[IO.FileInfo]::new'));
});
