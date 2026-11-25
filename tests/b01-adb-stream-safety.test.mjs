import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// B01: ADB exec-out raw protocol can combine remote stderr with binary stdout.
// The capture must verify the exact byte count and SHA, not merely exit=0.
const expectedBytes = 5 * 1024 * 1024;
const expectedHash = 'c036cbb7553a909f8b8877d4461924307f27ecb66cff928eeeafd569c3887e29';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const exactZero = data => data.length === expectedBytes && sha256(data) === expectedHash;
const alignedTar = data => data.length >= 1024 && data.length % 512 === 0;
const allZero = Buffer.alloc(expectedBytes, 0);

test('B01 synthetic: separated binary stdout retains exact 5 MiB and SHA', () => {
  assert.equal(exactZero(allZero), true);
});

test('B01 synthetic: 87 appended diagnostic bytes invalidate raw ADB stdout despite exit=0', () => {
  const remoteDiagnostic = Buffer.from('x'.repeat(87), 'ascii');
  const contaminated = Buffer.concat([allZero, remoteDiagnostic]);
  assert.equal(contaminated.length, expectedBytes + 87);
  assert.equal(exactZero(contaminated), false);
});

test('B01 synthetic: stderr separation preserves binary payload independently of diagnostics', () => {
  const stdout = Buffer.from(allZero);
  const stderr = Buffer.from('5120+0 records in\n5120+0 records out\n5242880 bytes copied\n');
  assert.equal(exactZero(stdout), true);
  assert.equal(stderr.toString('utf8').includes('records out'), true);
});

test('B01 synthetic: TAR-size guard rejects both a complete block and contaminated partial block', () => {
  const clean = Buffer.alloc(512 * 20);
  const contaminated = Buffer.concat([clean, Buffer.alloc(87)]);
  assert.equal(alignedTar(clean), true);
  assert.equal(alignedTar(contaminated), false);
});

test('B01 synthetic: correct size alone is not enough without integrity hash', () => {
  const modified = Buffer.from(allZero);
  modified[expectedBytes - 1] = 1;
  assert.equal(modified.length, expectedBytes);
  assert.equal(exactZero(modified), false);
});

const exactSmallZero = ({stdout, stderr = '', exitCode = 0}) =>
  exitCode === 0 && stderr.length === 0 && stdout.length === 16 && stdout.every(byte => byte === 0);

test('B01 synthetic: exact 16-byte zero preflight is required before large transfer', () => {
  assert.equal(exactSmallZero({stdout:Buffer.alloc(16)}), true);
  assert.equal(exactSmallZero({stdout:Buffer.from('error: '.padEnd(75, '!')),exitCode:0}), false);
  assert.equal(exactSmallZero({stdout:Buffer.alloc(16),stderr:'warning'}), false);
  const wrongSameSize = Buffer.alloc(16);
  wrongSameSize[15] = 1;
  assert.equal(exactSmallZero({stdout:wrongSameSize}), false);
  assert.equal(exactSmallZero({stdout:Buffer.alloc(16),exitCode:1}), false);
});

test('B01 synthetic: Android mksh chvt diagnostic is not binary success despite ADB exit 0', () => {
  const chvt = Buffer.from("/system/bin/sh: chvt: can't find tty:  head -c 16 /dev/zero  ");
  assert.equal(chvt.length, 61);
  assert.equal(exactSmallZero({stdout:chvt,stderr:'',exitCode:0}), false);
  const noPtyWithClosedStdin = ['shell', 'head', '-c', '16', '/dev/zero'];
  assert.equal(noPtyWithClosedStdin.includes('-T'), false);
});

test('B01 synthetic: missing shell_v2 flag is not evidence that exact raw public bytes fail', () => {
  const probe = ({stdout, exitCode, hostStderr, shellV2Advertised}) => {
    // shellV2Advertised is metadata only: raw exec-out is independently verified.
    void shellV2Advertised;
    return exitCode === 0 && hostStderr === '' && stdout.length === 16 &&
      stdout.every(byte => byte === 0);
  };
  assert.equal(probe({stdout:Buffer.alloc(16),exitCode:0,hostStderr:'',shellV2Advertised:false}), true);
  assert.equal(probe({stdout:Buffer.alloc(16),exitCode:0,hostStderr:'',shellV2Advertised:true}), true);
  assert.equal(probe({stdout:Buffer.concat([Buffer.alloc(16),Buffer.from('stderr')]),exitCode:0,hostStderr:'',shellV2Advertised:false}), false);
  assert.equal(probe({stdout:Buffer.alloc(16),exitCode:0,hostStderr:'unexpected',shellV2Advertised:false}), false);
});

test('B01 synthetic: dd-like remote diagnostics merged into raw exec-out must fail size check', () => {
  const data = Buffer.concat([Buffer.alloc(16),Buffer.from('16+0 records out\n')]);
  assert.notEqual(data.length,16);
  assert.equal(data.subarray(0,16).every(byte => byte === 0),true);
  // A prefix-only check is inadequate: raw transport must compare the whole stream.
});

test('B01 device V6 regression: 1,090-byte public TAR is never accepted despite raw ADB exit zero', () => {
  // The physical report had four exact zero-byte transfers, then a 1090-byte TAR.
  // Raw exec-out can mix remote diagnostic bytes into output; cause not yet proven.
  const purportedTar = Buffer.concat([Buffer.alloc(1024), Buffer.alloc(66, 0x45)]);
  assert.equal(purportedTar.length, 1090);
  assert.equal(purportedTar.length % 512, 66);
  assert.equal(alignedTar(purportedTar), false);
  const exitCode = 0;
  assert.equal(exitCode === 0 && alignedTar(purportedTar), false);
});

test('B01 device V6 regression: zero payload integrity and public TAR validity are independent gates', () => {
  const plain16 = Buffer.alloc(16);
  const runAs16 = Buffer.alloc(16);
  const plain5MiB = allZero;
  const runAs5MiB = Buffer.from(allZero);
  const malformedTar = Buffer.alloc(1090);
  const zeroBytesVerified = [plain16, runAs16].every(b => b.length === 16 && b.every(x => x === 0)) &&
    exactZero(plain5MiB) && exactZero(runAs5MiB);
  assert.equal(zeroBytesVerified, true);
  assert.equal(alignedTar(malformedTar), false);
  assert.equal(zeroBytesVerified && alignedTar(malformedTar), false);
});


function tarHeaderChecksum(block) {
  let sum = 0;
  for (let index = 0; index < 512; index++) {
    sum += index >= 148 && index < 156 ? 32 : block[index];
  }
  return sum;
}
function writeOctal(block, start, width, value) {
  const digits = value.toString(8).padStart(width - 1, '0');
  block.write(digits + '\\0', start, width, 'ascii');
}
function verifyFirstTarHeader(archive) {
  if (archive.length < 1536 || archive.length % 512 !== 0) return false;
  const block = archive.subarray(0, 512);
  const stored = block.subarray(148, 156).toString('ascii').replace(/\\0.*$/, '').trim();
  if (!/^[0-7]+$/.test(stored)) return false;
  if (parseInt(stored, 8) !== tarHeaderChecksum(block)) return false;
  // Fixture represents an empty member followed by two end-of-archive blocks.
  return archive.subarray(512).every(byte => byte === 0);
}

test('B01 V8 regression: exit zero and 512 alignment do not override bad TAR header checksum', () => {
  const clean = Buffer.alloc(1536);
  clean.write('synthetic.txt', 0, 'ascii');
  writeOctal(clean, 100, 8, 0o644);
  writeOctal(clean, 108, 8, 0);
  writeOctal(clean, 116, 8, 0);
  writeOctal(clean, 124, 12, 0);
  writeOctal(clean, 136, 12, 0);
  clean.fill(32, 148, 156);
  clean[156] = '0'.charCodeAt(0);
  writeOctal(clean, 148, 8, tarHeaderChecksum(clean.subarray(0, 512)));
  assert.equal(verifyFirstTarHeader(clean), true);

  const bad = Buffer.from(clean);
  bad[0] ^= 1; // Same length and valid-looking member; checksum now invalid.
  assert.equal(bad.length % 512, 0);
  assert.equal(verifyFirstTarHeader(bad), false);
  assert.equal(0 === 0 && verifyFirstTarHeader(bad), false);
});

test('B01 V8 regression: broken/truncated TAR and polluted EOF remain rejected', () => {
  const empty = Buffer.alloc(1536);
  assert.equal(verifyFirstTarHeader(empty), false);
  const poisoned = Buffer.alloc(1536, 0);
  poisoned.write('synthetic', 0, 'ascii');
  poisoned[148] = '0'.charCodeAt(0);
  assert.equal(verifyFirstTarHeader(poisoned), false);
  assert.equal(verifyFirstTarHeader(Buffer.alloc(1024)), false);
});
