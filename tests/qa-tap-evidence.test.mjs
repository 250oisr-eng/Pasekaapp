import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessTapSummary, assessTapFile } from '../scripts/qa-tap-evidence.mjs';

const makeTap = (override = {}) => {
  const values = { tests: 3, pass: 3, fail: 0, cancelled: 0,
    skipped: 0, todo: 0, ...override };
  return ['TAP version 13', '1..3', '# tests ' + values.tests,
    '# suites 0', '# pass ' + values.pass, '# fail ' + values.fail,
    '# cancelled ' + values.cancelled, '# skipped ' + values.skipped,
    '# todo ' + values.todo, '# duration_ms 12.5', ''].join('\n');
};

test('a complete successful Node TAP suite proves synthetic CI only', () => {
  const result = assessTapSummary(makeTap());
  assert.equal(result.status, 'PASS_SYNTHETIC');
  assert.equal(result.tests, 3);
  assert.equal(result.pass, 3);
  assert.equal(result.physicalDeviceVerified, false);
  assert.equal(result.independentRestoreVerified, false);
  assert.equal(result.videoDeletionAuthorized, false);
  assert.equal(result.releaseAuthorized, false);
});

test('one failed regression is FAIL, not successful CI evidence', () => {
  const result = assessTapSummary(makeTap({ pass: 2, fail: 1 }));
  assert.equal(result.status, 'FAIL');
  assert.equal(result.tests, 3);
});

test('cancelled, skipped and todo tests cannot be counted as a complete suite', () => {
  for (const field of ['cancelled', 'skipped', 'todo']) {
    const counts = { pass: 2, [field]: 1 };
    const result = assessTapSummary(makeTap(counts));
    assert.equal(result.status, 'PARTIAL', field);
    assert.equal(result.releaseAuthorized, false);
  }
});

test('missing, malformed, duplicated or concatenated TAP summaries fail closed', () => {
  const complete = makeTap();
  const invalid = [
    null, {}, '', 'not TAP', '# tests 3\n# pass 3',
    complete.replace('# fail 0\n', ''),
    complete.replace('# skipped 0', '# skipped unknown'),
    complete.replace('# todo 0', '# todo 0\n# todo 0'),
    complete + complete,
    complete.replace('# tests 3', '# tests 3\n# tests 3'),
    complete.replace('TAP version 13', 'TAP version 12'),
    complete.replace('1..3\n', ''),
    complete.replace('1..3\n', '1..3\n1..3\n'),
    complete.replace('1..3\n', '').replace('# duration_ms 12.5', '# duration_ms 12.5\n1..3')
  ];
  for (const input of invalid) {
    assert.equal(assessTapSummary(input).status, 'NOT_VERIFIED',
      typeof input === 'string' ? input.slice(0, 40) : String(input));
  }
});

test('inconsistent, zero and unsafe-number summary counts are NOT_VERIFIED', () => {
  for (const input of [
    makeTap({ tests: 4 }),
    makeTap({ tests: 0, pass: 0 }),
    makeTap({ pass: 4 }),
    makeTap({ tests: 9007199254740992, pass: 9007199254740992 })
  ]) assert.equal(assessTapSummary(input).status, 'NOT_VERIFIED');
});

test('local TAP file is read-only and preserves its original bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paseka-qa-tap-'));
  const path = join(dir, 'synthetic.tap');
  const data = makeTap();
  try {
    writeFileSync(path, data);
    assert.equal(assessTapFile(path).status, 'PASS_SYNTHETIC');
    assert.equal(readFileSync(path, 'utf8'), data);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('TAP file rejects missing path, symlink, non-file, empty and oversized logs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'paseka-qa-tap-'));
  const good = join(dir, 'test.tap'), link = join(dir, 'link.tap');
  const empty = join(dir, 'empty.tap'), large = join(dir, 'large.tap');
  try {
    writeFileSync(good, makeTap());
    writeFileSync(empty, '');
    writeFileSync(large, '');
    truncateSync(large, 16 * 1024 * 1024 + 1);
    symlinkSync(good, link);
    assert.throws(() => assessTapFile(''), /TAP_PATH_REQUIRED/);
    assert.throws(() => assessTapFile(link), /INVALID_TAP_FILE/);
    assert.throws(() => assessTapFile(empty), /INVALID_TAP_FILE/);
    assert.throws(() => assessTapFile(large), /INVALID_TAP_FILE/);
    assert.throws(() => assessTapFile(dir), /INVALID_TAP_FILE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
