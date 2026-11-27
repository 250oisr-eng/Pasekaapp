import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function hiveObservationDate('),html.indexOf('function renderFamilyObservationCards('));
const {familyObservationSnapshot:snapshot,hiveTechnicalProjection:project}=new Function(source+';return {familyObservationSnapshot,hiveTechnicalProjection}')();
test('unknown metrics never become zero, same-day or conflicting records never create a false trend',()=>{
 const f=[{id:'a',hive:'h'}],r=[
 {id:'p',family:'a',hive:'h',type:'Осмотр',date:'2026-05-01',occupancy:2,broodFrames:4},
 {id:'s',family:'a',hive:'h',type:'Осмотр',date:'2026-05-02',occupancy:5,broodFrames:6},
 {id:'t',family:'a',hive:'h',type:'Осмотр',date:'2026-05-02',occupancy:0,broodFrames:null,queen:'notSeen',eggs:'no'},
 {id:'bad',family:'a',hive:'h',type:'Осмотр',date:'2026-02-31',occupancy:999},
 {id:'duplicate',family:'a',hive:'h',type:'Осмотр',date:'2026-06-02',occupancy:99},
 {id:'duplicate',family:'a',hive:'h',type:'Осмотр',date:'2026-06-03',occupancy:99}
 ];
 const before=structuredClone(r),data=snapshot(r,f,'h','a');
 assert.equal(data.date,'2026-05-02');assert.equal(data.metrics[0].value,0);assert.equal(data.metrics[0].delta,-2);
 assert.equal(data.metrics[1].value,null);assert.equal(data.metrics[1].delta,null);assert.equal(data.signals.length,1);assert.deepEqual(r,before);
});
test('technical map is read only, uses the committed positions and preserves winter order',()=>{
 const profile={status:'ready',brood:{boxKeys:['1','2','3']},honey:{boxKeys:['H1','H2'],installation:'paired'}};
 const layout={setupComplete:true,mode:'summer',installedBoxes:[3,1],winterOrder:[],boxes:{1:{family:'a',frames:[{frameId:'a1',status:'sealed'}]},2:{frames:[{frameId:'stock'}]},3:{frames:[{frameId:'a3',history:[{date:'2026-05-01',action:'move'}]}]}},honeyBoxInstalled:[true,true],honeyFrames:[[{frameId:'h1'}],[{frameId:'h2'}]]};
 const before=structuredClone(layout);let v=project(layout,profile);
 assert.deepEqual(v.bodies.map(b=>b.key),['3','1','H1','H2']);assert.equal(v.bodies[0].frames[0].status,null);assert.equal(v.bodies[1].familyId,'a');
 v.bodies[0].frames[0].history[0].action='other';assert.deepEqual(layout,before);
 assert.equal(project({...layout,setupEditing:true},profile).ok,false);
 assert.equal(project({...layout,honeyBoxInstalled:[true,false]},profile).ok,false);
 assert.equal(project({...layout,installedBoxes:[1,1]},profile).ok,false);
 assert.equal(project({...layout,installedBoxes:[7]},profile).ok,false);
 assert.equal(project({...layout,mode:'winter',winterOrder:[1,3],honeyBoxInstalled:[false,false]},profile).ok,true);
 assert.deepEqual(project({...layout,mode:'winter',winterOrder:[1,3],honeyBoxInstalled:[false,false]},profile).bodies.map(b=>b.key),['1','3']);
 assert.equal(project({...layout,mode:'winter',winterOrder:[1],honeyBoxInstalled:[false,false]},profile).ok,false);
 assert.equal(project(layout,{...profile,status:'draft'}).ok,false);
});
test('technical detail is secondary, and existing family and frame operations are retained',()=>{
 const i=html.indexOf('id="selectedFamilies"'),j=html.indexOf('id="hiveTechnicalView"');
 assert.ok(i>0&&j>i);
 assert.match(html,/<details id="hiveTechnicalView" class="card hive-technical-view">/);
 assert.match(html,/<details id="hiveAssemblyEditor" class="card">/);
 assert.match(html,/id="hiveDiagram"/);
 assert.match(html,/id="frameMapDlg" aria-labelledby="frameMapTitle"/);
 assert.match(html,/if\(layout\?\.setupEditing\)\{\$\('hiveTechnicalView'\)\.open=true/);
});
