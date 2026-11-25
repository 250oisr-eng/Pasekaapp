import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditTarFile } from '../scripts/audit-oneplus-tar.mjs';

function header(name, data = Buffer.alloc(0), type = '0') {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  const field = (n, off, len) => h.write(n.toString(8).padStart(len - 1, '0') + '\0', off, len, 'ascii');
  field(0o644, 100, 8); field(0, 108, 8); field(0, 116, 8); field(data.length, 124, 12); field(0, 136, 12);
  h[156] = type.charCodeAt(0); h.write('ustar\0', 257, 6, 'ascii');
  h.fill(32, 148, 156);
  const sum = h.reduce((a, b) => a + b, 0);
  field(sum, 148, 8);
  return Buffer.concat([h, data, Buffer.alloc((512 - data.length % 512) % 512)]);
}
async function fixture(bytes, f) {
  const dir = await mkdtemp(join(tmpdir(), 'paseka-tar-unit-'));
  const path = join(dir, 'synthetic.tar');
  try { await writeFile(path, bytes); return await f(path); } finally { await rm(dir, { recursive: true, force: true }); }
}
const tail = Buffer.alloc(1024);
test('valid synthetic tar header path counts are metadata, not restore proof', async () => {
  await fixture(Buffer.concat([header('data/data/ru.paseka.journal/app_webview/IndexedDB/000001.ldb', Buffer.from('FAKE')), tail]), async path => {
    const result = await auditTarFile(path);
    assert.equal(result.status, 'TAR_HEADER_INDEX_VERIFIED_ONLY');
    assert.equal(result.counts.indexedDb, 1);
    assert.equal(result.allUserDataBackedUp, false);
    assert.equal(result.independentRestoreVerified, false);
  });
});
test('missing IndexedDB is reported, not counted as backup', async () => {
  await fixture(Buffer.concat([header('public/readme.txt', Buffer.from('FAKE')), tail]), async path => {
    const result = await auditTarFile(path);
    assert.equal(result.containsRecognizedIndexedDb, false);
  });
});
test('corrupt header checksum is blocked', async () => {
  const h = header('a.txt'); h[0] ^= 1;
  await fixture(Buffer.concat([h, tail]), path => assert.rejects(auditTarFile(path), /BAD_TAR_HEADER_CHECKSUM/));
});
test('incomplete tar length is blocked', async () => {
  await fixture(Buffer.concat([header('a.txt'), tail, Buffer.from([12])]), path => assert.rejects(auditTarFile(path), /INVALID_TAR_LENGTH/));
});
test('traversal path is blocked', async () => {
  await fixture(Buffer.concat([header('../escape.txt'), tail]), path => assert.rejects(auditTarFile(path), /UNSAFE_OR_EMPTY_TAR_PATH/));
});
test('missing terminal zero blocks is blocked', async () => {
  await fixture(header('a.txt', Buffer.alloc(512)), path => assert.rejects(auditTarFile(path), /TAR_MISSING_EOF_BLOCKS/));
});
test('truncated entry payload is blocked', async () => {
  const h = header('a.txt', Buffer.alloc(0));
  h.write('00000010000\0', 124, 12, 'ascii'); h.fill(32, 148, 156);
  const sum = h.subarray(0, 512).reduce((a,b) => a+b,0);
  h.write(sum.toString(8).padStart(7,'0')+'\0',148,8,'ascii');
  await fixture(Buffer.concat([h, tail]), path => assert.rejects(auditTarFile(path), /TAR_ENTRY_OUT_OF_BOUNDS/));
});
