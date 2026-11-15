import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/sectional-multiqueen-techprocess.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const windowRef = {};
new Function('window', source)(windowRef);
const api = windowRef.PasekaSectionalTechProcess;

test('sectional tech-process model loads before the app and is cached offline', () => {
  assert.ok(html.includes('<script src="./js/sectional-multiqueen-techprocess.js"></script>'));
  assert.ok(sw.includes("'./js/sectional-multiqueen-techprocess.js'"));
  assert.match(sw, /paseka-shell-v309/);
});

test('spec exposes 14 stable operations and three distinct entrance assignments', () => {
  assert.equal(api.SPEC.operations.length, 14);
  assert.equal(api.SPEC.version, '1.1.0');
  assert.equal(api.SPEC.geometry.technicalOpeningDiameterMm, 50);
  assert.equal(api.SPEC.geometry.nestBodiesPerSectionAtDivision, 2);
  assert.equal(api.SPEC.frameHeightMm, 180);
  assert.equal(api.SPEC.geometry.bodyHeightMm, 'PROFILE_DEFINED_SEPARATELY');
  assert.equal(api.getOperation('OP-02').syrupRatio.sugar, 2);
  assert.deepEqual(api.SPEC.entranceAssignment.map(x => x.openEntrance), ['FLAT_BOTTOM', 'ROUND_TOP', 'ROUND_BOTTOM']);
  assert.equal(api.getOperation('OP-12').optional, true);
  assert.equal(api.getOperation('OP-99'), null);
});

test('date parsing rejects impossible dates and shifts across month and year boundaries', () => {
  assert.equal(api.parseDate('2027-02-29'), null);
  assert.equal(api.parseDate('2028-02-29') instanceof Date, true);
  assert.equal(api.shiftDate('2027-12-29', 5), '2028-01-03');
  assert.throws(() => api.shiftDate('2027-02-30', 1), /дату/i);
});

test('operation schedule computes the user-defined relative windows', () => {
  const schedule = api.buildOperationSchedule({
    'OP-04': '2027-05-10',
    HONEY_FLOW_MAIN_START: '2027-06-01',
    FIRST_FLIGHT: '2027-04-01'
  });
  const byId = Object.fromEntries(schedule.map(x => [x.operationId, x]));
  assert.deepEqual([byId['OP-03'].from, byId['OP-03'].to], ['2027-05-03', '2027-05-05']);
  assert.deepEqual([byId['OP-05'].from, byId['OP-05'].to], ['2027-05-18', '2027-05-21']);
  assert.deepEqual([byId['OP-06'].from, byId['OP-06'].to], ['2027-05-30', '2027-05-31']);
  assert.deepEqual([byId['OP-08'].from, byId['OP-08'].to], ['2027-06-16', '2027-06-16']);
  assert.deepEqual([byId['OP-13'].from, byId['OP-13'].to], ['2027-05-11', '2027-05-21']);
});

test('R1 accepts exactly the configured three-section entrance assignment', () => {
  const result = api.validateHiveState({
    phase: 'DIVIDED_3_SECTIONS',
    sections: [
      { index: 1, openEntrance: 'FLAT_BOTTOM', entranceState: 'HALF_OPEN' },
      { index: 2, openEntrance: 'ROUND_TOP', entranceState: 'OPEN' },
      { index: 3, openEntrance: 'ROUND_BOTTOM', entranceState: 'OPEN' }
    ]
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('R1 is released after OP-06 when sections are reconnected', () => {
  const result = api.validateHiveState({
    phase: 'DIVIDED_3_SECTIONS', isolation: 'CONNECTED',
    operations: [{ operationId: 'OP-06', status: 'DONE' }],
    sections: [{ index: 1, openEntrance: 'FLAT_BOTTOM' }, { index: 2, openEntrance: 'ROUND_TOP' }, { index: 3, openEntrance: 'ROUND_BOTTOM' }]
  });
  assert.equal(result.valid, true);
});

test('OP-09 requires round bottom entrances in the lower nest bodies', () => {
  const result = api.validateHiveState({
    phase: 'DIVIDED_3_SECTIONS', operations: [{ operationId: 'OP-09', status: 'DONE' }],
    sections: [{ index: 1, openEntrance: 'ROUND_BOTTOM', openEntrancePosition: 'LOWER_NEST_BODY' }, { index: 2, openEntrance: 'ROUND_BOTTOM', openEntrancePosition: 'LOWER_NEST_BODY' }, { index: 3, openEntrance: 'ROUND_BOTTOM', openEntrancePosition: 'LOWER_NEST_BODY' }]
  });
  assert.equal(result.valid, true);
});

test('OP-09 rejects a round entrance installed above the lower nest body', () => {
  const result = api.validateHiveState({
    phase: 'AUTUMN_PREP', operations: [{ operationId: 'OP-09', status: 'DONE' }],
    sections: [{ index: 1, openEntrance: 'ROUND_BOTTOM', openEntrancePosition: 'UPPER_NEST_BODY' }, { index: 2, openEntrance: 'ROUND_BOTTOM', openEntrancePosition: 'LOWER_NEST_BODY' }, { index: 3, openEntrance: 'ROUND_BOTTOM', openEntrancePosition: 'LOWER_NEST_BODY' }]
  });
  assert.ok(result.errors.some(x => x.code === 'OP09_ENTRANCE_POSITION'));
});

test('R1 rejects duplicate or mismatched section entrance assignment', () => {
  const result = api.validateHiveState({
    phase: 'DIVIDED_3_SECTIONS',
    sections: [
      { index: 1, openEntrance: 'ROUND_BOTTOM' },
      { index: 2, openEntrance: 'ROUND_BOTTOM' },
      { index: 3, openEntrance: 'ROUND_TOP' }
    ]
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(x => x.code === 'R1_ENTRANCE_TYPE'));
  assert.ok(result.errors.some(x => x.code === 'R1_DUPLICATE_ENTRANCE'));
});

test('R2 blocks reconnection while a queen is unfertilized', () => {
  const result = api.validateHiveState({
    phase: 'DIVIDED_3_SECTIONS', isolation: 'CONNECTED',
    sections: [{ index: 1 }, { index: 2 }, { index: 3 }],
    queens: [{ status: 'FERTILIZED' }, { status: 'UNFERTILIZED' }, { status: 'FERTILIZED' }]
  });
  assert.ok(result.errors.some(x => x.code === 'R2_UNFERTILIZED_CONNECTED'));
});

test('R2 requires both metal mesh plugs over queen excluders', () => {
  const result = api.validateHiveState({
    phase: 'DIVIDED_3_SECTIONS', isolation: 'MESH_ISOLATED',
    sections: [{ index: 1 }, { index: 2 }, { index: 3 }],
    queens: [{ status: 'UNFERTILIZED' }],
    requiredMeshPlugCount: 4,
    meshPlugs: Array.from({ length: 3 }, (_, index) => ({ id: 'plug-' + index, sectionId: 'section-' + index, installed: true, position: 'OVER_QUEEN_EXCLUDER', openingDiameterMm: 50 }))
  });
  assert.ok(result.errors.some(x => x.code === 'R2_MESH_PLUG_MISSING'));
});

test('R4 requires queen excluder before honey bodies', () => {
  const result = api.validateHiveState({ phase: 'HONEY_BODIES_INSTALLED', sections: [{}, {}, {}] });
  assert.ok(result.errors.some(x => x.code === 'R4_QUEEN_EXCLUDER'));
});

test('R6 rejects selecting both wintering methods', () => {
  const result = api.validateHiveState({
    operations: [{ operationId: 'OP-11', status: 'DONE' }, { operationId: 'OP-12', status: 'DONE' }]
  });
  assert.ok(result.errors.some(x => x.code === 'R6_WINTERING_EXCLUSIVE'));
});

test('R7 requires two mesh diaphragms for alternative wintering', () => {
  const result = api.validateHiveState({ phase: 'ALT_WINTERING', winteringMode: 'ALTERNATIVE_DIAPHRAGMS', diaphragms: [{ hasMesh: true }] });
  assert.ok(result.errors.some(x => x.code === 'R7_DIAPHRAGMS'));
});

test('all entrances action is no longer treated as an R1 conflict after OP-06', () => {
  const result = api.validateHiveState({
    phase: 'DIVIDED_3_SECTIONS',
    operations: [{ operationId: 'OP-06', status: 'DONE' }],
    sections: [
      { index: 1, openEntrance: 'FLAT_BOTTOM' },
      { index: 2, openEntrance: 'ROUND_TOP' },
      { index: 3, openEntrance: 'ROUND_BOTTOM' }
    ],
    operationActions: ['OPEN_ALL_ENTRANCES']
  });
  assert.equal(result.warnings.some(x => x.code === 'R1_OPEN_ALL_CONFLICT'), false);
});
