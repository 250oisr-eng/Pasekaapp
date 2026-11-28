import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const labelsSource=await readFile(new URL('../js/equipment-labels.js',import.meta.url),'utf8'),source=await readFile(new URL('../js/equipment-bodies.js',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8'),sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');const win={};new Function('window',labelsSource)(win);new Function('window',source)(win);const swap=win.PasekaBodies.swapLocations;
function fixture(){const profile={id:'farrar-6x6-v1',frame:{widthMm:null,heightMm:180,topBarMm:null,bottomBarMm:null},brood:{framesPerBox:6,boxHeightMm:195},honey:{framesPerBox:10,boxHeightMm:null,boxKeys:['H1','H2']}};return {hives:[{id:'h1',profile},{id:'h2',profile}],layouts:{h1:{corpusIds:{1:'body-a',H1:'body-honey-a'},boxes:{1:{family:'',frames:[{frameId:'f-a',labelCode:'ААА',history:[]}]}},honeyFrames:[[{frameId:'fh-a',labelCode:'ААБ',history:[]}],[]]},h2:{corpusIds:{2:'body-b',H1:'body-honey-b'},boxes:{2:{family:'',frames:[{frameId:'f-b',labelCode:'ААГ',history:[]}]}},honeyFrames:[[{frameId:'fh-b',labelCode:'ААД',history:[]}],[]]}},equipmentLabels:{bodies:{'body-a':'7М2','body-b':'7КМ','body-honey-a':'7КН','body-honey-b':'7КЛ'}}}}
test('physical corpus swaps preserve permanent labels and move frame records with the body',()=>{const s=fixture(),r=swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'},'2026-11-13');assert.equal(r.ok,true);assert.equal(r.state.layouts.h1.corpusIds['1'],'body-b');assert.equal(r.state.layouts.h2.corpusIds['2'],'body-a');assert.equal(r.state.equipmentLabels.bodies['body-a'],'7М2');assert.equal(r.state.layouts.h2.boxes['2'].frames[0].labelCode,'ААА');assert.equal(r.state.layouts.h1.boxes['1'].frames[0].labelCode,'ААГ');assert.equal(s.layouts.h1.corpusIds['1'],'body-a');assert.equal(r.state.layouts.h2.boxes['2'].frames[0].history[0].action,'corpus_transfer');assert.ok(r.state.layouts.h2.boxes['2'].frames[0].history[0].id);assert.equal(r.state.layouts.h2.boxes['2'].frames[0].history[0].at,'2026-11-13')});
test('honey bodies can be exchanged with same-type honey bodies',()=>{const s=fixture(),r=swap(s,{fromHiveId:'h1',fromBoxKey:'H1',toHiveId:'h2',toBoxKey:'H1'});assert.equal(r.ok,true);assert.equal(r.state.layouts.h1.corpusIds.H1,'body-honey-b');assert.equal(r.state.layouts.h2.honeyFrames[0][0].labelCode,'ААБ')});
test('brood and honey bodies cannot be exchanged',()=>{const s=fixture(),r=swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'H1'});assert.equal(r.ok,false);assert.equal(r.error.code,'incompatible_corpus')});
test('a corpus carrying a family cannot be moved as a box-only operation',()=>{const s=fixture();s.layouts.h1.boxes['1'].family='family-1';const r=swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'});assert.equal(r.ok,false);assert.equal(r.error.code,'family_present');assert.equal(s.layouts.h1.corpusIds['1'],'body-a')});
test('missing locations, same location and corrupt duplicate mappings are rejected',()=>{const s=fixture();assert.equal(swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h1',toBoxKey:'1'}).error.code,'same_location');assert.equal(swap(s,{fromHiveId:'h1',fromBoxKey:'missing',toHiveId:'h2',toBoxKey:'2'}).error.code,'corpus_missing');s.layouts.h2.corpusIds['2']='body-a';assert.equal(swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'}).error.code,'duplicate_corpus_id')});
test('UI loads the body module before app code and precaches it',()=>{assert.ok(html.indexOf('./js/equipment-bodies.js')<html.indexOf('<script>'));assert.ok(html.includes('swapPhysicalCorpora()'));assert.ok(html.includes('corpusMoveTo'));assert.ok(sw.includes('./js/equipment-bodies.js'));assert.match(sw,/paseka-shell-v\d+/)});

test('matching profile IDs without stored geometry cannot authorize a physical exchange',()=>{const s=fixture();for(const hive of s.hives){hive.profileId=hive.profile.id;delete hive.profile;}const before=JSON.stringify(s),r=swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'});assert.equal(r.ok,false);assert.equal(r.error.code,'incompatible_corpus');assert.equal(JSON.stringify(s),before)});

test('physical body swap moves a stored body into an installed position without changing assembly slots',()=>{const s=fixture();s.layouts.h1.installedBoxes=['1'];s.layouts.h2.installedBoxes=[];const fromFrames=s.layouts.h1.boxes['1'].frames,toFrames=s.layouts.h2.boxes['2'].frames,r=swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'});assert.equal(r.ok,true);assert.equal(r.state.layouts.h1.corpusIds['1'],'body-b');assert.equal(r.state.layouts.h2.corpusIds['2'],'body-a');assert.equal(r.state.layouts.h1.boxes['1'].frames[0].frameId,toFrames[0].frameId);assert.equal(r.state.layouts.h1.boxes['1'].frames[0].history.at(-1).action,'corpus_transfer');assert.equal(r.state.layouts.h2.boxes['2'].frames[0].frameId,fromFrames[0].frameId);assert.equal(r.state.layouts.h2.boxes['2'].frames[0].history.at(-1).action,'corpus_transfer');assert.deepEqual(r.state.layouts.h1.installedBoxes,['1']);assert.deepEqual(r.state.layouts.h2.installedBoxes,[]) });


test('same profile ID does not override contradictory frame heights',()=>{
 const s=fixture(),before=JSON.stringify(s);
 s.hives[1].profile=structuredClone(s.hives[0].profile);
 s.hives[1].profile.frame.heightMm=195;
 const frozen=JSON.stringify(s);
 const r=swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'});
 assert.equal(r.ok,false);assert.equal(r.error.code,'incompatible_corpus');
 assert.equal(JSON.stringify(s),frozen);assert.notEqual(before,frozen);
});
test('same profile ID does not override contradictory brood body heights or capacity',()=>{
 const s=fixture();s.hives[1].profile=structuredClone(s.hives[0].profile);
 s.hives[1].profile.brood.boxHeightMm=210;
 const frozen=JSON.stringify(s);
 assert.equal(swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'}).error.code,'incompatible_corpus');
 assert.equal(JSON.stringify(s),frozen);
 s.hives[1].profile.brood.boxHeightMm=195;s.hives[1].profile.brood.framesPerBox=7;
 assert.equal(swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'}).error.code,'incompatible_corpus');
});
test('missing one-sided profile or inconsistent declared family cannot authorize a body swap',()=>{
 const s=fixture();s.hives[1].profile=null;s.hives[1].profileId='farrar-6x6-v1';
 const before=JSON.stringify(s);
 assert.equal(swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'}).error.code,'incompatible_corpus');
 assert.equal(JSON.stringify(s),before);
 s.hives[1].profile=structuredClone(s.hives[0].profile);
 s.hives[0].profile.family='farrar';s.hives[1].profile.family='sectional';
 assert.equal(swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'}).error.code,'incompatible_corpus');
});
test('existing Farrar same-profile swaps and honey bodies with unknown shared box height remain compatible',()=>{
 const s=fixture();const brood=swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'});
 const honey=swap(s,{fromHiveId:'h1',fromBoxKey:'H1',toHiveId:'h2',toBoxKey:'H1'});
 assert.equal(brood.ok,true);assert.equal(honey.ok,true);
 assert.equal(s.hives[0].profile.honey.boxHeightMm??null,null);
});


test('invalid non-null frame histories on either side prevent swap without touching original hives',()=>{
 for(const side of ['source','destination']){
  const s=fixture(),frame=side==='source'?s.layouts.h1.boxes['1'].frames[0]:s.layouts.h2.boxes['2'].frames[0];
  frame.history={corrupt:true};
  const before=JSON.stringify(s),r=swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'});
  assert.equal(r.ok,false);assert.equal(r.error.code,'invalid_frame_history');assert.equal(JSON.stringify(s),before);
 }
});
test('legacy null and absent frame history remain valid and do not mutate source snapshots',()=>{
 const s=fixture();
 s.layouts.h1.boxes['1'].frames[0].history=null;
 delete s.layouts.h2.boxes['2'].frames[0].history;
 const before=JSON.stringify(s),r=swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'});
 assert.equal(r.ok,true);
 assert.equal(JSON.stringify(s),before);
 assert.equal(r.state.layouts.h2.boxes['2'].frames[0].history.at(-1).action,'corpus_transfer');
 assert.equal(r.state.layouts.h1.boxes['1'].frames[0].history.at(-1).action,'corpus_transfer');
});
test('malformed frame entry fails closed without changing corpus identifiers',()=>{
 const s=fixture();s.layouts.h2.boxes['2'].frames.push(null);
 const before=JSON.stringify(s),r=swap(s,{fromHiveId:'h1',fromBoxKey:'1',toHiveId:'h2',toBoxKey:'2'});
 assert.equal(r.ok,false);assert.equal(r.error.code,'invalid_frame_history');assert.equal(JSON.stringify(s),before);
});
