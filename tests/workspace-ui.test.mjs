import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/workspace-ui.js';
const ui=globalThis.PasekaWorkspaceUI;
test('calendar seasons use month boundaries without inferring colony state',()=>{
 const expected=['winter','winter','spring-summer','spring-summer','spring-summer','spring-summer','spring-summer','spring-summer','autumn','autumn','autumn','winter'];
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
 assert.equal(result.source,'manual');assert.equal(result.label,'Зимовка');
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

test('display preferences are isolated, validated and survive reopening without touching journal storage',()=>{
 const storage=new Map([['paseka:previously-used:v1','true'],['journal-fixture','unchanged']]);
 const get=()=>({getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)});
 assert.deepEqual(ui.readPreferences(get),{mode:'home',season:'auto'});
 assert.equal(ui.writePreferences({mode:'night',season:'winter'},get),true);
 assert.deepEqual(ui.readPreferences(get),{mode:'night',season:'winter'});
 assert.equal(storage.get('journal-fixture'),'unchanged');
 assert.equal(storage.get('paseka:previously-used:v1'),'true');
 assert.deepEqual([...storage.keys()].sort(),['journal-fixture','paseka:previously-used:v1','paseka:workspace-ui:v1'].sort());
 assert.equal(ui.writePreferences({mode:'__proto__',season:'constructor'},get),true);
 assert.deepEqual(ui.readPreferences(get),{mode:'home',season:'auto'});
 storage.set('paseka:workspace-ui:v1','invalid json');
 assert.deepEqual(ui.readPreferences(get),{mode:'home',season:'auto'});
 assert.equal(ui.writePreferences({mode:'field'},()=>{throw Error('disabled storage')}),false);
 assert.deepEqual(ui.readPreferences(()=>{throw Error('disabled storage')}),{mode:'home',season:'auto'});
});

test('exactly three seasons, old manual choices preserved, seasonal menu changes priority without losing routes',()=>{assert.equal(Object.keys(ui.seasons).length,3);for(const old of ['spring','summer'])assert.equal(ui.normalizePreferences({season:old}).season,'spring-summer');const winter=ui.seasonalContext('2026-01-01'),summer=ui.seasonalContext('2026-06-01'),autumn=ui.seasonalContext('2026-10-01');assert.notDeepEqual(winter.menu,summer.menu);assert.notDeepEqual(summer.menu,autumn.menu);for(const season of [winter,summer,autumn])assert.equal(new Set(season.menu).size,6);});
