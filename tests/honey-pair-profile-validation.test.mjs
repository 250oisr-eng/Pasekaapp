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

function applyProfileHoneySelection(profile, choices, current=[false, false, false, false]) {
  const begin = html.indexOf('function applyProfileAssemblySelection()');
  const end = html.indexOf('async function finishProfileAssemblySetup(', begin);
  assert.ok(begin > 0 && end > begin, 'profile assembly UI handler exists');
  const layout={mode:'summer',installedBoxes:['B1'],honeyBoxInstalled:current.slice()};
  const alerts=[];
  let renders=0;
  const selected = new Set(profile.honey.boxKeys.filter((key,i)=>choices[i]));
  const apply = new Function('selectedStructureHive','layoutFor','profileForHive','profileHoneyKeys',
    'document','alert','renderStructure',html.slice(begin,end)+'\nreturn applyProfileAssemblySelection;')(
    ()=>'test-hive',()=>layout,()=>profile,()=>profile.honey.boxKeys,
    {querySelectorAll:()=>[],querySelector:selector=>{
      const match=selector.match(/data-profile-honey="([^"]+)"/);
      return match && selected.has(match[1])?{checked:true}:null;
    }},
    text=>alerts.push(text),()=>{renders++}
  );
  apply();
  return {layout,alerts,renders};
}

test('four-body profile UI preserves first complete pair and both pairs',()=>{
 const profile=makeProfile(4);
 for(const chosen of [
   [false,false,false,false],
   [true,true,false,false],
   [true,true,true,true]
 ]) {
   const result=applyProfileHoneySelection(profile,chosen);
   assert.deepEqual(result.layout.honeyBoxInstalled,chosen);
   assert.equal(result.alerts.length,0);
   assert.equal(result.renders,1);
 }
});

test('four-body profile UI rejects incomplete or reversed pairs without modifying layout',()=>{
 const profile=makeProfile(4);
 for(const chosen of [
  [true,false,false,false],
  [true,true,true,false],
  [false,false,true,true],
  [true,false,true,false],
  [true,true,false,true]
 ]) {
  const existing=[true,true,false,false];
  const result=applyProfileHoneySelection(profile,chosen,existing);
  assert.deepEqual(result.layout.honeyBoxInstalled,existing,chosen.join(','));
  assert.deepEqual(result.layout.installedBoxes,['B1'],'unrelated brood selection must remain unchanged');
  assert.equal(result.alerts.length,1);
  assert.equal(result.renders,0);
 }
});

test('legacy two-body paired profile keeps existing all-or-none selection behavior',()=>{
 const profile=makeProfile(2);
 const result=applyProfileHoneySelection(profile,[true,false],[true,true]);
 assert.deepEqual(result.layout.honeyBoxInstalled,[false,false]);
 assert.equal(result.renders,1);
});
