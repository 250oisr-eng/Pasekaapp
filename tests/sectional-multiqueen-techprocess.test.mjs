import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/sectional-multiqueen-techprocess.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const windowRef = {};
new Function('window', source)(windowRef);
const api = windowRef.PasekaSectionalTechProcess;

const entranceDefaults = [
  { openEntrance: 'FLAT_BOTTOM', entranceState: 'HALF_OPEN' },
  { openEntrance: 'ROUND_TOP', entranceState: 'OPEN' },
  { openEntrance: 'ROUND_BOTTOM', entranceState: 'OPEN' }
];
function sectionFixture(index, overrides = {}) {
  return {
    index,
    bodyIds: [`body-${index}-a`, `body-${index}-b`],
    queenId: `queen-${index}`,
    isolation: 'CONNECTED',
    ...entranceDefaults[index - 1],
    ...overrides
  };
}
function dividedState(overrides = {}) {
  return {
    phase: 'DIVIDED_3_SECTIONS',
    sections: [sectionFixture(1), sectionFixture(2), sectionFixture(3)],
    queens: [1, 2, 3].map(index => ({ id: `queen-${index}`, status: 'FERTILIZED' })),
    operations: [],
    ...overrides
  };
}


test('sectional tech-process model loads before the app and is cached offline', () => {
  assert.ok(html.includes('<script src="./js/sectional-multiqueen-techprocess.js"></script>'));
  assert.ok(sw.includes("'./js/sectional-multiqueen-techprocess.js'"));
  assert.ok(html.includes('sectionalTechProcesses:[]'));
  assert.match(sw, /paseka-shell-v312/);
  assert.ok(html.includes('data-tab="techprocess"'));
  assert.ok(html.includes('id="techprocess"'));
  assert.ok(html.includes('function createSectionalTechProcess()'));
});

test('spec exposes 14 stable operations and three distinct entrance assignments', () => {
  assert.equal(api.SPEC.operations.length, 14);
  assert.equal(api.SPEC.version, '1.2.0');
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

test('divided state requires two distinct nest bodies and one registered queen per section', () => {
  const missingBody = api.validateHiveState(dividedState({
    sections: [sectionFixture(1, { bodyIds: ['body-1-a'] }), sectionFixture(2), sectionFixture(3)]
  }));
  assert.ok(missingBody.errors.some(x => x.code === 'OP04_BODY_COUNT'));
  const duplicateBody = api.validateHiveState(dividedState({
    sections: [sectionFixture(1), sectionFixture(2, { bodyIds: ['body-1-a', 'body-2-b'] }), sectionFixture(3)]
  }));
  assert.ok(duplicateBody.errors.some(x => x.code === 'SECTION_BODY_DUPLICATE'));
  const missingQueen = api.validateHiveState(dividedState({
    sections: [sectionFixture(1, { queenId: 'missing-queen' }), sectionFixture(2), sectionFixture(3)]
  }));
  assert.ok(missingQueen.errors.some(x => x.code === 'SECTION_QUEEN_REFERENCE'));
});
test('each divided section must declare its isolation state', () => {
  const result = api.validateHiveState(dividedState({
    sections: [sectionFixture(1), sectionFixture(2, { isolation: undefined }), sectionFixture(3)]
  }));
  assert.ok(result.errors.some(x => x.code === 'SECTION_ISOLATION'));
});

test('R1 accepts exactly the configured three-section entrance assignment', () => {
  const result = api.validateHiveState(dividedState());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('R1 is released after OP-06 when sections are reconnected', () => {
  const result = api.validateHiveState(dividedState({
    operations: [{ operationId: 'OP-06', status: 'DONE' }],
    sections: [sectionFixture(1, { openEntrance: 'ROUND_BOTTOM' }), sectionFixture(2, { openEntrance: 'ROUND_BOTTOM' }), sectionFixture(3, { openEntrance: 'ROUND_BOTTOM' })]
  }));
  assert.equal(result.valid, true);
});

test('OP-09 requires round bottom entrances in the lower nest bodies', () => {
  const result = api.validateHiveState(dividedState({
    operations: [{ operationId: 'OP-09', status: 'DONE' }],
    sections: [1, 2, 3].map(index => sectionFixture(index, { openEntrance: 'ROUND_BOTTOM', openEntrancePosition: 'LOWER_NEST_BODY' }))
  }));
  assert.equal(result.valid, true);
});

test('OP-09 rejects a round entrance installed above the lower nest body', () => {
  const result = api.validateHiveState(dividedState({
    phase: 'AUTUMN_PREP', operations: [{ operationId: 'OP-09', status: 'DONE' }],
    sections: [sectionFixture(1, { openEntrance: 'ROUND_BOTTOM', openEntrancePosition: 'UPPER_NEST_BODY' }), sectionFixture(2, { openEntrance: 'ROUND_BOTTOM', openEntrancePosition: 'LOWER_NEST_BODY' }), sectionFixture(3, { openEntrance: 'ROUND_BOTTOM', openEntrancePosition: 'LOWER_NEST_BODY' })]
  }));
  assert.ok(result.errors.some(x => x.code === 'OP09_ENTRANCE_POSITION'));
});

test('R1 rejects duplicate or mismatched section entrance assignment', () => {
  const result = api.validateHiveState(dividedState({
    sections: [sectionFixture(1, { openEntrance: 'ROUND_BOTTOM' }), sectionFixture(2, { openEntrance: 'ROUND_BOTTOM' }), sectionFixture(3, { openEntrance: 'ROUND_TOP' })]
  }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(x => x.code === 'R1_ENTRANCE_TYPE'));
  assert.ok(result.errors.some(x => x.code === 'R1_DUPLICATE_ENTRANCE'));
});

test('R2 blocks OP-06 when the queen registry is incomplete', () => {
  const result = api.validateHiveState(dividedState({
    operations: [{ operationId: 'OP-04', status: 'DONE' }, { operationId: 'OP-05', status: 'DONE' }, { operationId: 'OP-06', status: 'DONE' }],
    sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'CONNECTED' })),
    queens: [{ id: 'queen-1', status: 'FERTILIZED' }, { id: 'queen-2', status: 'FERTILIZED' }], meshPlugs: []
  }));
  assert.ok(result.errors.some(x => x.code === 'SECTION_QUEEN_COUNT'));
  assert.ok(result.errors.some(x => x.code === 'OP06_QUEEN_STATUS'));
});

test('R2 blocks OP-06 while any of the three queens is unfertilized', () => {
  const result = api.validateHiveState(dividedState({
    operations: [{ operationId: 'OP-04', status: 'DONE' }, { operationId: 'OP-05', status: 'DONE' }, { operationId: 'OP-06', status: 'DONE' }],
    sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'CONNECTED' })),
    queens: [{ id: 'queen-1', status: 'FERTILIZED' }, { id: 'queen-2', status: 'UNFERTILIZED' }, { id: 'queen-3', status: 'FERTILIZED' }], meshPlugs: []
  }));
  assert.ok(result.errors.some(x => x.code === 'OP06_QUEEN_STATUS'));
});

test('R2 requires both metal mesh plugs over queen excluders', () => {
  const result = api.validateHiveState(dividedState({
    isolation: 'MESH_ISOLATED',
    sections: [sectionFixture(1, { isolation: 'MESH_ISOLATED' }), sectionFixture(2, { isolation: 'MESH_ISOLATED' }), sectionFixture(3, { isolation: 'MESH_ISOLATED' })],
    queens: [{ id: 'queen-1', status: 'UNFERTILIZED' }, { id: 'queen-2', status: 'FERTILIZED' }, { id: 'queen-3', status: 'FERTILIZED' }],
    requiredMeshPlugCount: 4,
    meshPlugs: Array.from({ length: 3 }, (_, index) => ({ id: 'plug-' + index, sectionId: 'section-' + index, installed: true, position: 'OVER_QUEEN_EXCLUDER', openingDiameterMm: 50 }))
  }));
  assert.ok(result.errors.some(x => x.code === 'R2_MESH_PLUG_MISSING'));
});

test('R4 requires queen excluder before honey bodies', () => {
  const result = api.validateHiveState(dividedState({ phase: 'HONEY_BODIES_INSTALLED' }));
  assert.ok(result.errors.some(x => x.code === 'R4_QUEEN_EXCLUDER'));
});

test('R6 rejects selecting both wintering methods', () => {
  const result = api.validateHiveState({
    operations: [{ operationId: 'OP-11', status: 'DONE' }, { operationId: 'OP-12', status: 'DONE' }]
  });
  assert.ok(result.errors.some(x => x.code === 'R6_WINTERING_EXCLUSIVE'));
});

test('R7 requires two mesh diaphragms for alternative wintering', () => {
  const result = api.validateHiveState(dividedState({ phase: 'ALT_WINTERING', winteringMode: 'ALTERNATIVE_DIAPHRAGMS', diaphragms: [{ hasMesh: true }], sections: [sectionFixture(1, { bodyIds: ['body-1-a', 'body-1-b'], isolation: 'MESH_ISOLATED' }), sectionFixture(2, { bodyIds: ['body-2-a'], isolation: 'MESH_ISOLATED' }), sectionFixture(3, { bodyIds: ['body-3-a'], isolation: 'MESH_ISOLATED' })] }));
  assert.ok(result.errors.some(x => x.code === 'R7_DIAPHRAGMS'));
});

test('all entrances action is no longer treated as an R1 conflict after OP-06', () => {
  const result = api.validateHiveState(dividedState({
    operations: [{ operationId: 'OP-04', status: 'DONE' }, { operationId: 'OP-05', status: 'DONE' }, { operationId: 'OP-06', status: 'DONE' }],
    sections: [1, 2, 3].map(index => sectionFixture(index, { openEntrance: 'ROUND_BOTTOM', isolation: 'CONNECTED' })),
    queens: [1, 2, 3].map(index => ({ id: 'queen-' + index, status: 'FERTILIZED' })), meshPlugs: [],
    operationActions: ['OPEN_ALL_ENTRANCES']
  }));
  assert.equal(result.valid, true);
  assert.equal(result.errors.some(x => x.code.startsWith('R1_')), false);
});

test('stored tech-process records require a unique valid hive reference and supported specification', () => {
  const record = { id: 'tp1', hiveId: 'h1', specVersion: '1.2.0', createdAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:00:00.000Z', state: { phase: 'WINTER', operations: [] } };
  assert.equal(api.validateStoredRecords([record], [{ id: 'h1' }]).valid, true);
  assert.ok(api.validateStoredRecords([record, { ...record, id: 'tp2' }], [{ id: 'h1' }]).errors.some(x => x.code === 'TECH_RECORD_HIVE_DUPLICATE'));
  assert.ok(api.validateStoredRecords([{ ...record, hiveId: 'missing' }], [{ id: 'h1' }]).errors.some(x => x.code === 'TECH_RECORD_HIVE_MISSING'));
  assert.ok(api.validateStoredRecords([{ ...record, specVersion: '99.0.0' }], [{ id: 'h1' }]).errors.some(x => x.code === 'TECH_RECORD_SPEC_VERSION'));
});

test('stored process configuration enforces the user-defined 180 mm frame height', () => {
  const record = { id: 'tp1', hiveId: 'h1', specVersion: '1.2.0', createdAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:00:00.000Z', state: { phase: 'WINTER', config: { frameHeightMm: 180, honeyBodiesCount: 2, winteringMode: 'COMBINED' }, operations: [] } };
  assert.equal(api.validateStoredRecords([record], [{ id: 'h1' }]).valid, true);
  const wrongHeight = api.validateStoredRecords([{ ...record, state: { ...record.state, config: { ...record.state.config, frameHeightMm: 195 } } }], [{ id: 'h1' }]);
  assert.ok(wrongHeight.errors.some(x => x.code === 'TECH_RECORD_STATE_FRAME_HEIGHT'));
  const wrongWintering = api.validateStoredRecords([{ ...record, state: { ...record.state, config: { ...record.state.config, winteringMode: 'UNKNOWN' } } }], [{ id: 'h1' }]);
  assert.ok(wrongWintering.errors.some(x => x.code === 'TECH_RECORD_STATE_WINTERING_MODE'));
});


test('connected worker passage before OP-05 does not require mated queens', () => {
  const state = dividedState({
    queens: [{ id: 'queen-1', status: 'UNFERTILIZED' }, { id: 'queen-2', status: 'UNFERTILIZED' }, { id: 'queen-3', status: 'UNFERTILIZED' }],
    sections: [sectionFixture(1), sectionFixture(2), sectionFixture(3)]
  });
  assert.equal(api.validateHiveState(state).valid, true);
});

test('OP-06 requires OP-05, three fertilized queens, connected sections and removed plugs', () => {
  const base = dividedState({
    operations: [{ operationId: 'OP-04', status: 'DONE' }, { operationId: 'OP-05', status: 'DONE' }, { operationId: 'OP-06', status: 'DONE' }],
    sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'CONNECTED' })),
    queens: [1, 2, 3].map(index => ({ id: 'queen-' + index, status: 'FERTILIZED' })),
    requiredMeshPlugCount: 4,
    meshPlugs: [{ id: 'p1', installed: true, position: 'OVER_QUEEN_EXCLUDER', openingDiameterMm: 50 }]
  });
  assert.ok(api.validateHiveState(base).errors.some(x => x.code === 'OP06_MESH_PLUGS_REMAIN'));
  const missingOP05 = api.validateHiveState({ ...base, operations: [{ operationId: 'OP-04', status: 'DONE' }, { operationId: 'OP-06', status: 'DONE' }], meshPlugs: [] });
  assert.ok(missingOP05.errors.some(x => x.code === 'OP06_PREREQUISITE'));
});

test('OP-05 and OP-06 cannot be marked complete with the wrong section isolation state', () => {
  const state = dividedState({
    operations: [{ operationId: 'OP-04', status: 'DONE' }, { operationId: 'OP-05', status: 'DONE' }],
    sections: [sectionFixture(1, { isolation: 'MESH_ISOLATED' }), sectionFixture(2), sectionFixture(3, { isolation: 'MESH_ISOLATED' })],
    requiredMeshPlugCount: 4,
    meshPlugs: Array.from({ length: 4 }, (_, i) => ({ id: 'p' + i, installed: true, position: 'OVER_QUEEN_EXCLUDER', openingDiameterMm: 50 }))
  });
  assert.ok(api.validateHiveState(state).errors.some(x => x.code === 'OP05_ISOLATION_STATE'));
});

test('OP-07 and OP-08 require the preceding operations', () => {
  const result = api.validateHiveState(dividedState({ operations: [{ operationId: 'OP-07', status: 'DONE' }] }));
  assert.ok(result.errors.some(x => x.code === 'OP07_PREREQUISITE'));
  const missingOP07 = api.validateHiveState(dividedState({ operations: [{ operationId: 'OP-08', status: 'DONE' }] }));
  assert.ok(missingOP07.errors.some(x => x.code === 'OP08_PREREQUISITE'));
});

test('mesh plug count rejects extras as well as missing plugs', () => {
  const state = dividedState({
    isolation: 'MESH_ISOLATED',
    sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'MESH_ISOLATED' })),
    requiredMeshPlugCount: 2,
    meshPlugs: Array.from({ length: 3 }, (_, i) => ({ id: 'p' + i, installed: true, position: 'OVER_QUEEN_EXCLUDER', openingDiameterMm: 50 }))
  });
  assert.ok(api.validateHiveState(state).errors.some(x => x.code === 'R2_MESH_PLUG_EXTRA'));
});

test('stored operation records reject unknown IDs, duplicate IDs and invalid statuses', () => {
  const base = { id: 'tp1', hiveId: 'h1', specVersion: '1.2.0', createdAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:00:00.000Z', state: { phase: 'WINTER', operations: [{ operationId: 'OP-01', status: 'PENDING' }] } };
  assert.equal(api.validateStoredRecords([base], [{ id: 'h1' }]).valid, true);
  const duplicate = api.validateStoredRecords([{ ...base, state: { ...base.state, operations: [{ operationId: 'OP-01', status: 'PENDING' }, { operationId: 'OP-01', status: 'DONE' }] } }], [{ id: 'h1' }]);
  assert.ok(duplicate.errors.some(x => x.code === 'TECH_OPERATION_DUPLICATE'));
  const invalid = api.validateStoredRecords([{ ...base, state: { ...base.state, operations: [{ operationId: 'OP-99', status: 'PENDING' }] } }], [{ id: 'h1' }]);
  assert.ok(invalid.errors.some(x => x.code === 'TECH_OPERATION_UNKNOWN'));
});
