import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise the application's actual profile and assembly validators, without
// creating hives or touching IndexedDB. The functions are self-contained.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const begin = html.indexOf('function validateHiveProfile(');
const end = html.indexOf('function familyTransferBoxKeys(', begin);
assert.ok(begin >= 0 && end > begin, 'profile validator source must be present');
const { validateHiveProfile, validateHiveAssemblyProfile } = new Function(
  'cloneHiveProfile',
  html.slice(begin, end) + '\nreturn { validateHiveProfile, validateHiveAssemblyProfile };'
)(value => structuredClone(value));

function makeProfile(count) {
  const keys = Array.from({ length: count }, (_, i) => 'H' + (i + 1));
  return {
    id: 'test-only-honey-profile-' + count,
    schemaVersion: 1, family: 'test-only', status: 'ready', name: 'Test profile',
    frame: { heightMm: 180 },
    brood: { boxCount: 1, boxKeys: ['B1'], framesPerBox: 6 },
    honey: { boxCount: count, boxKeys: keys, framesPerBox: 10, installation: 'paired' },
    winter: { enabled: false }
  };
}
function check(profile, installed) {
  const layout = {
    mode: 'summer', installedBoxes: [], boxes: {},
    honeyBoxInstalled: installed,
    honeyFrames: installed.map(() => [])
  };
  return validateHiveAssemblyProfile(profile, layout);
}

test('legacy two-honey-body profile remains all-or-none', () => {
  const profile = makeProfile(2);
  for (const installed of [[false, false], [true, true]]) {
    assert.equal(check(profile, installed).ok, true, installed.join(','));
  }
  for (const installed of [[true, false], [false, true]]) {
    assert.ok(check(profile, installed).errors.some(x => x.code === 'honey_pair_mismatch'));
  }
});

test('four-body profile permits no pair, first pair, or both pairs', () => {
  const profile = makeProfile(4);
  assert.equal(validateHiveProfile(profile).ok, true);
  for (const installed of [
    [false, false, false, false],
    [true, true, false, false],
    [true, true, true, true]
  ]) {
    assert.equal(check(profile, installed).ok, true, installed.join(','));
  }
});

test('four-body profile rejects incomplete, reversed and scattered pairs', () => {
  const profile = makeProfile(4);
  for (const installed of [
    [true, false, false, false],
    [true, true, true, false],
    [true, false, true, false],
    [false, false, true, true],
    [true, true, false, true],
    [false, true, false, false]
  ]) {
    assert.ok(check(profile, installed).errors.some(x => x.code === 'honey_pair_mismatch'),
      installed.join(','));
  }
});

test('four-body profile fails closed on malformed lengths, flags and frames', () => {
  const profile = makeProfile(4);
  assert.ok(check(profile, [true, true]).errors.some(x => x.code === 'honey_installation_count_mismatch'));
  assert.ok(check(profile, [true, true, true, true, false]).errors.some(x => x.code === 'honey_installation_count_mismatch'));
  assert.ok(check(profile, [true, true, 1, 1]).errors.some(x => x.code === 'honey_installation_flag_invalid'));
  const damaged = { mode: 'summer', installedBoxes: [], boxes: {},
    honeyBoxInstalled: [true, true, false, false],
    honeyFrames: [[], [], [], { invalid: 'not an array' }] };
  assert.ok(validateHiveAssemblyProfile(profile, damaged).errors.some(x => x.code === 'honey_frames_invalid'));
});

test('non-paired custom profiles are unaffected', () => {
  const profile = makeProfile(4);
  profile.honey.installation = 'independent';
  assert.equal(check(profile, [false, true, false, false]).ok, true);
});
