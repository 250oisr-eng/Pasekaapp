// Read-only, off-device preflight for the ONE synthetic fileproof329 archive.
// Does not connect to Android, write files, open IndexedDB or perform restore commits.
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { runInThisContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
runInThisContext(readFileSync(resolve(here, '../js/paseka-archive.js'), 'utf8'));
const archive = globalThis.PasekaArchive;
const EXPECTED = Object.freeze({
  size: 3158,
  sha: '4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186',
  ids: ['android-proof-black', 'android-proof-white'],
  hashes: [
    '794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
    'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'
  ]
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function requireProof(condition, code) {
  if (!condition) throw new Error(code);
}
export async function verifyFileproof329Buffer(buffer) {
  requireProof(Buffer.isBuffer(buffer), 'INPUT_MUST_BE_BUFFER');
  requireProof(buffer.length === EXPECTED.size, 'ARCHIVE_SIZE_MISMATCH');
  requireProof(sha(buffer) === EXPECTED.sha, 'ARCHIVE_SHA256_MISMATCH');
  const blob = new Blob([buffer], {type:'application/vnd.paseka.archive'});
  const parsed = await archive.parseArchiveBlob(blob);
  requireProof(parsed.videoCount === 2 && parsed.entries.length === 3, 'ARCHIVE_ENTRY_COUNT_MISMATCH');
  await archive.verifyArchive(blob, parsed, webcrypto);
  const proof = await archive.validateArchiveForRestore(blob, webcrypto, state =>
    !!state && state.meta?.schemaVersion === 15 &&
    Array.isArray(state.hives) && state.hives.length === 1);
  requireProof(proof.orphanVideoIds.length === 0, 'ORPHAN_VIDEO_FOUND');
  for (let i = 0; i < 2; i++) {
    const item = proof.videoEntries[i];
    requireProof(item.metadata.id === EXPECTED.ids[i], 'VIDEO_ID_MISMATCH');
    requireProof(item.metadata.mimeType === 'video/mp4' && item.size === 893, 'VIDEO_METADATA_MISMATCH');
    const actual = Buffer.from(await item.blob.arrayBuffer());
    requireProof(sha(actual) === EXPECTED.hashes[i], 'SOURCE_VIDEO_SHA256_MISMATCH');
  }
  return Object.freeze({ status:'FILEPROOF329_RESTORE_PREFLIGHT_PASS', archiveBytes:buffer.length,
    archiveSha256:EXPECTED.sha, videoCount:2, restoreCommit:'NOT_TESTED',
    mp4Decoder:'NOT_TESTED', cleanupAuthorized:false });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Only a path explicitly passed by the operator is opened; never modify it.
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) {
    process.stderr.write('USAGE: node tools/fileproof329-archive-preflight.mjs <local-synthetic-archive.paseka>\n');
    process.exitCode = 2;
  } else {
    try {
      const result = await verifyFileproof329Buffer(readFileSync(path));
      for (const [key,value] of Object.entries(result)) process.stdout.write(key+': '+value+'\n');
    } catch (error) {
      process.stderr.write('STATUS: BLOCKED\nDETAIL: '+String(error.code || error.message).slice(0,120)+'\n');
      process.exitCode = 2;
    }
  }
}
