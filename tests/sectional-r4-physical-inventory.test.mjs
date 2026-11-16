import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const techSource = await readFile(new URL('../js/sectional-multiqueen-techprocess.js', import.meta.url), 'utf8');
const equipmentSource = await readFile(new URL('../js/equipment-items.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const techWindow = {};
new Function('window', techSource)(techWindow);
const api = techWindow.PasekaSectionalTechProcess;

const now = '2026-11-16T10:00:00.000Z';
const upper = ['body-1-b', 'body-2-b', 'body-3-b'];
const leftCoverage = [{ bodyId: upper[0], coverage: 'FULL' }, { bodyId: upper[1], coverage: 'HALF' }];
const rightCoverage = [{ bodyId: upper[1], coverage: 'HALF' }, { bodyId: upper[2], coverage: 'FULL' }];

function fixture() {
  const bodyIds = [
    ['body-1-a', 'body-1-b'],
    ['body-2-a', 'body-2-b'],
    ['body-3-a', 'body-3-b']
  ];
  const sections = bodyIds.map((ids, index) => ({
    index: index + 1,
    bodyIds: ids,
    upperBodyId: ids[1],
    queenId: 'queen-' + (index + 1),
    isolation: 'CONNECTED',
    openEntrance: ['FLAT_BOTTOM', 'ROUND_TOP', 'ROUND_BOTTOM'][index],
    entranceState: ['HALF_OPEN', 'OPEN', 'OPEN'][index]
  }));
  const grids = [
    { id: 'logical-left', itemId: 'physical-left', coverage: leftCoverage },
    { id: 'logical-right', itemId: 'physical-right', coverage: rightCoverage }
  ];
  const record = {
    id: 'tech-1',
    hiveId: 'h1',
    hiveProfileId: 'sectional-multiqueen-v1',
    specVersion: api.SPEC.version,
    createdAt: now,
    updatedAt: now,
    state: {
      phase: 'HONEY_BODIES_INSTALLED',
      config: { frameHeightMm: 180, honeyBodiesCount: 2, winteringMode: 'COMBINED' },
      technicalConnections: [
        { fromSectionIndex: 1, toSectionIndex: 2, queenExcluderLayers: 2, bufferCorridorPresent: true },
        { fromSectionIndex: 2, toSectionIndex: 3, queenExcluderLayers: 2, bufferCorridorPresent: true }
      ],
      sections,
      queens: [1, 2, 3].map(index => ({ id: 'queen-' + index, status: 'FERTILIZED', layingObserved: true })),
      operations: [\n        { operationId: 'OP-04', status: 'DONE', completedAt: '2026-10-01', additionalBottomsInstalled: true },\n        { operationId: 'OP-05', status: 'DONE', completedAt: '2026-10-10' },\n        { operationId: 'OP-06', status: 'DONE', completedAt: '2026-10-21' },
        { operationId: 'OP-07', status: 'PENDING' }
      ],
      meshPlugs: [],
      honeyQueenExcluders: grids
    }
  };
  const allBodies = bodyIds.flat();
  const corpusIds = Object.fromEntries(allBodies.map((id, index) => ['P' + index, id]));
  const bodies = Object.fromEntries(allBodies.map(id => [id, { id, kind: 'brood', condition: 'good', spec: { framesPerBox: 6 } }]));
  const items = {
    'physical-left': {
      id: 'physical-left', kind: 'honeyQueenExcluder', condition: 'good',
      location: { type: 'hive', hiveId: 'h1', footprint: leftCoverage }
    },
    'physical-right': {
      id: 'physical-right', kind: 'honeyQueenExcluder', condition: 'good',
      location: { type: 'hive', hiveId: 'h1', footprint: rightCoverage }
    }
  };
  const apiary = {
    hives: [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }],
    layouts: { h1: { corpusIds } },
    equipmentInventory: { bodies, items, itemEvents: [] },
    sectionalTechProcesses: [record]
  };
  return { record, apiary, grids };
}

test('R4 accepts two physically registered and installed excluders with exact footprints', () => {
  const { record, apiary } = fixture();
  const result = api.validateStoredRecords([record], apiary.hives, apiary);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('R4 rejects physical grids assigned to the wrong section positions', () => {
  const { record, apiary } = fixture();
  const wrongLeft = [{ bodyId: upper[1], coverage: 'FULL' }, { bodyId: upper[0], coverage: 'HALF' }];
  const wrongRight = [{ bodyId: upper[0], coverage: 'HALF' }, { bodyId: upper[2], coverage: 'FULL' }];
  record.state.honeyQueenExcluders = [
    { id: 'logical-left', itemId: 'physical-left', coverage: wrongLeft },
    { id: 'logical-right', itemId: 'physical-right', coverage: wrongRight }
  ];
  apiary.equipmentInventory.items['physical-left'].location.footprint = wrongLeft;
  apiary.equipmentInventory.items['physical-right'].location.footprint = wrongRight;
  assert.ok(api.validateStoredRecords([record], apiary.hives, apiary).errors.some(x => x.code === 'TECH_RECORD_STATE_R4_EXCLUDER_SECTION_ALIGNMENT'));
});

test('R4 rejects reuse of one physical excluder for both logical grid records', () => {
  const { record, apiary } = fixture();
  record.state.honeyQueenExcluders[1].itemId = 'physical-left';
  assert.ok(api.validateStoredRecords([record], apiary.hives, apiary).errors.some(x => x.code === 'TECH_R4_ITEM_DUPLICATE'));
});

test('R4 rejects missing physical excluder items', () => {
  const { record, apiary } = fixture();
  delete apiary.equipmentInventory.items['physical-right'];
  const result = api.validateStoredRecords([record], apiary.hives, apiary);
  assert.ok(result.errors.some(x => x.code === 'TECH_R4_ITEM_MISSING'));
});

test('R4 rejects wrong accessory kind and non-good condition', () => {
  const wrongKind = fixture();
  wrongKind.apiary.equipmentInventory.items['physical-left'].kind = 'technicalQueenExcluder';
  assert.ok(api.validateStoredRecords([wrongKind.record], wrongKind.apiary.hives, wrongKind.apiary).errors.some(x => x.code === 'TECH_R4_ITEM_KIND'));
  const damaged = fixture();
  damaged.apiary.equipmentInventory.items['physical-left'].condition = 'needs_repair';
  assert.ok(api.validateStoredRecords([damaged.record], damaged.apiary.hives, damaged.apiary).errors.some(x => x.code === 'TECH_R4_ITEM_CONDITION'));
});

test('R4 rejects an excluder installed in another hive or on a different footprint', () => {
  const wrongHive = fixture();
  wrongHive.apiary.equipmentInventory.items['physical-left'].location.hiveId = 'h2';
  assert.ok(api.validateStoredRecords([wrongHive.record], wrongHive.apiary.hives, wrongHive.apiary).errors.some(x => x.code === 'TECH_R4_ITEM_HIVE_MISMATCH'));
  const wrongFootprint = fixture();
  wrongFootprint.apiary.equipmentInventory.items['physical-left'].location.footprint[0].bodyId = 'body-1-a';
  assert.ok(api.validateStoredRecords([wrongFootprint.record], wrongFootprint.apiary.hives, wrongFootprint.apiary).errors.some(x => x.code === 'TECH_R4_ITEM_FOOTPRINT_MISMATCH'));
});

test('R4 rejects a registered sectional body with the wrong kind or frame capacity', () => {
  const wrongKind = fixture();
  wrongKind.apiary.equipmentInventory.bodies['body-1-a'].kind = 'honey';
  assert.ok(api.validateStoredRecords([wrongKind.record], wrongKind.apiary.hives, wrongKind.apiary).errors.some(x => x.code === 'TECH_R4_SECTION_BODY_KIND'));
  const wrongCapacity = fixture();
  wrongCapacity.apiary.equipmentInventory.bodies['body-1-a'].spec.framesPerBox = 10;
  assert.ok(api.validateStoredRecords([wrongCapacity.record], wrongCapacity.apiary.hives, wrongCapacity.apiary).errors.some(x => x.code === 'TECH_R4_SECTION_BODY_FRAME_CAPACITY'));
});

test('R4 requires every sectional body to exist in the real layout and body inventory', () => {
  const missingLayout = fixture();
  delete missingLayout.apiary.layouts.h1.corpusIds.P0;
  assert.ok(api.validateStoredRecords([missingLayout.record], missingLayout.apiary.hives, missingLayout.apiary).errors.some(x => x.code === 'TECH_R4_SECTION_BODY_LAYOUT_MISSING'));
  const missingInventory = fixture();
  delete missingInventory.apiary.equipmentInventory.bodies['body-1-a'];
  assert.ok(api.validateStoredRecords([missingInventory.record], missingInventory.apiary.hives, missingInventory.apiary).errors.some(x => x.code === 'TECH_R4_SECTION_BODY_INVENTORY_MISSING'));
});

test('R4 fails closed when full physical apiary context is omitted', () => {
  const { record, apiary } = fixture();
  const result = api.validateStoredRecords([record], apiary.hives);
  assert.ok(result.errors.some(x => x.code === 'TECH_R4_PHYSICAL_CONTEXT_REQUIRED'));
});

test('OP-07 cannot be completed without the two installed physical excluders', () => {
  const { record, apiary } = fixture();
  delete apiary.equipmentInventory.items['physical-right'];
  const result = api.transitionOperation(record, 'OP-07', {
    status: 'DONE', completedAt: '2026-11-16', updatedAt: '2026-11-16T12:00:00.000Z'
  }, [record], apiary.hives, apiary);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(x => x.code === 'TECH_R4_ITEM_MISSING'));
});

test('OP-07 completes only when the two registered excluders match the confirmed physical layout', () => {
  const { record, apiary } = fixture();
  const result = api.transitionOperation(record, 'OP-07', {
    status: 'DONE', completedAt: '2026-11-16', updatedAt: '2026-11-16T12:00:00.000Z'
  }, [record], apiary.hives, apiary);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('legacy winter records remain valid without an accessory registry', () => {
  const record = {
    id: 'legacy-winter', hiveId: 'h1', hiveProfileId: 'sectional-multiqueen-v1', specVersion: '1.6.0',
    createdAt: now, updatedAt: now, state: { phase: 'WINTER', operations: [] }
  };
  assert.equal(api.validateStoredRecords([record], [{ id: 'h1', profileId: 'sectional-multiqueen-v1' }]).valid, true);
});

test('backup, migration, save and operation transition pass the full apiary context to R4 validation', () => {
  assert.match(html, /validateStoredRecords\(state\.sectionalTechProcesses\|\|\[\],state\.hives\|\|\[\],state\)/);
  assert.match(html, /validateStoredRecords\(S\.sectionalTechProcesses,S\.hives,S\)/);
  assert.match(html, /transitionOperation\(record,operationId,draft,S\.sectionalTechProcesses,S\.hives,S\)/);
});
