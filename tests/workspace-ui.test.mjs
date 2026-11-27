import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/workspace-ui.js';
const ui=globalThis.PasekaWorkspaceUI;
test('calendar seasons use month boundaries without inferring colony state',()=>{
 const expected=['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'];
 for(let m=1;m<=12;m++)assert.equal(ui.calendarSeason('2026-'+String(m).padStart(2,'0')+'-01'),expected[m-1]);
 assert.equal(ui.calendarSeason('2024-02-29'),'winter');
});
test('invalid dates and unsupported keys are safe',()=>{
 for(const bad of [null,undefined,'','2026-02-29','2026-04-31','2026-13-01','2026-11-00','2026-1-01','2026-11-27T00:00:00Z'])assert.equal(ui.calendarSeason(bad),null);
 assert.equal(ui.seasonalContext('bad').source,'unknown');
 assert.equal(ui.seasonalContext('bad').topics.length,0);
 assert.equal(ui.seasonalContext('2026-11-27','constructor').season,'autumn');
 assert.equal(ui.normalizeMode('__proto__'),'home');
});
test('manual season overrides calendar without storage, network or task mutation',()=>{
 const result=ui.seasonalContext('2026-11-27','winter');
 assert.equal(result.source,'manual');assert.equal(result.label,'Зима');
 assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.topics));
 assert.match(result.note,/Фактическое состояние/);
});
test('five primary groups preserve ten routes with a separate canonical AI entry',()=>{
 assert.equal(ui.groups.length,5);
 const routes=ui.groups.flatMap(group=>group.routes);
 assert.equal(routes.length,10);assert.equal(new Set(routes).size,10);
 assert.deepEqual([...routes,'ai'].sort(),Object.keys(ui.labels).sort());
 assert.equal(ui.routeGroup('ai'),'ai');assert.equal(ui.routeGroup('entrance'),'hives');
 assert.equal(ui.routeGroup('forage'),'planning');assert.equal(ui.routeGroup('varroa'),'settings');assert.equal(ui.routeGroup('unknown'),null);
});
test('visual modes are explicit and unknown input defaults to home',()=>{
 for(const mode of ['field','home','night'])assert.equal(ui.normalizeMode(mode),mode);
 assert.equal(ui.normalizeMode(null),'home');
});
