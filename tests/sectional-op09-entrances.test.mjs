import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-op09-entrances.js',import.meta.url),'utf8'))(w);
const api=w.PasekaSectionalOP09Entrances,now='2026-11-23T13:00:00Z';
const base=()=>({hives:[{id:'h1',profileId:'sectional-multiqueen-v1'}],sectionalLayouts:[{hiveId:'h1',mode:'SIDE_BY_SIDE',sections:[{id:'left'},{id:'middle'},{id:'right'}]}]});
const req=(phase)=>({hiveId:'h1',phase,userConfirmed:true,occurredAt:'2026-11-23T11:00:00Z',sections:['left','middle','right'].map(sectionId=>({sectionId,...api.configurations[phase]}))});
test('OP09 summer all-open observations staged without altering physical state',()=>{
 const state=base(),copy=structuredClone(state);
 const result=api.record(state,req('SUMMER_OPEN'),()=> 'op09-1',now);
 assert.equal(result.ok,true);assert.equal(result.stagedHistory[0].sections.length,3);assert.deepEqual(state,copy);
});
test('OP09 autumn one round and one-bee-width slit requires personal confirmation',()=>{
 const result=api.record(base(),req('AUTUMN_REDUCED'),()=> 'op09-2',now);
 assert.equal(result.ok,true);assert.equal(result.event.sections[0].flatEntrance,'one_bee_width');
 assert.equal(api.record(base(),{...req('AUTUMN_REDUCED'),userConfirmed:false},()=> 'fail',now).ok,false);
});
test('OP09 false reported opening, unknown section, wrong profile and forged time rejected',()=>{
 const a=req('SUMMER_OPEN');a.sections[1].roundEntrances='one_open';
 assert.equal(api.record(base(),a,()=> 'x',now).ok,false);
 const b=req('SUMMER_OPEN');b.sections[0].sectionId='untracked';
 assert.equal(api.record(base(),b,()=> 'x',now).ok,false);
 const other=base();other.hives[0].profileId='farrar';
 assert.equal(api.record(other,req('SUMMER_OPEN'),()=> 'x',now).ok,false);
 assert.equal(api.record(base(),{...req('SUMMER_OPEN'),occurredAt:'2026-11-24T11:00:00Z'},()=> 'x',now).ok,false);
});
test('OP09 inspector rejects duplicate or tampered events and leaves pre-existing OP01 records alone',()=>{
 const result=api.record(base(),req('SUMMER_OPEN'),()=> 'op09-1',now);
 const s={...base(),sectionalSeasonalEntranceObservations:result.stagedHistory,sectionalEntranceObservations:[{operationId:'OP-01'}]};
 assert.deepEqual(api.inspect(s),[]);
 s.sectionalSeasonalEntranceObservations.push(structuredClone(result.event));
 assert.ok(api.inspect(s).length);
});
