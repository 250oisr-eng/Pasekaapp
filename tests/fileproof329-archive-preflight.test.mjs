import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { verifyFileproof329Buffer } from '../tools/fileproof329-archive-preflight.mjs';

const source = readFileSync(new URL('../tools/fileproof329-archive-preflight.mjs',import.meta.url),'utf8');
test('preflight has no device, filesystem writes, restores or cleanup',()=>{
  for (const forbidden of [/\badb\s+-d\b/,/\bwriteFile(?:Sync)?\s*\(/,/\bunlink(?:Sync)?\s*\(/,/\.restoreArchive\s*\(/,/\.delete\s*\(/, /\bexec(?:File|Sync)?\s*\(/]) {
    assert.doesNotMatch(source,forbidden);
  }
  assert.match(source,/validateArchiveForRestore/);
  assert.match(source,/verifyArchive/);
  assert.match(source,/cleanupAuthorized:false/);
});
test('preflight fail-closed on nonbinary and wrong-sized data',async()=>{
  await assert.rejects(verifyFileproof329Buffer('string'),/INPUT_MUST_BE_BUFFER/);
  await assert.rejects(verifyFileproof329Buffer(Buffer.alloc(0)),/ARCHIVE_SIZE_MISMATCH/);
  await assert.rejects(verifyFileproof329Buffer(Buffer.alloc(3158)),/ARCHIVE_SHA256_MISMATCH/);
});
test('preflight fail-closed on synthetic PASEKA01 with wrong pinned digest',async()=>{
  runInThisContext(readFileSync(new URL('../js/paseka-archive.js',import.meta.url),'utf8'));
  const a = globalThis.PasekaArchive;
  const state = Buffer.from(JSON.stringify({app:'Paseka',state:{meta:{schemaVersion:15},hives:[{id:'isolated'}]}}));
  const h = createHash('sha256').update(state).digest('hex');
  const manifest={format:'paseka-archive',version:1,backupId:'negative-case',createdAt:'2026-11-21T00:00:00Z',schemaVersion:15,
    entries:[{path:'state.json',kind:'state',size:state.length,mimeType:'application/json',chunkSize:1048576,chunkSha256:[h]}]};
  const bytes = Buffer.from(await a.buildArchiveBlob(manifest,[state]).arrayBuffer());
  await assert.rejects(verifyFileproof329Buffer(bytes),/ARCHIVE_SIZE_MISMATCH|ARCHIVE_SHA256_MISMATCH/);
  assert.equal(await a.verifyArchive(new Blob([bytes]),await a.parseArchiveBlob(new Blob([bytes])),webcrypto),true);
});

test('physical Android preflight permits only read-only ADB operations and pinned synthetic path',()=>{
  const ps=readFileSync(new URL('../tools/android-fileproof329-readonly-preflight.ps1',import.meta.url),'utf8');
  assert.match(ps,/EXTERNAL_ARCHIVE: SHA256_PASS/);
  assert.match(ps,/VIDEO_2_SHA256: PASS/);
  assert.match(ps,/PRIVATE_REPORT_SHA_CHANGED/);
  assert.match(ps,/ONLY_ONE_PINNED_SYNTHETIC_ARCHIVE_REQUIRED/);
  assert.match(ps,/PASEKA01/);
  assert.match(ps,/run-as/);
  for (const forbidden of [/force-stop/,/\binstall\b/i,/\bpm\s+clear\b/i,/\buninstall\b/i,/\brestore\s+commit\b/i,/\bRemove-Item\b/i,/\bSet-Content\b/i,/\bOut-File\b/i,/\bexec-out\s+rm\b/i]) {
    assert.doesNotMatch(ps.replace(/^\s*#.*$/gm,''),forbidden);
  }
});

test('physical ADB preflight is bounded and reports checkpoints before slow reads',()=>{
  const ps=readFileSync(new URL('../tools/android-fileproof329-readonly-preflight.ps1',import.meta.url),'utf8');
  assert.match(ps,/WaitForExit\(12000\)/);
  assert.match(ps,/WaitForExit\(2000\)/);
  assert.match(ps,/ADB_TIMEOUT_12S/);
  assert.match(ps,/BaseStream\.CopyToAsync\(\$stream\)/);
  assert.match(ps,/StandardError\.ReadToEndAsync\(\)/);
  for(let i=1;i<=5;i++) assert.match(ps,new RegExp('STAGE: '+i+'/5 '));
  assert.ok(ps.indexOf('STAGE: 1/5') < ps.indexOf("$devices=AdbText"));
  assert.ok(ps.indexOf('STAGE: 4/5') < ps.indexOf("$bytes=Adb"));
  assert.match(ps,/NO_INSTALL_NO_RESET_NO_STOP_NO_RESTORE_NO_DELETE/);
});

test('ADB receives explicit argv, not PowerShell automatic args',()=>{
  const ps=readFileSync(new URL('../tools/android-fileproof329-readonly-preflight.ps1',import.meta.url),'utf8');
  assert.match(ps,/function Adb\(\[string\[\]\]\$argv\)/);
  assert.match(ps,/function AdbText\(\[string\[\]\]\$argv\)/);
  assert.match(ps,/\$p\.Arguments=\$argv -join ' '/);
  assert.doesNotMatch(ps,/function Adb\(\[string\[\]\]\$args\)/);
  assert.match(ps,/ADB_DIAGNOSTIC:/);
  assert.match(ps,/ADB_EXIT_/);
});

test('ADB binary stream discards successful async CopyTo Task result',()=>{
  const ps=readFileSync(new URL('../tools/android-fileproof329-readonly-preflight.ps1',import.meta.url),'utf8');
  assert.match(ps,/\[void\]\$stdoutTask\.GetAwaiter\(\)\.GetResult\(\)/);
  assert.match(ps,/return ,\$stream\.ToArray\(\)/);
  assert.doesNotMatch(ps,/^\s*\$stdoutTask\.GetAwaiter\(\)\.GetResult\(\)/m);
});
