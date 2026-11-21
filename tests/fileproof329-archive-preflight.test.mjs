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
