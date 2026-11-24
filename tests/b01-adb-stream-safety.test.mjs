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
