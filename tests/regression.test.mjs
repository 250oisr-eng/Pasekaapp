import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function extractFunction(name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(html);
  assert.ok(match, 'Function not found: ' + name);
  const start = match.index;
  const next = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  next.lastIndex = match.index + match[0].length;
  const endMatch = next.exec(html);
  return html.slice(start, endMatch ? endMatch.index : html.indexOf('</script>', start));
}
function loadFunction(name, globals = {}) {
  const source = extractFunction(name);
  return new Function('deps', 'with (deps) { return (' + source + '); }')(globals);
}

test('family lineage accepts live and archived parents', () => {
  const inspect = loadFunction('inspectFamilyLineage');
  assert.deepEqual(inspect([{id:'p',origin:'swarm'},{id:'c',origin:'offshoot',parentFamilyId:'p'}]), []);
  assert.deepEqual(inspect([{id:'c',origin:'offshoot',parentFamilyId:'p',parentFamilySnapshot:{id:'p'}}]), []);
});
test('family lineage rejects missing parents and cycles', () => {
  const inspect = loadFunction('inspectFamilyLineage');
  assert.ok(inspect([{id:'c',origin:'offshoot',parentFamilyId:'missing'}]).some(x=>x.code==='family_parent_missing'));
  assert.ok(inspect([{id:'a',parentFamilyId:'b'},{id:'b',parentFamilyId:'a'}]).some(x=>x.code==='family_lineage_cycle'));
});
test('family establishment date must be a real calendar date', () => {
  const inspect = loadFunction('inspectFamilyLineage');
  assert.deepEqual(inspect([{id:'p'},{id:'c',origin:'offshoot',parentFamilyId:'p',stage:'independent',establishedAt:'2024-02-29'}]), []);
  assert.ok(inspect([{id:'p'},{id:'c',origin:'offshoot',parentFamilyId:'p',stage:'independent',establishedAt:'2026-02-30'}]).some(x=>x.code==='invalid_family_established_date'));
});
test('task lifecycle accepts only supported states and real dates', () => {
  const inspect = loadFunction('inspectTaskIntegrity');
  assert.deepEqual(inspect([{status:'pending',date:'2026-11-12'},{status:'suggested',date:'2024-02-29'},{status:'done'},{status:'dismissed'}]), []);
  const errors = inspect([{id:'bad-date',status:'pending',date:'2026-02-30'},{id:'bad-state',status:'complete',date:'2026-11-12'}]);
  assert.ok(errors.some(x=>x.code==='invalid_task_date' && x.details.taskId==='bad-date'));
  assert.ok(errors.some(x=>x.code==='invalid_task_status' && x.details.taskId==='bad-state'));
});

function makeBoxes(families = {}, frames = {}) {
  return Object.fromEntries([1,2,3,4,5,6].map(n=>[n,{family:families[n]||'',frames:frames[n]||[]}]));
}
function transferFixture() {
  return {
    hives:[{id:'h1',number:1},{id:'h2',number:2}],
    families:[{id:'fam',name:'26-1',hive:'h1',box:1,origin:'offshoot',parentFamilyId:'parent'},{id:'parent',name:'26-0',hive:'h1',box:3}],
    records:[{id:'record-1',family:'fam',hive:'h1'}],
    layouts:{
      h1:{mode:'summer',installedBoxes:[1,2,3],honeyFrames:[[],[]],boxes:makeBoxes({1:'fam',3:'parent'},{1:[{frameId:'1',location:'1',history:[]},{frameId:'2',location:'1',history:[]}]})},
      h2:{mode:'summer',installedBoxes:[1,2,3],honeyFrames:[[],[]],boxes:makeBoxes({}, {2:[{frameId:'1',location:'2',history:[]},{frameId:'9',location:'2',history:[]}]})}
    }
  };
}
async function runTransfer(data) {
  const deps = {
    S: JSON.parse(JSON.stringify(data)),
    transferringFamilyId:'fam', selectedHiveId:'h1', activeJournalHive:'h1',
    alerts:[], audit:[],
    $: id => ({transferTargetHive:{value:'h2'},transferTargetBox:{value:'2'},familyTransferDlg:{close(){}}}[id] || {value:'',close(){}}),
    alert(message){this.alerts.push(message);}, confirm(){return true;},
    hname:id=>'Улей '+id, today:()=>'2026-11-12',
    logAudit(...args){this.audit.push(args);},
    layoutFor(id){return this.S.layouts[id];},
    frameArray(layout,key){return key==='H1'?layout.honeyFrames[0]:key==='H2'?layout.honeyFrames[1]:layout.boxes[key].frames;},
    findFamilyBox(id){for(const hive of this.S.hives)for(let n=1;n<=6;n++){const box=this.S.layouts[hive.id]?.boxes[n];if(box?.family===id)return {hiveId:hive.id,box:n,data:box,layout:this.S.layouts[hive.id]};}return null;},
    nextFrameId(layout){return String(Math.max(0,...[1,2,3,4,5,6,'H1','H2'].flatMap(k=>(this.frameArray(layout,k)||[]).map(frame=>Number(frame.frameId)||0)))+1);},
    async save(){return true;}, render(){}, showTab(){}
  };
  const fn = loadFunction('confirmFamilyTransfer', deps);
  await fn({preventDefault(){}});
  return deps;
}
test('family transfer moves family and swaps frame sets while retaining lineage', async () => {
  const result = await runTransfer(transferFixture());
  assert.equal(result.S.families[0].hive,'h2');
  assert.equal(result.S.families[0].box,2);
  assert.equal(result.S.families[0].parentFamilyId,'parent');
  assert.deepEqual(result.S.layouts.h2.boxes[2].frames.map(x=>x.frameId),['1','2']);
  assert.deepEqual(result.S.layouts.h1.boxes[1].frames.map(x=>x.frameId),['1','9']);
  assert.equal(result.S.layouts.h1.boxes[1].family,'');
  assert.equal(result.S.layouts.h2.boxes[2].family,'fam');
  assert.equal(result.audit[0][0],'family_transferred');
});
test('family transfer rejects inconsistent target frame locations without partial mutation', async () => {
  const data = transferFixture();
  data.layouts.h2.boxes[2].frames[1].location='6';
  const result = await runTransfer(data);
  assert.equal(result.S.families[0].hive,'h1');
  assert.deepEqual(result.S.layouts.h1.boxes[1].frames.map(x=>x.frameId),['1','2']);
  assert.deepEqual(result.S.layouts.h2.boxes[2].frames.map(x=>x.frameId),['1','9']);
  assert.equal(result.audit.length,0);
  assert.equal(result.alerts.length,1);
});

function frameMoveFixture(){
  const boxes=Object.fromEntries([1,2,3,4,5,6].map(n=>[n,{family:'',frames:[]}]));
  const make=(id,box)=>({frameId:id,location:String(box),originBox:String(box),type:'comb',status:'drawn',history:[]});
  boxes[1].frames=[make('A','1'),make('B','1')];
  boxes[2].frames=[make('C','2'),make('D','2')];
  return {meta:{revisionId:'rev-1'},hives:[{id:'h1',number:1}],families:[],records:[],tasks:[],layouts:{h1:{mode:'summer',installedBoxes:[1,2,3],winterOrder:[],honeyBoxInstalled:[false,false],honeyFrames:[[],[]],boxes}}};
}
test('batch frame move plans and applies several moves atomically',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  const result=plan(state,[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'},{hiveId:'h1',frameId:'B',fromBox:'1',toBox:'3'},{hiveId:'h1',frameId:'C',fromBox:'2',toBox:'3'}]);
  assert.equal(result.ok,true);
  const applied=apply(state,result,'2026-11-12');
  assert.equal(applied.ok,true);
  assert.deepEqual(applied.state.layouts.h1.boxes[1].frames,[]);
  assert.deepEqual(applied.state.layouts.h1.boxes[2].frames.map(x=>x.frameId),['D']);
  assert.deepEqual(applied.state.layouts.h1.boxes[3].frames.map(x=>x.frameId),['A','B','C']);
  assert.deepEqual(state.layouts.h1.boxes[1].frames.map(x=>x.frameId),['A','B'],'source state is not mutated');
  assert.equal(applied.state.layouts.h1.boxes[3].frames[0].history.at(-1).to.location,'3');
  assert.equal(applied.state.layouts.h1.boxes[3].frames[0].history.at(-1).from.position,1);
  assert.equal(applied.state.layouts.h1.boxes[3].frames[1].history.at(-1).from.position,2);
  assert.equal(applied.state.auditLog.at(-1).type,'frames_moved_batch');
});
test('batch frame move supports an exchange without intermediate capacity failure',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  const result=plan(state,[{hiveId:'h1',frameId:'A',toBox:'2'},{hiveId:'h1',frameId:'C',toBox:'1'}]);
  assert.equal(result.ok,true);
  const applied=apply(state,result,'2026-11-12');
  assert.equal(applied.ok,true);
  assert.deepEqual(applied.state.layouts.h1.boxes[1].frames.map(x=>x.frameId),['B','C']);
  assert.deepEqual(applied.state.layouts.h1.boxes[2].frames.map(x=>x.frameId),['D','A']);
});
test('batch frame move rejects overflow and leaves original state untouched',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  state.layouts.h1.boxes[3].frames=Array.from({length:6},(_,i)=>({frameId:'T'+i,location:'3',history:[]}));
  const before=JSON.stringify(state);
  const result=plan(state,[{hiveId:'h1',frameId:'A',toBox:'3'}]);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.code==='move_target_over_capacity'));
  assert.equal(apply(state,result,'2026-11-12').ok,false);
  assert.equal(JSON.stringify(state),before);
});
test('batch frame move rejects wrong source, duplicate IDs and uninstalled targets',()=>{
  const plan=loadFunction('planFrameMoves');
  const state=frameMoveFixture();
  assert.ok(plan(state,[{hiveId:'h1',frameId:'A',fromBox:'2',toBox:'3'}]).errors.some(x=>x.code==='move_source_mismatch'));
  state.layouts.h1.boxes[2].frames.push({...state.layouts.h1.boxes[1].frames[0]});
  assert.ok(plan(state,[{hiveId:'h1',frameId:'A',toBox:'3'}]).errors.some(x=>x.code==='move_frame_id_ambiguous'));
  const clean=frameMoveFixture();
  assert.ok(plan(clean,[{hiveId:'h1',frameId:'A',toBox:'4'}]).errors.some(x=>x.code==='move_target_not_installed'));
});
test('batch frame move rejects winter forbidden boxes and stale plans',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  state.layouts.h1.mode='winter';state.layouts.h1.installedBoxes=[1,3,4];state.layouts.h1.winterOrder=[1,3,4];
  assert.ok(plan(state,[{hiveId:'h1',frameId:'A',toBox:'2'}]).errors.some(x=>x.code==='move_target_not_installed'));
  const summer=frameMoveFixture(),valid=plan(summer,[{hiveId:'h1',frameId:'A',toBox:'3'}]);
  summer.meta.revisionId='rev-2';
  const stale=apply(summer,valid,'2026-11-12');
  assert.equal(stale.ok,false);
  assert.equal(stale.errors[0].code,'move_plan_stale');
  assert.deepEqual(summer.layouts.h1.boxes[1].frames.map(x=>x.frameId),['A','B']);
});

test('AI command proposal requires clarification when a frame reference is incomplete',()=>{
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  const result=validate(state,{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',toBox:'3'}]});
  assert.equal(result.status,'needs_clarification');
  assert.ok(result.clarifyingQuestions.some(question=>question.includes('рамку')));
  assert.deepEqual(state.layouts.h1.boxes[1].frames.map(frame=>frame.frameId),['A','B']);
});
test('AI command proposal creates a validated preview but never mutates data',()=>{
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture(),before=JSON.stringify(state);
  const result=validate(state,{schemaVersion:1,kind:'move_frames',commandId:'cmd-1',explanation:'Перенос рамки',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]});
  assert.equal(result.status,'ready_for_preview');
  assert.equal(result.plan.commandId,'cmd-1');
  assert.equal(result.plan.moves[0].frameId,'A');
  assert.equal(JSON.stringify(state),before);
});
test('AI command proposal rejects unknown hives, unsupported actions and invalid destinations',()=>{
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  assert.equal(validate(state,{schemaVersion:1,kind:'delete_hive'}).errors[0].code,'ai_command_kind_unsupported');
  assert.equal(validate(state,{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'missing',frameId:'A',toBox:'3'}]}).errors[0].code,'ai_command_hive_unknown');
  const invalid=validate(state,{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',toBox:'5'}]});
  assert.equal(invalid.status,'invalid');
  assert.ok(invalid.errors.some(error=>error.code==='move_target_not_installed'));
  assert.deepEqual(state.layouts.h1.boxes[1].frames.map(frame=>frame.frameId),['A','B']);
});


test('batch frame move requires exact location metadata and well-formed history',()=>{
  const plan=loadFunction('planFrameMoves');
  const wrongLocation=frameMoveFixture();
  wrongLocation.layouts.h1.boxes[1].frames[0].location='';
  assert.ok(plan(wrongLocation,[{hiveId:'h1',frameId:'A',toBox:'3'}]).errors.some(x=>x.code==='move_frame_location_mismatch'));
  const brokenHistory=frameMoveFixture();
  brokenHistory.layouts.h1.boxes[1].frames[0].history=[null];
  assert.ok(plan(brokenHistory,[{hiveId:'h1',frameId:'A',toBox:'3'}]).errors.some(x=>x.code==='move_frame_history_invalid'));
});

test('batch frame move enforces the installed honey pair and ten-frame capacity',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  state.layouts.h1.honeyBoxInstalled=[true,false];
  assert.ok(plan(state,[{hiveId:'h1',frameId:'A',toBox:'H1'}]).errors.some(x=>x.code==='move_target_not_installed'));
  state.layouts.h1.honeyBoxInstalled=[true,true];
  state.layouts.h1.honeyFrames=[Array.from({length:10},(_,i)=>({frameId:'H'+i,location:'H1',history:[]})),[]];
  const before=JSON.stringify(state);
  const full=plan(state,[{hiveId:'h1',frameId:'A',toBox:'H1'}]);
  assert.ok(full.errors.some(x=>x.code==='move_target_over_capacity'));
  assert.equal(JSON.stringify(state),before);
  assert.equal(apply(state,full,'2026-11-12').ok,false);
});

test('batch frame move preserves family assignments and frame lineage while crossing family boxes',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  state.families=[{id:'family-a',hive:'h1',box:1,origin:'swarm'},{id:'family-b',hive:'h1',box:3,origin:'offshoot',parentFamilyId:'family-a'}];
  state.layouts.h1.boxes[1].family='family-a';
  state.layouts.h1.boxes[3].family='family-b';
  state.layouts.h1.boxes[1].frames[0].history=[{date:'2026-11-01',action:'inspected'}];
  const result=apply(state,plan(state,[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]),'2026-11-12');
  assert.equal(result.ok,true);
  assert.equal(result.state.layouts.h1.boxes[1].family,'family-a');
  assert.equal(result.state.layouts.h1.boxes[3].family,'family-b');
  assert.equal(result.state.families[1].parentFamilyId,'family-a');
  assert.equal(result.state.layouts.h1.boxes[3].frames.find(frame=>frame.frameId==='A').history[0].action,'inspected');
  assert.equal(result.state.layouts.h1.boxes[3].frames.find(frame=>frame.frameId==='A').history.at(-1).action,'move');
  assert.equal(state.layouts.h1.boxes[1].frames.find(frame=>frame.frameId==='A').history.length,1);
});


test('batch frame move refuses a plan changed after its preview was prepared',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture(),before=JSON.stringify(state);
  const prepared=plan(state,[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]);
  prepared.moves[0].toBox='2';
  const result=apply(state,prepared,'2026-11-12');
  assert.equal(result.ok,false);
  assert.equal(result.errors[0].code,'move_plan_preview_mismatch');
  assert.equal(JSON.stringify(state),before);
});
