import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/sectional-multiqueen-techprocess.js', import.meta.url), 'utf8');
const familyLineageSource = await readFile(new URL('../js/family-lineage.js', import.meta.url), 'utf8');
const physicalLayoutSource = await readFile(new URL('../js/sectional-physical-layout.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../cloudflare/worker.js', import.meta.url), 'utf8');
const windowRef = {};
new Function('window', familyLineageSource)(windowRef);
new Function('window', physicalLayoutSource)(windowRef);
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
    queens: [1, 2, 3].map(index => ({ id: `queen-${index}`, status: 'FERTILIZED', layingObserved: true })),
    operations: [],
    technicalConnections: [
      { fromSectionIndex: 1, toSectionIndex: 2, queenExcluderLayers: 2, bufferCorridorPresent: true },
      { fromSectionIndex: 2, toSectionIndex: 3, queenExcluderLayers: 2, bufferCorridorPresent: true }
    ],
    ...overrides
  };
}
function honeyExcluderFixture() {
  return [
    { id: 'large-grid-left', coverage: [{ bodyId: 'body-1-b', coverage: 'FULL' }, { bodyId: 'body-2-b', coverage: 'HALF' }] },
    { id: 'large-grid-right', coverage: [{ bodyId: 'body-2-b', coverage: 'HALF' }, { bodyId: 'body-3-b', coverage: 'FULL' }] }
  ];
}
function honeyReadyState(overrides = {}) {
  return dividedState({
    phase: 'HONEY_BODIES_INSTALLED',
    config: { honeyBodiesCount: 2 },
    operations: [{ operationId: 'OP-04', status: 'DONE' }, { operationId: 'OP-05', status: 'DONE' }, { operationId: 'OP-06', status: 'DONE' }],
    sections: [1, 2, 3].map(index => sectionFixture(index, { upperBodyId: `body-${index}-b`, isolation: 'CONNECTED' })),
    honeyQueenExcluders: honeyExcluderFixture(),
    ...overrides
  });
}


test('sectional tech-process model loads before the app and is cached offline', () => {
  assert.ok(html.includes('<script src="./js/family-lineage.js"></script>'));
  assert.ok(sw.includes("'./js/family-lineage.js'"));
  assert.ok(html.includes('<script src="./js/sectional-multiqueen-techprocess.js"></script>'));
  assert.ok(sw.includes("'./js/sectional-multiqueen-techprocess.js'"));
  assert.ok(html.includes('<script src="./js/family-lineage-ui.js"></script>'));
  assert.ok(sw.includes("'./js/family-lineage-ui.js'"));
  assert.ok(html.includes('<script src="./js/sectional-physical-layout.js"></script>'));
  assert.ok(sw.includes("'./js/sectional-physical-layout.js'"));
  assert.ok(html.indexOf('./js/sectional-physical-layout.js') < html.indexOf('./js/sectional-multiqueen-techprocess.js'));
  assert.ok(html.includes('sectionalTechProcesses:[]'));
  assert.match(sw, /paseka-shell-v325/);
  assert.ok(html.includes('<script src="./js/equipment-items.js"></script>'));
  assert.ok(sw.includes("'./js/equipment-items.js'"));
  assert.ok(html.includes('data-tab="techprocess"'));
  assert.ok(html.includes('id="techprocess"'));
  assert.ok(html.includes('function createSectionalTechProcess()'));
  assert.ok(html.includes('id="sectionalOperationDlg"'));
  assert.ok(html.includes('function openSectionalOperationEditor('));
  assert.ok(html.includes('function saveSectionalOperationEditor('));
  assert.ok(html.includes('id="sectionalOperationFeedStart"'));
  assert.ok(html.includes('id="sectionalOperationFeedAmount"'));
  assert.ok(html.includes('id="sectionalOperationFeedAmountLabel"'));
  assert.ok(html.includes("sectional-multiqueen-v1"));
  assert.ok(!html.includes('id="newHiveProfile"'));
  assert.ok(html.includes("getHiveProfile(hive)?.id==='sectional-multiqueen-v1'"));
  assert.ok(html.includes("selectedProfile?.id!=='sectional-multiqueen-v1'"));
  assert.ok(html.includes('const sectionalTechProcesses='));
  assert.ok(html.includes('sectionalTechProcesses,families'));
  assert.match(html, /Суточная норма сиропа на семью/);
  assert.ok(html.includes('function toggleSectionalOperationFields('));
  assert.ok(html.includes('id="sectionalOperationOP04Fields"'));
  assert.ok(html.includes('id="sectionalOperationBottomsConfirmed"'));
});

test('OP-07 specification exposes the confirmed two-grid FULL/HALF layout', () => {
  assert.equal(api.getOperation('OP-07').honeyQueenExcluderLayout, 'TWO_FULL_OUTER_AND_TWO_HALF_SHARED_CENTER');
  assert.equal(api.SPEC.geometry.honeyQueenExcluders, 'TWO_FULL_OUTER_AND_TWO_HALF_SHARED_CENTER');
});

test('spec exposes 14 stable operations and three distinct entrance assignments', () => {
  assert.equal(api.SPEC.operations.length, 14);
  assert.equal(api.SPEC.version, '1.8.0');
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
  assert.equal(byId['OP-13'], undefined);
  assert.equal(api.getOperation('OP-13').offsetDays, undefined);
  assert.match(api.getOperation('OP-13').timingGuidance,/полутора месяцев/);
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
    operations: [{ operationId: 'OP-04', status: 'DONE' }, { operationId: 'OP-05', status: 'DONE' }, { operationId: 'OP-06', status: 'DONE' }],
    sections: [1, 2, 3].map(index => sectionFixture(index, { openEntrance: 'ROUND_BOTTOM', isolation: 'CONNECTED' }))
  }));
  assert.equal(result.valid, true);
});

test('OP-09 requires round bottom entrances in the lower nest bodies', () => {
  const result = api.validateHiveState(dividedState({
    phase: 'END_OF_SEASON',
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
    queens: [{ id: 'queen-1', status: 'FERTILIZED', layingObserved: true }, { id: 'queen-2', status: 'FERTILIZED', layingObserved: true }], meshPlugs: []
  }));
  assert.ok(result.errors.some(x => x.code === 'SECTION_QUEEN_COUNT'));
  assert.ok(result.errors.some(x => x.code === 'OP06_QUEEN_STATUS'));
});

test('R2 blocks OP-06 while any of the three queens is unfertilized', () => {
  const result = api.validateHiveState(dividedState({
    operations: [{ operationId: 'OP-04', status: 'DONE' }, { operationId: 'OP-05', status: 'DONE' }, { operationId: 'OP-06', status: 'DONE' }],
    sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'CONNECTED' })),
    queens: [{ id: 'queen-1', status: 'FERTILIZED', layingObserved: true }, { id: 'queen-2', status: 'UNFERTILIZED' }, { id: 'queen-3', status: 'FERTILIZED', layingObserved: true }], meshPlugs: []
  }));
  assert.ok(result.errors.some(x => x.code === 'OP06_QUEEN_STATUS'));
});


test('OP-06 requires observed egg laying for all three queens', () => {
  const state = dividedState({
    operations: [
      { operationId: 'OP-04', status: 'DONE' },
      { operationId: 'OP-05', status: 'DONE' },
      { operationId: 'OP-06', status: 'DONE' }
    ],
    sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'CONNECTED' })),
    queens: [
      { id: 'queen-1', status: 'FERTILIZED', layingObserved: true },
      { id: 'queen-2', status: 'FERTILIZED', layingObserved: false },
      { id: 'queen-3', status: 'FERTILIZED', layingObserved: true }
    ],
    meshPlugs: []
  });
  const missingObservation = api.validateHiveState(state, { requireLayingObservation: true });
  assert.ok(missingObservation.errors.some(x => x.code === 'OP06_EGG_LAYING_NOT_OBSERVED'));

  state.queens[1].layingObserved = true;
  const observed = api.validateHiveState(state, { requireLayingObservation: true });
  assert.equal(observed.valid, true);
});

test('OP-06 egg-laying rule is versioned and legacy records remain readable', () => {
  const state = dividedState({
    operations: [
      { operationId: 'OP-04', status: 'DONE', completedAt: '2027-05-10' },
      { operationId: 'OP-05', status: 'DONE', completedAt: '2027-05-19' },
      { operationId: 'OP-06', status: 'DONE', completedAt: '2027-05-30' }
    ],
    sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'CONNECTED' })),
    queens: [1, 2, 3].map(index => ({ id: 'queen-' + index, status: 'FERTILIZED' })),
    meshPlugs: []
  });
  const legacy = {
    id: 'tp-op06-legacy',
    hiveId: 'h1',
    hiveProfileId: 'sectional-multiqueen-v1',
    specVersion: '1.5.0',
    createdAt: '2027-05-01T10:00:00.000Z',
    updatedAt: '2027-05-30T10:00:00.000Z',
    state
  };
  const hive = [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }];
  assert.equal(api.validateStoredRecords([legacy], hive).valid, true);

  const current = { ...legacy, id: 'tp-op06-current', specVersion: '1.8.0' };
  assert.ok(api.validateStoredRecords([current], hive).errors.some(x => x.code === 'TECH_RECORD_STATE_OP06_EGG_LAYING_NOT_OBSERVED'));

  const pending = structuredClone(legacy);
  pending.id = 'tp-op06-transition';
  pending.state.operations[2].status = 'PENDING';
  pending.state.operations[2].completedAt = undefined;
  const transition = api.transitionOperation(pending, 'OP-06', {
    status: 'DONE',
    completedAt: '2027-05-30',
    updatedAt: '2027-05-30T10:00:00.000Z'
  }, [pending], hive);
  assert.equal(transition.valid, false);
  assert.ok(transition.errors.some(x => x.code === 'TECH_RECORD_STATE_OP06_EGG_LAYING_NOT_OBSERVED'));
});

test('R2 requires both metal mesh plugs over queen excluders', () => {
  const result = api.validateHiveState(dividedState({
    isolation: 'MESH_ISOLATED',
    sections: [sectionFixture(1, { isolation: 'MESH_ISOLATED' }), sectionFixture(2, { isolation: 'MESH_ISOLATED' }), sectionFixture(3, { isolation: 'MESH_ISOLATED' })],
    queens: [{ id: 'queen-1', status: 'UNFERTILIZED' }, { id: 'queen-2', status: 'FERTILIZED', layingObserved: true }, { id: 'queen-3', status: 'FERTILIZED', layingObserved: true }],
    requiredMeshPlugCount: 4,
    meshPlugs: Array.from({ length: 3 }, (_, index) => ({ id: 'plug-' + index, sectionId: 'section-' + index, installed: true, position: 'OVER_QUEEN_EXCLUDER', openingDiameterMm: 50 }))
  }));
  assert.ok(result.errors.some(x => x.code === 'R2_MESH_PLUG_MISSING'));
});

test('R4 requires queen excluder before honey bodies', () => {
  const result = api.validateHiveState(dividedState({ phase: 'HONEY_BODIES_INSTALLED' }));
  assert.ok(result.errors.some(x => x.code === 'R4_QUEEN_EXCLUDER_COUNT'));
});


test('R4 accepts two large excluders whose half-footprints meet on the middle upper nest body', () => {
  const result = api.validateHiveState(honeyReadyState());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('R4 requires exactly two large excluders and explicit upper-body references', () => {
  const missing = api.validateHiveState(honeyReadyState({ honeyQueenExcluders: [honeyExcluderFixture()[0]] }));
  assert.ok(missing.errors.some(x => x.code === 'R4_QUEEN_EXCLUDER_COUNT'));

  const noUpperIds = api.validateHiveState(honeyReadyState({
    sections: [1, 2, 3].map(index => sectionFixture(index))
  }));
  assert.ok(noUpperIds.errors.some(x => x.code === 'R4_UPPER_NEST_BODY_REFERENCE'));
});

test('R4 rejects excluder halves that do not share the same middle body', () => {
  const grids = honeyExcluderFixture();
  grids[1].coverage[0].bodyId = 'body-1-b';
  const result = api.validateHiveState(honeyReadyState({ honeyQueenExcluders: grids }));
  assert.ok(result.errors.some(x => x.code === 'R4_EXCLUDER_SHARED_CENTER'));
});

test('R4 rejects duplicate full coverage and references outside the three upper bodies', () => {
  const duplicateFull = honeyExcluderFixture();
  duplicateFull[1].coverage[1].bodyId = 'body-1-b';
  const first = api.validateHiveState(honeyReadyState({ honeyQueenExcluders: duplicateFull }));
  assert.ok(first.errors.some(x => x.code === 'R4_EXCLUDER_FULL_OVERLAP'));

  const outside = honeyExcluderFixture();
  outside[0].coverage[0].bodyId = 'not-an-upper-body';
  const second = api.validateHiveState(honeyReadyState({ honeyQueenExcluders: outside }));
  assert.ok(second.errors.some(x => x.code === 'R4_EXCLUDER_BODY_REFERENCE'));
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
    queens: [1, 2, 3].map(index => ({ id: 'queen-' + index, status: 'FERTILIZED', layingObserved: true })), meshPlugs: [],
    operationActions: ['OPEN_ALL_ENTRANCES']
  }));
  assert.equal(result.valid, true);
  assert.equal(result.errors.some(x => x.code.startsWith('R1_')), false);
});

test('stored tech-process records require a unique valid hive reference and supported specification', () => {
  const record = { id: 'tp1', hiveId: 'h1', hiveProfileId: 'sectional-multiqueen-v1', specVersion: '1.2.0', createdAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:00:00.000Z', state: { phase: 'WINTER', operations: [] } };
  assert.equal(api.validateStoredRecords([record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]).valid, true);
  assert.ok(api.validateStoredRecords([record, { ...record, id: 'tp2' }], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]).errors.some(x => x.code === 'TECH_RECORD_HIVE_DUPLICATE'));
  assert.ok(api.validateStoredRecords([{ ...record, hiveId: 'missing' }], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]).errors.some(x => x.code === 'TECH_RECORD_HIVE_MISSING'));
  assert.ok(api.validateStoredRecords([{ ...record, specVersion: '99.0.0' }], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]).errors.some(x => x.code === 'TECH_RECORD_SPEC_VERSION'));
  const previousMinor = { ...record, id: 'tp-1-6', specVersion: '1.6.0' };
  assert.equal(api.validateStoredRecords([previousMinor], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]).valid, true);
});

test('stored process configuration enforces the user-defined 180 mm frame height', () => {
  const record = { id: 'tp1', hiveId: 'h1', hiveProfileId: 'sectional-multiqueen-v1', specVersion: '1.2.0', createdAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:00:00.000Z', state: { phase: 'WINTER', config: { frameHeightMm: 180, honeyBodiesCount: 2, winteringMode: 'COMBINED' }, operations: [] } };
  assert.equal(api.validateStoredRecords([record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]).valid, true);
  const wrongHeight = api.validateStoredRecords([{ ...record, state: { ...record.state, config: { ...record.state.config, frameHeightMm: 195 } } }], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(wrongHeight.errors.some(x => x.code === 'TECH_RECORD_STATE_FRAME_HEIGHT'));
  const wrongWintering = api.validateStoredRecords([{ ...record, state: { ...record.state, config: { ...record.state.config, winteringMode: 'UNKNOWN' } } }], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
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
    queens: [1, 2, 3].map(index => ({ id: 'queen-' + index, status: 'FERTILIZED', layingObserved: true })),
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
  const base = { id: 'tp1', hiveId: 'h1', hiveProfileId: 'sectional-multiqueen-v1', specVersion: '1.2.0', createdAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:00:00.000Z', state: { phase: 'WINTER', operations: [{ operationId: 'OP-01', status: 'PENDING' }] } };
  assert.equal(api.validateStoredRecords([base], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]).valid, true);
  const duplicate = api.validateStoredRecords([{ ...base, state: { ...base.state, operations: [{ operationId: 'OP-01', status: 'PENDING' }, { operationId: 'OP-01', status: 'DONE' }] } }], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(duplicate.errors.some(x => x.code === 'TECH_OPERATION_DUPLICATE'));
  const invalid = api.validateStoredRecords([{ ...base, state: { ...base.state, operations: [{ operationId: 'OP-99', status: 'PENDING' }] } }], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(invalid.errors.some(x => x.code === 'TECH_OPERATION_UNKNOWN'));
});


test('stored OP-05 and OP-06 completion dates must match the user-defined windows', () => {
  const base = {
    id: 'tp-date', hiveId: 'h1', hiveProfileId: 'sectional-multiqueen-v1', specVersion: '1.2.0',
    createdAt: '2027-04-01T09:00:00.000Z', updatedAt: '2027-04-21T09:00:00.000Z',
    state: {
      phase: 'DIVIDED_3_SECTIONS',
      config: { frameHeightMm: 180, honeyBodiesCount: 2, winteringMode: 'COMBINED' },
      technicalConnections: [
        { fromSectionIndex: 1, toSectionIndex: 2, queenExcluderLayers: 2, bufferCorridorPresent: true },
        { fromSectionIndex: 2, toSectionIndex: 3, queenExcluderLayers: 2, bufferCorridorPresent: true }
      ],
      sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'CONNECTED' })),
      queens: [1, 2, 3].map(index => ({ id: 'queen-' + index, status: 'FERTILIZED', layingObserved: true })),
      meshPlugs: [],
      operations: [
        { operationId: 'OP-04', status: 'DONE', completedAt: '2027-04-01' },
        { operationId: 'OP-05', status: 'DONE', completedAt: '2027-04-10' },
        { operationId: 'OP-06', status: 'DONE', completedAt: '2027-04-21' }
      ]
    }
  };
  assert.equal(api.validateStoredRecords([base], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]).valid, true);
  const lateOP05 = api.validateStoredRecords([{ ...base, state: { ...base.state, operations: base.state.operations.map(op => op.operationId === 'OP-05' ? { ...op, completedAt: '2027-04-13' } : op) } }], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(lateOP05.errors.some(x => x.code === 'TECH_OP05_DATE_WINDOW'));
  const earlyOP06 = api.validateStoredRecords([{ ...base, state: { ...base.state, operations: base.state.operations.map(op => op.operationId === 'OP-06' ? { ...op, completedAt: '2027-04-19' } : op) } }], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(earlyOP06.errors.some(x => x.code === 'TECH_OP06_DATE_WINDOW'));
  const missingOP04Date = api.validateStoredRecords([{ ...base, state: { ...base.state, operations: base.state.operations.map(op => op.operationId === 'OP-04' ? { ...op, completedAt: null } : op) } }], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(missingOP04Date.errors.some(x => x.code === 'TECH_OP05_COMPLETION_DATE_REQUIRED'));
});


function operationRecord(stateOverrides = {}) {
  const now = '2027-04-01T10:00:00.000Z';
  return {
    id: 'tp-operation-test',
    hiveId: 'h1', hiveProfileId: 'sectional-multiqueen-v1',
    specVersion: api.SPEC.version,
    createdAt: now,
    updatedAt: now,
    state: {
      phase: 'PRE_DIVISION',
      config: { frameHeightMm: 180, honeyBodiesCount: 2, winteringMode: 'COMBINED', additionalBottoms: 0, hasRemovableFeeder: false },
      sections: [],
      queens: [],
      operations: api.SPEC.operations.map(operation => ({ operationId: operation.id, status: 'PENDING' })),
      ...stateOverrides
    }
  };
}
function validOp05State() {
  return {
    phase: 'DIVIDED_3_SECTIONS',
    technicalConnections: [
      { fromSectionIndex: 1, toSectionIndex: 2, queenExcluderLayers: 2, bufferCorridorPresent: true },
      { fromSectionIndex: 2, toSectionIndex: 3, queenExcluderLayers: 2, bufferCorridorPresent: true }
    ],
    sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'MESH_ISOLATED' })),
    queens: [1, 2, 3].map(index => ({ id: 'queen-' + index, status: 'UNFERTILIZED' })),
    requiredMeshPlugCount: 3,
    meshPlugs: [1, 2, 3].map(index => ({ id: 'plug-' + index, installed: true, position: 'OVER_QUEEN_EXCLUDER', openingDiameterMm: 50 })),
    operations: api.SPEC.operations.map(operation => ({
      operationId: operation.id,
      status: operation.id === 'OP-04' ? 'DONE' : 'PENDING',
      ...(operation.id === 'OP-04' ? { completedAt: '2027-05-10', additionalBottomsInstalled: true } : {})
    }))
  };
}
function validOp06State() {
  return {
    phase: 'DIVIDED_3_SECTIONS',
    technicalConnections: [
      { fromSectionIndex: 1, toSectionIndex: 2, queenExcluderLayers: 2, bufferCorridorPresent: true },
      { fromSectionIndex: 2, toSectionIndex: 3, queenExcluderLayers: 2, bufferCorridorPresent: true }
    ],
    sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'CONNECTED' })),
    queens: [1, 2, 3].map(index => ({ id: 'queen-' + index, status: 'FERTILIZED', layingObserved: true })),
    requiredMeshPlugCount: 3,
    meshPlugs: [1, 2, 3].map(index => ({ id: 'plug-' + index, installed: false, position: 'OVER_QUEEN_EXCLUDER', openingDiameterMm: 50 })),
    operations: api.SPEC.operations.map(operation => ({
      operationId: operation.id,
      status: ['OP-04', 'OP-05'].includes(operation.id) ? 'DONE' : 'PENDING',
      ...(operation.id === 'OP-04' ? { completedAt: '2027-05-10', additionalBottomsInstalled: true } : {}),
      ...(operation.id === 'OP-05' ? { completedAt: '2027-05-18' } : {})
    }))
  };
}

test('stored operation validation enforces required dates and reasons for every status', () => {
  const base = operationRecord();
  const check = (operationId, patch) => {
    const record = structuredClone(base);
    const operation = record.state.operations.find(item => item.operationId === operationId);
    Object.assign(operation, patch);
    return api.validateStoredRecords([record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  };
  assert.ok(check('OP-01', { status: 'SCHEDULED', plannedAt: null }).errors.some(x => x.code === 'TECH_OPERATION_PLANNED_DATE_REQUIRED'));
  assert.ok(check('OP-01', { status: 'DONE', completedAt: null }).errors.some(x => x.code === 'TECH_OPERATION_COMPLETION_DATE_REQUIRED'));
  assert.ok(check('OP-01', { status: 'SKIPPED', note: 'Причина' }).errors.some(x => x.code === 'TECH_OPERATION_SKIP_REQUIRED'));
  assert.ok(check('OP-03', { status: 'SKIPPED', note: '' }).errors.some(x => x.code === 'TECH_OPERATION_REASON_REQUIRED'));
  assert.ok(check('OP-03', { status: 'FAILED', note: '   ' }).errors.some(x => x.code === 'TECH_OPERATION_REASON_REQUIRED'));
  assert.ok(check('OP-03', { status: 'FAILED', note: 'x'.repeat(1001) }).errors.some(x => x.code === 'TECH_OPERATION_NOTE_TOO_LONG'));
  assert.ok(check('OP-03', { status: 'SCHEDULED', plannedAt: '2027-04-02' }).valid);
  assert.ok(check('OP-03', { status: 'DONE', completedAt: '2027-04-02' }).valid);
  assert.ok(check('OP-03', { status: 'SKIPPED', note: 'Не требуется по состоянию семьи' }).valid);
});
test('stored operation validation rejects a non-string note', () => {
  const record = operationRecord();
  record.state.operations.find(item => item.operationId === 'OP-03').note = { reason: 'bad' };
  const result = api.validateStoredRecords([record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(result.errors.some(x => x.code === 'TECH_OPERATION_NOTE_INVALID'));
});
test('operation transition marks a valid operation complete without mutating the original record', () => {
  const record = operationRecord();
  const original = JSON.stringify(record);
  const result = api.transitionOperation(record, 'OP-01', {
    status: 'DONE', completedAt: '2027-04-05', plannedAt: '', note: 'Летки открыты', updatedAt: '2027-04-05T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(result.valid, true);
  assert.equal(result.records[0].state.operations.find(item => item.operationId === 'OP-01').status, 'DONE');
  assert.equal(result.records[0].state.operations.find(item => item.operationId === 'OP-01').completedAt, '2027-04-05');
  assert.equal(JSON.stringify(record), original);
});

test('scheduled operation requires a real planned date and rejects impossible calendar dates', () => {
  const record = operationRecord();
  const missing = api.transitionOperation(record, 'OP-01', {
    status: 'SCHEDULED', plannedAt: '', updatedAt: '2027-04-01T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some(error => error.code === 'OPERATION_PLANNED_DATE_REQUIRED'));
  const impossible = api.transitionOperation(record, 'OP-01', {
    status: 'SCHEDULED', plannedAt: '2027-02-30', updatedAt: '2027-04-01T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(impossible.valid, false);
  assert.ok(impossible.errors.some(error => error.code === 'OPERATION_PLANNED_DATE_INVALID'));
});

test('mandatory operations cannot be skipped and failed or skipped operations require a reason', () => {
  const record = operationRecord();
  const mandatorySkip = api.transitionOperation(record, 'OP-01', {
    status: 'SKIPPED', note: 'Не выполнялась', updatedAt: '2027-04-01T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(mandatorySkip.valid, false);
  assert.ok(mandatorySkip.errors.some(error => error.code === 'OPERATION_SKIP_REQUIRED'));
  const optionalWithoutReason = api.transitionOperation(record, 'OP-03', {
    status: 'SKIPPED', note: '', updatedAt: '2027-04-01T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(optionalWithoutReason.valid, false);
  assert.ok(optionalWithoutReason.errors.some(error => error.code === 'OPERATION_REASON_REQUIRED'));
  const optionalWithReason = api.transitionOperation(record, 'OP-03', {
    status: 'SKIPPED', note: 'По состоянию семьи не потребовалась', updatedAt: '2027-04-01T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(optionalWithReason.valid, true);
});

test('OP-05 completion enforces prerequisite and 8–11 day window from OP-04', () => {
  const record = operationRecord(validOp05State());
  const tooEarly = api.transitionOperation(record, 'OP-05', {
    status: 'DONE', completedAt: '2027-05-17', updatedAt: '2027-05-17T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(tooEarly.valid, false);
  assert.ok(tooEarly.errors.some(error => error.code === 'TECH_OP05_DATE_WINDOW'));
  const valid = api.transitionOperation(record, 'OP-05', {
    status: 'DONE', completedAt: '2027-05-18', updatedAt: '2027-05-18T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(valid.valid, true);
});

test('OP-06 completion requires three fertilized queens, connected sections, removed plugs and 20–21 days from OP-04', () => {
  const record = operationRecord(validOp06State());
  const tooLate = api.transitionOperation(record, 'OP-06', {
    status: 'DONE', completedAt: '2027-06-01', updatedAt: '2027-06-01T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(tooLate.valid, false);
  assert.ok(tooLate.errors.some(error => error.code === 'TECH_OP06_DATE_WINDOW'));
  const valid = api.transitionOperation(record, 'OP-06', {
    status: 'DONE', completedAt: '2027-05-30', updatedAt: '2027-05-30T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(valid.valid, true);
});

test('operation transition rejects duplicate operation rows and never mutates invalid state', () => {
  const record = operationRecord();
  record.state.operations.push({ operationId: 'OP-01', status: 'PENDING' });
  const original = JSON.stringify(record);
  const result = api.transitionOperation(record, 'OP-01', {
    status: 'DONE', completedAt: '2027-04-05', updatedAt: '2027-04-05T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === 'OPERATION_REFERENCE_INVALID'));
  assert.equal(JSON.stringify(record), original);
});


test('OP-02 cannot be completed without actual feeding dates, duration, daily syrup amount and 2:1 ratio', () => {
  const record = operationRecord();
  const missing = api.transitionOperation(record, 'OP-02', {
    status: 'DONE', completedAt: '2027-04-12', updatedAt: '2027-04-12T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some(error => error.code === 'TECH_OP02_FEEDING_DATES_REQUIRED'));
  assert.ok(missing.errors.some(error => error.code === 'TECH_OP02_SYRUP_AMOUNT'));
  assert.ok(missing.errors.some(error => error.code === 'TECH_OP02_SYRUP_RATIO'));
});

test('OP-02 accepts a recorded 12-day 2:1 syrup feeding in the specified daily amount range', () => {
  const record = operationRecord();
  const result = api.transitionOperation(record, 'OP-02', {
    status: 'DONE',
    completedAt: '2027-04-12',
    feeding: { startDate: '2027-04-01', endDate: '2027-04-12', gramsPerColonyPerDay: 150, sugarParts: 2, waterParts: 1 },
    updatedAt: '2027-04-12T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.records[0].state.operations.find(item => item.operationId === 'OP-02').feeding, {
    startDate: '2027-04-01', endDate: '2027-04-12', gramsPerColonyPerDay: 150, sugarParts: 2, waterParts: 1
  });
  assert.equal(record.state.operations.find(item => item.operationId === 'OP-02').status, 'PENDING');
});

test('OP-02 rejects duration outside 12–15 calendar days, incorrect syrup ratio and amount', () => {
  const record = operationRecord();
  const base = { status: 'DONE', completedAt: '2027-04-11', updatedAt: '2027-04-11T10:00:00.000Z' };
  const short = api.transitionOperation(record, 'OP-02', {
    ...base, feeding: { startDate: '2027-04-01', endDate: '2027-04-11', gramsPerColonyPerDay: 150, sugarParts: 2, waterParts: 1 }
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(short.errors.some(error => error.code === 'TECH_OP02_DURATION'));
  const wrongRatio = api.transitionOperation(record, 'OP-02', {
    ...base, feeding: { startDate: '2027-04-01', endDate: '2027-04-12', gramsPerColonyPerDay: 150, sugarParts: 1, waterParts: 1 }
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(wrongRatio.errors.some(error => error.code === 'TECH_OP02_SYRUP_RATIO'));
  const wrongAmount = api.transitionOperation(record, 'OP-02', {
    ...base, completedAt: '2027-04-12', feeding: { startDate: '2027-04-01', endDate: '2027-04-12', gramsPerColonyPerDay: 250, sugarParts: 2, waterParts: 1 }
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(wrongAmount.errors.some(error => error.code === 'TECH_OP02_SYRUP_AMOUNT'));
});


test('OP-04 and OP-05 cannot be completed while the process remains PRE_DIVISION', () => {
  const record = operationRecord();
  const op04 = api.transitionOperation(record, 'OP-04', {
    status: 'DONE', completedAt: '2027-05-10', additionalBottomsInstalled: true, updatedAt: '2027-05-10T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(op04.valid, false);
  assert.ok(op04.errors.some(x => x.code === 'TECH_RECORD_STATE_OPERATION_PHASE_MISMATCH'));

  const withOp04 = structuredClone(record);
  const op04Row = withOp04.state.operations.find(x => x.operationId === 'OP-04');
  op04Row.status = 'DONE';
  op04Row.completedAt = '2027-05-10';
  const op05 = api.transitionOperation(withOp04, 'OP-05', {
    status: 'DONE', completedAt: '2027-05-19', updatedAt: '2027-05-19T10:00:00.000Z'
  }, [withOp04], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(op05.valid, false);
  assert.ok(op05.errors.some(x => x.code === 'TECH_RECORD_STATE_OPERATION_PHASE_MISMATCH'));
});

test('OP-04 requires explicit confirmation of two additional bottoms and preserves legacy records', () => {
  const state = dividedState({
    operations: api.SPEC.operations.map(operation => ({ operationId: operation.id, status: 'PENDING' }))
  });
  const record = operationRecord(state);
  const missing = api.transitionOperation(record, 'OP-04', {
    status: 'DONE', completedAt: '2027-05-10', updatedAt: '2027-05-10T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some(error => error.code === 'OP04_ADDITIONAL_BOTTOMS_CONFIRMATION_REQUIRED'));

  const confirmed = api.transitionOperation(record, 'OP-04', {
    status: 'DONE', completedAt: '2027-05-10', additionalBottomsInstalled: true, updatedAt: '2027-05-10T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(confirmed.valid, true);
  assert.equal(confirmed.record.specVersion, '1.8.0');
  assert.equal(confirmed.record.state.operations.find(operation => operation.operationId === 'OP-04').additionalBottomsInstalled, true);

  const currentUnconfirmed = structuredClone(record);
  currentUnconfirmed.state.operations.find(operation => operation.operationId === 'OP-04').status = 'DONE';
  currentUnconfirmed.state.operations.find(operation => operation.operationId === 'OP-04').completedAt = '2027-05-10';
  const invalidStored = api.validateStoredRecords([currentUnconfirmed], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.ok(invalidStored.errors.some(error => error.code === 'TECH_OP04_BOTTOMS_CONFIRMATION_REQUIRED'));

  const legacy = structuredClone(record);
  legacy.specVersion = '1.4.0';
  const legacyOp04 = legacy.state.operations.find(operation => operation.operationId === 'OP-04');
  legacyOp04.status = 'DONE';
  legacyOp04.completedAt = '2027-05-10';
  assert.equal(api.validateStoredRecords([legacy], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]).valid, true);
});

test('R1 requires an explicit entrance state for every section', () => {
  const result = api.validateHiveState(dividedState({
    sections: [sectionFixture(1, { entranceState: undefined }), sectionFixture(2), sectionFixture(3)]
  }));
  assert.ok(result.errors.some(x => x.code === 'R1_ENTRANCE_STATE'));
});

test('R3 requires two inter-section connections with two excluders and a buffer corridor', () => {
  const missing = api.validateHiveState(dividedState({
    operations: [{ operationId: 'OP-04', status: 'DONE' }],
    technicalConnections: [
      { fromSectionIndex: 1, toSectionIndex: 2, queenExcluderLayers: 2, bufferCorridorPresent: true },
      { fromSectionIndex: 2, toSectionIndex: 3, queenExcluderLayers: 2, bufferCorridorPresent: false }
    ]
  }));
  assert.ok(missing.errors.some(x => x.code === 'R3_BUFFER_CORRIDOR_MISSING'));

  const incomplete = api.validateHiveState(dividedState({
    operations: [{ operationId: 'OP-04', status: 'DONE' }],
    technicalConnections: [
      { fromSectionIndex: 1, toSectionIndex: 2, queenExcluderLayers: 1, bufferCorridorPresent: true }
    ]
  }));
  assert.ok(incomplete.errors.some(x => x.code === 'R3_CONNECTION_COUNT'));
  assert.ok(incomplete.errors.some(x => x.code === 'R3_CONNECTION_MISSING'));
});

test('R4 is enforced when OP-07 is marked DONE even if phase was not advanced', () => {
  const result = api.validateHiveState(dividedState({
    operations: [{ operationId: 'OP-06', status: 'DONE' }, { operationId: 'OP-07', status: 'DONE' }],
    queens: [1, 2, 3].map(index => ({ id: 'queen-' + index, status: 'FERTILIZED', layingObserved: true })),
    sections: [1, 2, 3].map(index => sectionFixture(index, { isolation: 'CONNECTED' })),
    meshPlugs: []
  }));
  assert.ok(result.errors.some(x => x.code === 'OPERATION_PHASE_MISMATCH'));
  assert.ok(result.errors.some(x => x.code === 'R4_QUEEN_EXCLUDER_COUNT'));
  assert.ok(result.errors.some(x => x.code === 'R4_UPPER_NEST_BODY_REFERENCE'));
  assert.ok(result.errors.some(x => x.code === 'R4_HONEY_BODY_COUNT'));
});

test('R5 requires a three-body combined winter nest', () => {
  const result = api.validateHiveState({
    phase: 'WINTER_ASSEMBLY',
    config: { winteringMode: 'COMBINED' },
    operations: [{ operationId: 'OP-11', status: 'DONE' }]
  });
  assert.ok(result.errors.some(x => x.code === 'R5_WINTER_NEST_BODIES'));
});

test('R7 reads the alternative wintering mode from config and requires two mesh diaphragms', () => {
  const result = api.validateHiveState(dividedState({
    phase: 'ALT_WINTERING',
    config: { winteringMode: 'ALTERNATIVE_DIAPHRAGMS' },
    sections: [
      sectionFixture(1, { bodyIds: ['body-1-a', 'body-1-b'] }),
      sectionFixture(2, { bodyIds: ['body-2-a'] }),
      sectionFixture(3, { bodyIds: ['body-3-a'] })
    ]
  }));
  assert.ok(result.errors.some(x => x.code === 'R7_DIAPHRAGMS'));
  assert.equal(result.errors.some(x => x.code === 'R7_WINTERING_MODE'), false);
  assert.equal(result.errors.some(x => x.code === 'ALT_WINTER_BODY_LAYOUT'), false);
});


test('OP-02 migrates the old v1.3 field name to the daily norm', () => {
  const record = operationRecord();
  record.specVersion = '1.3.0';
  const result = api.transitionOperation(record, 'OP-02', {
    status: 'DONE',
    completedAt: '2027-04-12',
    feeding: { startDate: '2027-04-01', endDate: '2027-04-12', portionGrams: 150, sugarParts: 2, waterParts: 1 },
    updatedAt: '2027-04-12T10:00:00.000Z'
  }, [record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(result.valid, true);
  assert.equal(result.records[0].state.operations.find(x => x.operationId === 'OP-02').feeding.gramsPerColonyPerDay, 150);
  assert.equal(result.records[0].state.operations.find(x => x.operationId === 'OP-02').feeding.portionGrams, undefined);
});

test('OP-13 spring development and OP-14 early honey are compatible; OP-14 uses two honey bodies', () => {
  const valid = api.validateHiveState(dividedState({
    phase: 'ALT_WINTERING_SPRING',
    config: { honeyBodiesCount: 2, winteringMode: 'ALTERNATIVE_DIAPHRAGMS' },
    operations: [{ operationId: 'OP-13', status: 'DONE' }, { operationId: 'OP-14', status: 'DONE' }]
  }));
  assert.equal(valid.errors.some(x => x.code === 'R6_ALT_SPRING_EXCLUSIVE'), false);
  assert.equal(valid.errors.some(x => x.code === 'OP14_EARLY_HONEY_BODY_COUNT'), false);

  const fourSupers = api.validateHiveState(dividedState({
    phase: 'ALT_WINTERING_SPRING',
    config: { honeyBodiesCount: 4, winteringMode: 'ALTERNATIVE_DIAPHRAGMS' },
    operations: [{ operationId: 'OP-14', status: 'DONE' }]
  }));
  assert.ok(fourSupers.errors.some(x => x.code === 'OP14_EARLY_HONEY_BODY_COUNT'));
  assert.deepEqual(api.getOperation('OP-14').postHarvestNestBodies, [3, 4]);
  assert.equal(api.getOperation('OP-14').postHarvestCombineDelayDays, undefined);
  assert.match(api.getOperation('OP-14').temporaryMergeGuidance,/3–5 дней/);
  assert.equal(api.getOperation('OP-14').requiresConfirmedLineageCycle, true);
});


test('schema 14 refuses to complete OP-04 without a persisted family split event',()=>{
 const state=dividedState({
  familyLineageVersion:1,
  sections:[1,2,3].map(index=>sectionFixture(index,{familyId:'new-'+index,queenIdentityStatus:'identified'})),
  operations:api.SPEC.operations.map(operation=>({operationId:operation.id,status:'PENDING'}))
 });
 const record=operationRecord(state);
 const result=api.transitionOperation(record,'OP-04',{
  status:'DONE',completedAt:'2027-05-10',additionalBottomsInstalled:true,updatedAt:'2027-05-10T10:00:00.000Z'
 },[record],[{id:'h1',profileId:api.SPEC.id}],{meta:{schemaVersion:14},families:[],queens:[],familyEvents:[]});
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(error=>error.code==='TECH_OP04_FAMILY_SPLIT_EVENT_REQUIRED'));
});

test('OP-12 completion requires family links and two referenced physical mesh diaphragms',()=>{
 const lineage=windowRef.PasekaFamilyLineage;
 const apiary={meta:{schemaVersion:14},families:[1,2,3].map(i=>({id:'f'+i,hive:'h1',recordStatus:'active',colonyGroupId:'group-1',currentQueenId:'q'+i,queenIdentityStatus:'identified'})),queens:[1,2,3].map(i=>({id:'q'+i,familyId:'f'+i,status:'current'})),queenEvents:[],familyEvents:[],layouts:{},equipmentInventory:{items:{
  d1:{id:'d1',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'lower-middle'}},
  d2:{id:'d2',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'middle-upper'}}
 }}};
 const sections=[
  sectionFixture(1,{familyId:'f1',winteringPosition:'lower',bodyIds:['b1','b2'],queenId:'q1',queenIdentityStatus:'identified'}),
  sectionFixture(2,{familyId:'f2',winteringPosition:'middle',bodyIds:['b3'],queenId:'q2',queenIdentityStatus:'identified'}),
  sectionFixture(3,{familyId:'f3',winteringPosition:'upper',bodyIds:['b4'],queenId:'q3',queenIdentityStatus:'identified'})
 ];
 const record={id:'tech-12',hiveId:'h1',hiveProfileId:api.SPEC.id,specVersion:api.SPEC.version,createdAt:'2026-10-01T10:00:00.000Z',updatedAt:'2026-10-01T10:00:00.000Z',state:{
  familyLineageVersion:1,phase:'ALT_WINTERING',config:{winteringMode:'ALTERNATIVE_DIAPHRAGMS'},sections,
  queens:[1,2,3].map(i=>({id:'q'+i,status:'FERTILIZED',layingObserved:true})),
  diaphragms:[{itemId:'d1',hasMesh:true},{itemId:'d2',hasMesh:true}],
  operations:[{operationId:'OP-12',status:'DONE',completedAt:'2026-10-01'}]
 }};
 const configured=lineage.configureAlternativeWintering(apiary,{
  familyIds:['f1','f2','f3'],diaphragmItemIds:['d1','d2'],techProcessId:'tech-12',
  layout:[{familyId:'f1',position:'lower',bodyCount:2},{familyId:'f2',position:'middle',bodyCount:1},{familyId:'f3',position:'upper',bodyCount:1}]
 },()=> 'event-12','2026-10-01T10:00:00.000Z');
 assert.equal(configured.ok,true);
 const result=api.validateStoredRecords([record],[{id:'h1',profileId:api.SPEC.id}],apiary);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
});

test('OP-13 spring relocation records two upper families on separate bottoms without merging families',()=>{
 const lineage=windowRef.PasekaFamilyLineage;
 const apiary={meta:{schemaVersion:14},families:[1,2,3].map(i=>({id:'f'+i,hive:'h1',recordStatus:'active',colonyGroupId:'group-1',currentQueenId:'q'+i,queenIdentityStatus:'identified'})),queens:[1,2,3].map(i=>({id:'q'+i,familyId:'f'+i,status:'current'})),queenEvents:[],familyEvents:[],layouts:{},equipmentInventory:{
  bodies:{b2:{id:'b2'},b2new:{id:'b2new'},b3:{id:'b3'},b3new:{id:'b3new'},upper1:{id:'upper1',kind:'brood',condition:'good',spec:{profileId:api.SPEC.id,framesPerBox:6}},upper2:{id:'upper2',kind:'brood',condition:'good',spec:{profileId:api.SPEC.id,framesPerBox:6}},upper3:{id:'upper3',kind:'brood',condition:'good',spec:{profileId:api.SPEC.id,framesPerBox:6}},honey1:{id:'honey1',kind:'honey',condition:'good',spec:{profileId:api.SPEC.id,framesPerBox:10}},honey2:{id:'honey2',kind:'honey',condition:'good',spec:{profileId:api.SPEC.id,framesPerBox:10}}},
  items:{
   d1:{id:'d1',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'grid-lower'}},
   d2:{id:'d2',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'grid-upper'}},
   bottom2:{id:'bottom2',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'bottom-middle'}},
   bottom3:{id:'bottom3',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'bottom-upper'}}
  }
 }};
 let id=0;const makeId=()=> 'spring-'+(++id);
 assert.equal(lineage.configureAlternativeWintering(apiary,{familyIds:['f1','f2','f3'],diaphragmItemIds:['d1','d2'],techProcessId:'tech-13',layout:[{familyId:'f1',position:'lower',bodyCount:2},{familyId:'f2',position:'middle',bodyCount:1},{familyId:'f3',position:'upper',bodyCount:1}]},makeId,'2026-04-01T10:00:00.000Z').ok,true);
 assert.equal(lineage.recordPlacementChanged(apiary,{familyIds:['f1','f2','f3'],familyId:'f2',techProcessId:'tech-13',from:{position:'middle',bodyIds:['b2']},to:{position:'separate_bottom',bottomItemId:'bottom2',bodyIds:['b2','b2new']}},makeId,'2026-04-20T10:00:00.000Z').ok,true);
 assert.equal(lineage.recordPlacementChanged(apiary,{familyIds:['f1','f2','f3'],familyId:'f3',techProcessId:'tech-13',from:{position:'upper',bodyIds:['b3']},to:{position:'separate_bottom',bottomItemId:'bottom3',bodyIds:['b3','b3new']}},makeId,'2026-04-20T10:05:00.000Z').ok,true);
 const record={id:'tech-13',hiveId:'h1',hiveProfileId:api.SPEC.id,specVersion:api.SPEC.version,createdAt:'2026-03-01T10:00:00.000Z',updatedAt:'2026-04-20T10:05:00.000Z',state:{
  familyLineageVersion:1,phase:'ALT_WINTERING_SPRING',config:{winteringMode:'ALTERNATIVE_DIAPHRAGMS'},
  sections:[
   sectionFixture(1,{familyId:'f1',winteringPosition:'lower',bodyIds:['b1','b1new'],queenId:'q1',queenIdentityStatus:'identified'}),
   sectionFixture(2,{familyId:'f2',winteringPosition:'separate_bottom',bodyIds:['b2','b2new'],queenId:'q2',queenIdentityStatus:'identified'}),
   sectionFixture(3,{familyId:'f3',winteringPosition:'separate_bottom',bodyIds:['b3','b3new'],queenId:'q3',queenIdentityStatus:'identified'})
  ],
  queens:[1,2,3].map(i=>({id:'q'+i,status:'FERTILIZED',layingObserved:true})),diaphragms:[],
  operations:[{operationId:'OP-12',status:'DONE',completedAt:'2026-04-01'},{operationId:'OP-13',status:'DONE',completedAt:'2026-04-20'}]
 }};
 assert.deepEqual(lineage.inspect(apiary),[]);
 const result=api.validateStoredRecords([record],[{id:'h1',profileId:api.SPEC.id}],apiary);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
});


test('OP-14 completion requires the early harvest, temporary merge and repeat split lineage events',()=>{
 const lineage=windowRef.PasekaFamilyLineage;
 const apiary={
  meta:{schemaVersion:14},
  families:[1,2,3].map(i=>({id:'f'+i,hive:'h1',recordStatus:'active',colonyGroupId:'group-1',currentQueenId:'q'+i,queenIdentityStatus:'identified'})),
  queens:[1,2,3].map(i=>({id:'q'+i,familyId:'f'+i,status:'current'})),
  queenEvents:[],familyEvents:[],layouts:{},
  equipmentInventory:{
   bodies:{
    b2:{id:'b2'},b2new:{id:'b2new'},b3:{id:'b3'},b3new:{id:'b3new'},
    upper1:{id:'upper1',kind:'brood',condition:'good',spec:{profileId:api.SPEC.id,framesPerBox:6}},
    upper2:{id:'upper2',kind:'brood',condition:'good',spec:{profileId:api.SPEC.id,framesPerBox:6}},
    upper3:{id:'upper3',kind:'brood',condition:'good',spec:{profileId:api.SPEC.id,framesPerBox:6}},
    honey1:{id:'honey1',kind:'honey',condition:'good',spec:{profileId:api.SPEC.id,framesPerBox:10}},
    honey2:{id:'honey2',kind:'honey',condition:'good',spec:{profileId:api.SPEC.id,framesPerBox:10}}
   },
   items:{
    d1:{id:'d1',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'grid-lower'}},
    d2:{id:'d2',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'grid-upper'}},
    bottom2:{id:'bottom2',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'bottom-middle'}},
    bottom3:{id:'bottom3',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'bottom-upper'}},
    'grid-left':{id:'grid-left',kind:'honeyQueenExcluder',condition:'good'},
    'grid-right':{id:'grid-right',kind:'honeyQueenExcluder',condition:'good'}
   }
  }
 };
 const makeId=(()=>{let n=0;return()=> 'lineage-'+(++n)})();
 const physicalSetup={honeyBodyIds:['honey1','honey2'],honeyBodySnapshots:[{bodyId:'honey1',kind:'honey',condition:'good',framesPerBox:10,profileId:api.SPEC.id,hiveId:'h1',installed:true},{bodyId:'honey2',kind:'honey',condition:'good',framesPerBox:10,profileId:api.SPEC.id,hiveId:'h1',installed:true}],largeExcluderIds:['grid-left','grid-right'],largeExcluderSnapshots:[{itemId:'grid-left',kind:'honeyQueenExcluder',condition:'good',hiveId:'h1',installed:true,footprint:[{bodyId:'upper1',coverage:'FULL'},{bodyId:'upper2',coverage:'HALF'}]},{itemId:'grid-right',kind:'honeyQueenExcluder',condition:'good',hiveId:'h1',installed:true,footprint:[{bodyId:'upper2',coverage:'HALF'},{bodyId:'upper3',coverage:'FULL'}]}],upperBodyIds:['upper1','upper2','upper3']};
 assert.equal(lineage.configureAlternativeWintering(apiary,{familyIds:['f1','f2','f3'],diaphragmItemIds:['d1','d2'],techProcessId:'tech-14',layout:[{familyId:'f1',position:'lower',bodyCount:2},{familyId:'f2',position:'middle',bodyCount:1},{familyId:'f3',position:'upper',bodyCount:1}]},makeId,'2026-04-01T10:00:00.000Z').ok,true);
 assert.equal(lineage.recordPlacementChanged(apiary,{familyIds:['f1','f2','f3'],familyId:'f2',techProcessId:'tech-14',from:{position:'middle',bodyIds:['b2']},to:{position:'separate_bottom',bottomItemId:'bottom2',bodyIds:['b2','b2new']}},makeId,'2026-04-20T10:00:00.000Z').ok,true);
 assert.equal(lineage.recordPlacementChanged(apiary,{familyIds:['f1','f2','f3'],familyId:'f3',techProcessId:'tech-14',from:{position:'upper',bodyIds:['b3']},to:{position:'separate_bottom',bottomItemId:'bottom3',bodyIds:['b3','b3new']}},makeId,'2026-04-20T10:05:00.000Z').ok,true);
 assert.equal(lineage.recordEarlyHoneyHarvest(apiary,{familyIds:['f1','f2','f3'],nestBodiesAfterHarvest:3,physicalSetup,honeyBodiesRemoved:true,largeExcludersRemoved:true,harvestConfirmed:true,diaphragmsRemoved:true,familiesOnSeparateBottoms:true,techProcessId:'tech-14'},makeId,'2026-05-01T10:00:00.000Z').ok,true);
 const merged=lineage.applyMerge(apiary,{sourceFamilyIds:['f1','f2','f3'],operationId:'OP-14',scenario:'EARLY_HONEY',techProcessId:'tech-14',resultFamily:{id:'early-merge',hive:'h1'}},makeId,'2026-05-04T10:00:00.000Z');
 assert.equal(merged.ok,true);
 const split=lineage.applySplit(apiary,{sourceFamilyId:'early-merge',operationId:'OP-14',scenario:'EARLY_HONEY',techProcessId:'tech-14',resultFamilies:[1,2,3].map(i=>({id:'after-'+i,hive:'h1'}))},makeId,'2026-05-10T10:00:00.000Z');
 assert.equal(split.ok,true);
 const record={id:'tech-14',hiveId:'h1',hiveProfileId:api.SPEC.id,specVersion:api.SPEC.version,createdAt:'2026-04-01T10:00:00.000Z',updatedAt:'2026-05-10T10:00:00.000Z',state:{
  familyLineageVersion:1,phase:'ALT_WINTERING_SPRING',earlyHoneySetup:physicalSetup,config:{winteringMode:'ALTERNATIVE_DIAPHRAGMS',honeyBodiesCount:2},
  sections:split.families.map((family,index)=>sectionFixture(index+1,{familyId:family.id,bodyIds:['body-'+index+'-a','body-'+index+'-b'],queenId:null,queenIdentityStatus:'unresolved'})),
  queens:[],operations:[{operationId:'OP-12',status:'DONE',completedAt:'2026-04-01'},{operationId:'OP-13',status:'DONE',completedAt:'2026-04-20'},{operationId:'OP-14',status:'DONE',completedAt:'2026-05-10'}]
 }};
 const result=api.validateStoredRecords([record],[{id:'h1',profileId:api.SPEC.id}],apiary);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
 const withoutSplit={...apiary,familyEvents:apiary.familyEvents.filter(event=>event.type!=='split')};
 const rejected=api.validateStoredRecords([record],[{id:'h1',profileId:api.SPEC.id}],withoutSplit);
 assert.ok(rejected.errors.some(error=>error.code==='TECH_OP14_REPEAT_SPLIT_EVENT_REQUIRED'));
});


test('stored sectional processes reject a Farrar profile even when frame height is 180 mm', () => {
  const record = {
    id: 'tp-profile', hiveId: 'h1', hiveProfileId: 'sectional-multiqueen-v1',
    specVersion: api.SPEC.version,
    createdAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:00:00.000Z',
    state: { phase: 'WINTER', config: { frameHeightMm: 180 }, operations: [] }
  };
  const wrongProfile = api.validateStoredRecords([record], [{ id: 'h1', profileId: 'farrar-6x6-v1', frame: { heightMm: 180 } }]);
  assert.ok(wrongProfile.errors.some(x => x.code === 'TECH_HIVE_PROFILE_MISMATCH'));
  const correctProfile = api.validateStoredRecords([record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]);
  assert.equal(correctProfile.valid, true);
});


test('AI context and Worker keep Farrar rules isolated from the sectional profile', () => {
  assert.ok(worker.includes('profileId=farrar-6x6-v1'));
  assert.ok(worker.includes('const SECTIONAL_PROFILE_GUIDANCE'));
  assert.ok(worker.includes("item?.hiveProfileId==='sectional-multiqueen-v1'"));
  assert.ok(worker.includes('не переноси их на другие профили'));
  assert.ok(html.includes("profileId:h.profileId||h.profile?.id||null"));
  assert.ok(html.includes("hiveProfileId:record?.hiveProfileId||null"));
});


test('OP-13 cannot be marked DONE without two confirmed upper-family relocations',()=>{
 const apiary={meta:{schemaVersion:14},families:[],queens:[],queenEvents:[],familyEvents:[],equipmentInventory:{items:{},bodies:{}}};
 const record={id:'tech-op13-guard',hiveId:'h1',hiveProfileId:api.SPEC.id,specVersion:api.SPEC.version,createdAt:'2026-04-01T10:00:00.000Z',updatedAt:'2026-04-20T10:00:00.000Z',state:{
  familyLineageVersion:1,phase:'ALT_WINTERING_SPRING',config:{winteringMode:'ALTERNATIVE_DIAPHRAGMS'},
  sections:[1,2,3].map((index)=>sectionFixture(index,{familyId:'f'+index,bodyIds:index===1?['b1','b1b']:['b'+index],queenId:'q'+index,queenIdentityStatus:'identified',winteringPosition:index===1?'lower':index===2?'middle':'upper'})),
  queens:[1,2,3].map(index=>({id:'q'+index,status:'FERTILIZED',layingObserved:true})),
  operations:[{operationId:'OP-12',status:'DONE',completedAt:'2026-04-01'},{operationId:'OP-13',status:'DONE',completedAt:'2026-04-20'}]
 }};
 const result=api.validateStoredRecords([record],[{id:'h1',profileId:api.SPEC.id}],apiary);
 assert.ok(result.errors.some(error=>error.code==='TECH_OP13_TWO_UPPER_FAMILY_MOVES_REQUIRED'));
});

test('versioned physical layout validation is part of stored-record validation',()=>{
 const now='2026-11-17T10:00:00.000Z';
 const record={id:'tp-physical-version',hiveId:'h1',hiveProfileId:'sectional-multiqueen-v1',specVersion:'1.8.0',createdAt:now,updatedAt:now,state:{phase:'WINTER',physicalLayoutVersion:2,operations:[]}};
 const result=api.validateStoredRecords([record],[{id:'h1',profileId:'sectional-multiqueen-v1'}],{meta:{schemaVersion:13},layouts:{h1:{corpusIds:{}}},equipmentInventory:{items:{},bodies:{}}});
 assert.ok(result.errors.some(error=>error.code==='TECH_PHYSICAL_LAYOUT_VERSION_UNSUPPORTED'));
});
