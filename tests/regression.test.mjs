import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const hiveModelSource = await readFile(new URL('../js/hive-model.js', import.meta.url), 'utf8');
const equipmentLabelsSource = await readFile(new URL('../js/equipment-labels.js', import.meta.url), 'utf8');
const equipmentInventorySource = await readFile(new URL('../js/equipment-inventory.js', import.meta.url), 'utf8');
const varroaSource = await readFile(new URL('../js/varroa-monitor.js', import.meta.url), 'utf8');
const incidentSource = await readFile(new URL('../js/pesticide-incident.js', import.meta.url), 'utf8');
const voiceParserSource = await readFile(new URL('../js/voice-command-parser.js', import.meta.url), 'utf8');
const appWindow = {};
new Function('window', hiveModelSource)(appWindow);
new Function('window', equipmentLabelsSource)(appWindow);
new Function('window', equipmentInventorySource)(appWindow);
new Function('window', varroaSource)(appWindow);
new Function('window', incidentSource)(appWindow);
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
  const deps = globals;
  deps.window ||= appWindow;
  deps.PasekaHiveModel ||= appWindow.PasekaHiveModel;
  deps.PasekaLabels ||= appWindow.PasekaLabels;
  deps.PasekaInventory ||= appWindow.PasekaInventory;
  deps.PasekaVarroa ||= appWindow.PasekaVarroa;
  deps.PasekaIncident ||= appWindow.PasekaIncident;
  deps.profileForHive ||= (hiveId) => { const hive=deps.S?.hives?.find(item=>item?.id===hiveId); return hive?.profile || (deps.getHiveProfile ? deps.getHiveProfile(hive) : null); };
  if (name !== 'migrateQueenRegistry' && name !== 'inspectQueenRegistryIntegrity') {
    deps.migrateQueenRegistry ||= loadFunction('migrateQueenRegistry');
    deps.inspectQueenRegistryIntegrity ||= loadFunction('inspectQueenRegistryIntegrity');
  }
  return new Function('deps', 'with (deps) { return (' + source + '); }')(deps);
}

test('family lineage accepts live and archived parents', () => {
  const inspect = loadFunction('inspectFamilyLineage');
  assert.deepEqual(inspect([{id:'p',origin:'swarm'},{id:'c',origin:'offshoot',parentFamilyId:'p'}]), []);
  assert.deepEqual(inspect([{id:'c',origin:'offshoot',parentFamilyId:'p',parentFamilySnapshot:{id:'p'}}]), []);
});
test('family breed, line and queen provenance accept universal labels and reject malformed metadata',()=>{
 const inspect=loadFunction('inspectFamilyLineage');
 assert.deepEqual(inspect([{id:'f1',breed:'Порода из нового каталога',line:'Линия X-17',queen:{code:'Q-2026-014',year:2026,source:'Заводчик',notes:'Проверенная родословная'}}]),[]);
 assert.ok(inspect([{id:'f2',breed:'x'.repeat(101)}]).some(x=>x.code==='invalid_family_breed'));
 assert.ok(inspect([{id:'f3',line:'x'.repeat(121)}]).some(x=>x.code==='invalid_family_line'));
 assert.ok(inspect([{id:'f4',queen:{year:1800}}]).some(x=>x.code==='invalid_family_queen_provenance'));
 assert.ok(inspect([{id:'f5',queen:'not-an-object'}]).some(x=>x.code==='invalid_family_queen_provenance'));
});
test('family provenance save rolls back in-memory edits when persistence fails',async()=>{
 const original={meta:{revisionId:'rev-1'},hives:[{id:'h1'}],families:[{id:'f1',hive:'h1',breed:'Карпатка',line:'A',queen:{code:'Q1'},origin:'family',stage:'independent'}],records:[],tasks:[],extractions:[],layouts:{}};
 const deps={S:JSON.parse(JSON.stringify(original)),save:async()=>{deps.S.families[0].breed='Карника';deps.S.meta.saveError='Не удалось сохранить основную базу';return false},render(){this.rendered=true}};
 const saveMutation=loadFunction('saveFamilyMutation',deps),before=JSON.parse(JSON.stringify(deps.S));
 assert.equal(await saveMutation(before),false);
 assert.deepEqual(deps.S.families,before.families);
 assert.equal(deps.S.meta.saveError,'Не удалось сохранить основную базу');
 assert.equal(deps.rendered,true);
});
test('family provenance save keeps changes only after successful persistence',async()=>{
 const deps={S:{families:[{id:'f1',breed:'Карника'}]},save:async()=>true,render(){}};
 const saveMutation=loadFunction('saveFamilyMutation',deps);
 assert.equal(await saveMutation({families:[{id:'f1',breed:'Карпатка'}]}),true);
 assert.equal(deps.S.families[0].breed,'Карника');
});

test('queen registry migration preserves legacy queen details without inventing introduction dates',()=>{
 const migrate=loadFunction('migrateQueenRegistry');
 const state={families:[{id:'f1',queen:{code:'Q-1',year:2024,source:'Питомник',notes:'Линия A'}},{id:'f2',queen:null},{id:'f3',queen:{code:'Q-3'}}]};
 let n=0;migrate(state,()=> 'queen-'+(++n),'2026-11-13T10:00:00.000Z');
 assert.equal(state.queens.length,2);assert.equal(state.families[0].currentQueenId,state.queens[0].id);assert.equal(state.queens[0].code,'Q-1');assert.equal(state.queens[0].familyId,'f1');
 assert.equal(state.queenEvents.length,2);assert.equal(state.queenEvents[0].date,null);assert.equal(state.queenEvents[0].type,'legacy_imported');
 const snapshot=JSON.stringify(state);migrate(state,()=> 'unexpected','2026-11-14T10:00:00.000Z');assert.equal(JSON.stringify(state),snapshot);
});
test('queen registry integrity detects broken current links, invalid statuses and event references',()=>{
 const inspect=loadFunction('inspectQueenRegistryIntegrity');
 const state={families:[{id:'f1',currentQueenId:'q1'}],queens:[{id:'q1',familyId:'f1',status:'current'},{id:'q2',familyId:'missing',status:'ghost'}],queenEvents:[{id:'e1',type:'introduced',familyId:'f1',queenId:'absent',date:'2026-02-30'}]};
 const codes=inspect(state).map(x=>x.code);assert.ok(codes.includes('queen_family_missing'));assert.ok(codes.includes('invalid_queen_status'));assert.ok(codes.includes('queen_event_queen_missing'));assert.ok(codes.includes('invalid_queen_event_date'));
});
test('queen registry accepts current and historical queen records',()=>{
 const inspect=loadFunction('inspectQueenRegistryIntegrity');
 assert.deepEqual(inspect({families:[{id:'f1',currentQueenId:'q1'}],queens:[{id:'q1',familyId:'f1',status:'current',year:2025},{id:'q0',familyId:'f1',status:'replaced',year:2023}],queenEvents:[{id:'e1',type:'introduced',familyId:'f1',queenId:'q1',date:'2025-05-01'},{id:'e2',type:'replaced',familyId:'f1',queenId:'q0',date:'2025-05-01'}]}),[]);
});

test('schema 6 backup requires queen registry arrays and validates their entries',()=>{
 const validate=loadFunction('validateBackupState');
 const base={meta:{schemaVersion:6},hives:[],families:[],records:[],plantCatalog:[],plantLocations:[],plantObservations:[],plantAIQueue:[],queens:[],queenEvents:[]};
 assert.equal(validate(base),base);
 assert.throws(()=>validate({...base,queens:undefined}),/отсутствует новый раздел: queens/);
 assert.throws(()=>validate({...base,queenEvents:[null]}),/обнаружены повреждённые элементы/);
});
test('snapshot source contains queen registry and queen history',()=>{
 const save=extractFunction('save');
 assert.match(save,/queens:S\.queens,queenEvents:S\.queenEvents/);
});

test('queen replacement keeps previous queen in history and links new queen to family',()=>{
 const apply=loadFunction('applyQueenChange');let n=0;const state={families:[{id:'f1',name:'26-1',hive:'h1',currentQueenId:'q1',queen:{code:'Q1'}}],queens:[{id:'q1',familyId:'f1',code:'Q1',status:'current'}],queenEvents:[]};
 const result=apply(state,{familyId:'f1',code:'Q2',year:'2026',source:'Питомник',notes:'Линия B',date:'2026-06-01'},()=> 'new-'+(++n));
 assert.equal(result.replaced,true);assert.equal(state.queens.find(q=>q.id==='q1').status,'replaced');assert.equal(result.queen.status,'current');assert.equal(state.families[0].currentQueenId,result.queen.id);assert.equal(state.queenEvents[0].type,'replaced');assert.equal(state.queenEvents[0].previousQueenId,'q1');
});
test('queen first registration and metadata edit do not invent event dates',()=>{
 const apply=loadFunction('applyQueenChange');let n=0;const state={families:[{id:'f1',hive:'h1'}],queens:[],queenEvents:[]};
 const first=apply(state,{familyId:'f1',code:'Q1',year:'2025',date:null},()=> 'id-'+(++n));assert.equal(first.replaced,false);assert.equal(state.queenEvents[0].type,'introduced');assert.equal(state.queenEvents[0].date,null);
 const edited=apply(state,{familyId:'f1',queenId:first.queen.id,code:'Q1A',year:'2025',date:null},()=> 'id-'+(++n));assert.equal(edited.queen.code,'Q1A');assert.equal(state.queenEvents[1].type,'note');assert.equal(state.queenEvents[1].date,null);
});

test('queen registry renders chronological event timelines, unknown dates and previous queens safely',()=>{
 const host={innerHTML:''};
 const escapeHtml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const render=loadFunction('renderQueenRegistry',{
  $:id=>id==='queenRegistryList'?host:null,
  S:{
   families:[{id:'f1',name:'Семья 1',hive:'h1',currentQueenId:'q2'}],
   queens:[
    {id:'q1',familyId:'f1',code:'Q-OLD',status:'replaced',createdAt:'2026-05-01T00:00:00Z'},
    {id:'q2',familyId:'f1',code:'Q-NEW',status:'current',year:2026,source:'Питомник',createdAt:'2026-06-01T00:00:00Z'}
   ],
   queenEvents:[
    {id:'e1',type:'legacy_imported',queenId:'q1',familyId:'f1',date:null,createdAt:'2026-05-01T00:00:00Z',notes:'Старая запись <script>alert(1)</script>'},
    {id:'e2',type:'replaced',queenId:'q2',previousQueenId:'q1',familyId:'f1',date:'2026-06-01',createdAt:'2026-06-01T00:00:00Z',notes:'Матка заменена'},
    {id:'e3',type:'note',queenId:'q2',familyId:'f1',date:'2026-09-01',createdAt:'2026-09-01T00:00:00Z',notes:'Осенний осмотр'}
   ]
  },
  safe:escapeHtml,
  hname:id=>'Улей '+id
 });
 render();
 assert.ok(host.innerHTML.indexOf('Зарегистрирована замена')<host.innerHTML.indexOf('Сведения обновлены'),'events must be ordered by their recorded dates');
 assert.match(host.innerHTML,/Предыдущая матка: Q-OLD/);
 assert.match(host.innerHTML,/дата не указана/);
 assert.match(host.innerHTML,/Старая запись &lt;script&gt;/);
 assert.doesNotMatch(host.innerHTML,/<script>alert\(1\)<\/script>/);
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
    equipmentLabels:{bodies:{'body-h1-1':'ААА','body-h2-2':'ААБ'}},
    layouts:{
      h1:{mode:'summer',installedBoxes:[1,2,3],honeyFrames:[[],[]],corpusIds:{1:'body-h1-1',2:'body-h1-2'},boxes:makeBoxes({1:'fam',3:'parent'},{1:[{frameId:'1',labelCode:'ААГ',location:'1',history:[]},{frameId:'2',labelCode:'ААД',location:'1',history:[]}]})},
      h2:{mode:'summer',installedBoxes:[1,2,3],honeyFrames:[[],[]],corpusIds:{1:'body-h2-1',2:'body-h2-2'},boxes:makeBoxes({}, {2:[{frameId:'1',labelCode:'ААЕ',location:'2',history:[]},{frameId:'9',labelCode:'ААЖ',location:'2',history:[]}]})}
    }
  };
}
async function runTransfer(data, save = async()=>true) {
  const deps = {
    S: JSON.parse(JSON.stringify(data)),
    transferringFamilyId:'fam', selectedHiveId:'h1', activeJournalHive:'h1',
    alerts:[], audit:[],
    $: id => ({transferTargetHive:{value:'h2'},transferTargetBox:{value:'2'},familyTransferDlg:{close(){}}}[id] || {value:'',close(){}}),
    alert(message){this.alerts.push(message);}, confirm(){return true;},
    hname:id=>'Улей '+id, today:()=>'2026-11-12',
    logAudit(...args){this.audit.push(args);},
    layoutFor(id){return this.S.layouts[id];},
    profileForHive(){return {schemaVersion:1,id:'farrar-test',name:'Farrar test',status:'ready',family:'farrar',brood:{boxCount:6,framesPerBox:6,boxKeys:['1','2','3','4','5','6']},honey:{boxCount:2,framesPerBox:10,boxKeys:['H1','H2'],installation:'paired'},frame:{heightMm:180},winter:{enabled:true,requiredBroodBoxes:3,allowedBoxKeys:['1','3','4','6'],forbiddenBoxKeys:['2','5']}};},
    validateHiveProfile(){return {ok:true,errors:[]};},
    familyTransferBoxKeys:loadFunction('familyTransferBoxKeys'),
    familyTransferTargets:loadFunction('familyTransferTargets',{familyTransferBoxKeys:loadFunction('familyTransferBoxKeys'),familyTransferWinterKeys:loadFunction('familyTransferWinterKeys')}),
    frameCapacity(){return 6;},
    profileBroodKeys(){return ['1','2','3','4','5','6'];},
    profileHoneyKeys(){return ['H1','H2'];},
    frameArray(layout,key){return key==='H1'?layout.honeyFrames[0]:key==='H2'?layout.honeyFrames[1]:layout.boxes[key].frames;},
    findFamilyBox(id){for(const hive of this.S.hives)for(let n=1;n<=6;n++){const box=this.S.layouts[hive.id]?.boxes[n];if(box?.family===id)return {hiveId:hive.id,box:String(n),data:box,layout:this.S.layouts[hive.id]};}return null;},
    nextFrameId(layout){return String(Math.max(0,...[1,2,3,4,5,6,'H1','H2'].flatMap(k=>(this.frameArray(layout,k)||[]).map(frame=>Number(frame.frameId)||0)))+1);},
    frameLocationName(key){return 'Корпус '+key;},safe:value=>String(value),
    async save(){return save();}, render(){}, showTab(){}
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
  assert.deepEqual(result.S.layouts.h2.boxes[2].frames.map(x=>x.labelCode),['ААГ','ААД'],'physical frame labels follow the frames');
  assert.deepEqual(result.S.layouts.h1.boxes[1].frames.map(x=>x.frameId),['1','9']);
  assert.deepEqual(result.S.layouts.h1.boxes[1].frames.map(x=>x.labelCode),['ААЕ','ААЖ'],'displaced physical frame labels remain with those frames');
  assert.equal(result.S.equipmentLabels.bodies['body-h1-1'],'ААА');
  assert.equal(result.S.equipmentLabels.bodies['body-h2-2'],'ААБ');
  assert.equal(result.S.layouts.h1.corpusIds[1],'body-h1-1');
  assert.equal(result.S.layouts.h2.corpusIds[2],'body-h2-2');
  assert.equal(result.S.layouts.h1.boxes[1].family,'');
  assert.equal(result.S.layouts.h2.boxes[2].family,'fam');
  assert.equal(result.audit[0][0],'family_transferred');
});
test('family transfer restores the original hive and frame state when persistence returns false',async()=>{
 const data=transferFixture(),before=JSON.stringify(data);
 const result=await runTransfer(data,async()=>false);
 assert.equal(JSON.stringify(result.S),before);
 assert.equal(result.S.families[0].hive,'h1');
 assert.equal(result.S.families[0].box,1);
 assert.deepEqual(result.S.layouts.h1.boxes[1].frames.map(frame=>frame.frameId),['1','2']);
 assert.deepEqual(result.S.layouts.h2.boxes[2].frames.map(frame=>frame.frameId),['1','9']);
 assert.equal(result.S.auditLog,undefined);
 assert.match(result.alerts[0],/не удалось сохранить/i);
});
test('family transfer restores the original state when persistence throws',async()=>{
 const data=transferFixture(),before=JSON.stringify(data);
 const result=await runTransfer(data,async()=>{throw new Error('storage exploded')});
 assert.equal(JSON.stringify(result.S),before);
 assert.match(result.alerts[0],/storage exploded/i);
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
  const labels={A:'ААА',B:'ААБ',C:'ААГ',D:'ААД'};
  const make=(id,box)=>({frameId:id,labelCode:labels[id],location:String(box),originBox:String(box),type:'comb',status:'drawn',history:[]});
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
  assert.deepEqual(applied.state.layouts.h1.boxes[3].frames.map(x=>x.labelCode),['ААА','ААБ','ААГ'],'permanent physical codes move with frames');
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


test('profile-driven frame moves support arbitrary keys, capacities and independent honey bodies',()=>{
 const profile={id:'custom-move-v1',schemaVersion:1,status:'ready',name:'Custom move fixture',family:'custom',frame:{heightMm:230},brood:{boxCount:3,framesPerBox:3,boxKeys:['LOW','MID','UP']},honey:{boxCount:1,framesPerBox:4,boxKeys:['SUPER'],installation:'independent'},winter:{enabled:true,requiredBroodBoxes:2,allowedBoxKeys:['LOW','UP'],forbiddenBoxKeys:['MID'],honeyAllowed:false}};
 const make=(id,location)=>({frameId:id,labelCode:'ААА',location,originBox:location,type:'comb',status:'drawn',history:[]});
 const state={meta:{revisionId:'custom-rev-1'},hives:[{id:'custom-hive',number:7,profile}],families:[],records:[],tasks:[],layouts:{'custom-hive':{mode:'summer',installedBoxes:['LOW','MID','UP'],winterOrder:[],honeyBoxInstalled:[true],honeyFrames:[[make('H1','SUPER')]],boxes:{LOW:{family:'',frames:[make('F1','LOW')]},MID:{family:'',frames:[]},UP:{family:'',frames:[]}}}}};
 const plan=loadFunction('planFrameMoves'),apply=loadFunction('applyFrameMovePlan',{planFrameMoves:plan});
 const move=plan(state,[{hiveId:'custom-hive',frameId:'F1',fromBox:'LOW',toBox:'UP'}]);
 assert.equal(move.ok,true,JSON.stringify(move.errors));
 const applied=apply(state,move,'2026-11-13');
 assert.equal(applied.ok,true);
 assert.deepEqual(applied.state.layouts['custom-hive'].boxes.LOW.frames,[]);
 assert.deepEqual(applied.state.layouts['custom-hive'].boxes.UP.frames.map(frame=>frame.frameId),['F1']);
 assert.equal(applied.state.layouts['custom-hive'].honeyFrames[0][0].frameId,'H1');
 assert.equal(applied.state.layouts['custom-hive'].boxes.UP.frames[0].labelCode,'ААА');
 assert.equal(state.layouts['custom-hive'].boxes.LOW.frames[0].location,'LOW');
});
test('profile-driven frame moves enforce configured capacity and winter allowed keys',()=>{
 const profile={id:'custom-move-v1',schemaVersion:1,status:'ready',name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:3,framesPerBox:2,boxKeys:['LOW','MID','UP']},honey:{boxCount:0,framesPerBox:0,boxKeys:[],installation:'independent'},winter:{enabled:true,requiredBroodBoxes:2,allowedBoxKeys:['LOW','UP'],forbiddenBoxKeys:['MID'],honeyAllowed:false}};
 const make=(id,location)=>({frameId:id,location,history:[]});
 const state={meta:{revisionId:'winter-rev'},hives:[{id:'h',profile}],families:[],records:[],tasks:[],layouts:{h:{mode:'summer',installedBoxes:['LOW','MID','UP'],winterOrder:[],honeyBoxInstalled:[],honeyFrames:[],boxes:{LOW:{family:'',frames:[make('A','LOW')]},MID:{family:'',frames:[]},UP:{family:'',frames:[make('B','UP'),make('C','UP')]}}}}};
 const plan=loadFunction('planFrameMoves');
 const overflow=plan(state,[{hiveId:'h',frameId:'A',toBox:'UP'}]);
 assert.ok(overflow.errors.some(error=>error.code==='move_target_over_capacity'));
 state.layouts.h.mode='winter';state.layouts.h.installedBoxes=['LOW','UP'];state.layouts.h.winterOrder=['LOW','UP'];
 assert.ok(plan(state,[{hiveId:'h',frameId:'A',toBox:'MID'}]).errors.some(error=>error.code==='move_target_not_installed'));
});
test('profileId-backed frame moves resolve the selected profile catalog',()=>{
 const profile={id:'catalog-custom-v1',schemaVersion:1,status:'ready',name:'Catalog custom',family:'custom',frame:{heightMm:230},brood:{boxCount:2,framesPerBox:2,boxKeys:['A','B']},honey:{boxCount:0,framesPerBox:0,boxKeys:[],installation:'independent'},winter:{enabled:false}};
 const state={meta:{revisionId:'catalog-rev'},profileCatalog:{'catalog-custom-v1':profile},hives:[{id:'h',profileId:'catalog-custom-v1'}],families:[],records:[],tasks:[],layouts:{h:{mode:'summer',installedBoxes:['A','B'],honeyBoxInstalled:[],honeyFrames:[],boxes:{A:{family:'',frames:[{frameId:'X',location:'A',history:[]}]},B:{family:'',frames:[]}}}}};
 const result=loadFunction('planFrameMoves')(state,[{hiveId:'h',frameId:'X',toBox:'B'}]);
 assert.equal(result.ok,true,JSON.stringify(result.errors));
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


test('AI command marker parser extracts only a valid JSON proposal',()=>{
  const extract=loadFunction('extractAICommandProposal');
  const proposal={schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
  const valid=extract('Перенесу после проверки.'+String.fromCharCode(10)+'[[PASEKA_COMMAND_JSON]]'+JSON.stringify(proposal)+'[[/PASEKA_COMMAND_JSON]]');
  assert.deepEqual(valid.proposal,proposal);
  assert.equal(valid.answer,'Перенесу после проверки.');
  assert.equal(valid.parseError,'');
  assert.equal(extract('Обычный ответ без команды.').proposal,null);
  assert.match(extract('Ответ'+String.fromCharCode(10)+'[[PASEKA_COMMAND_JSON]]{broken}[[/PASEKA_COMMAND_JSON]]').parseError,/разобрать/);
  assert.match(extract('Ответ'+String.fromCharCode(10)+'[[PASEKA_COMMAND_JSON]]{').parseError,/не завершён/);
});

test('AI move preview can be safely revalidated after a chat save changes only revision',()=>{
  const plan=loadFunction('planFrameMoves');
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:plan});
  const revalidate=loadFunction('revalidateAICommandPreview',{validateAICommandProposal:validate});
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:plan});
  const state=frameMoveFixture();
  const proposal={schemaVersion:1,kind:'move_frames',commandId:'chat-save-1',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
  const reviewed=validate(state,proposal);
  assert.equal(reviewed.status,'ready_for_preview');
  state.meta.revisionId='rev-after-chat-save';
  const checked=revalidate(state,proposal,reviewed.plan);
  assert.equal(checked.ok,true);
  assert.equal(checked.plan.expectedRevision,'rev-after-chat-save');
  assert.equal(apply(state,checked.plan,'2026-11-12').ok,true);
});

test('AI move preview is rejected when the frame location changes after review',()=>{
  const plan=loadFunction('planFrameMoves');
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:plan});
  const revalidate=loadFunction('revalidateAICommandPreview',{validateAICommandProposal:validate});
  const state=frameMoveFixture();
  const proposal={schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
  const reviewed=validate(state,proposal);
  state.layouts.h1.boxes[1].frames[0].location='2';
  const checked=revalidate(state,proposal,reviewed.plan);
  assert.equal(checked.ok,false);
  assert.notEqual(checked.status,'ready_for_preview');
});

test('AI frame move cancellation leaves the preview pending and changes nothing',async()=>{
 const state=frameMoveFixture();
 const planMoves=loadFunction('planFrameMoves');
 const validate=loadFunction('validateAICommandProposal',{planFrameMoves:planMoves});
 const fingerprint=loadFunction('aiCommandContextFingerprint',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const proposal={schemaVersion:1,kind:'move_frames',commandId:'cancel-1',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
 const preview=validate(state,proposal);
 assert.equal(preview.status,'ready_for_preview');
 state.aiMessages=[{commandProposal:proposal,commandContextFingerprint:fingerprint(state),commandStatus:'pending',commandPlan:preview.plan}];
 const before=JSON.stringify(state);
 let saves=0,renders=0;
 const deps={S:state,confirm:()=>false,aiCommandContextIsCurrent:(s,m)=>m.commandContextFingerprint===fingerprint(s),frameLocationName:box=>'корпус '+box,save:async()=>{saves++;return true},renderAIChat:()=>{renders++}};
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(JSON.stringify(deps.S),before);
 assert.equal(deps.S.aiMessages[0].commandStatus,'pending');
 assert.equal(saves,0,'cancellation must not persist');
 assert.equal(renders,0,'cancellation must not report a result');
});
test('AI frame move rejects a stale preview before asking for confirmation or mutating data',async()=>{
 const state=frameMoveFixture();
 const planMoves=loadFunction('planFrameMoves');
 const validate=loadFunction('validateAICommandProposal',{planFrameMoves:planMoves});
 const fingerprint=loadFunction('aiCommandContextFingerprint',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const proposal={schemaVersion:1,kind:'move_frames',commandId:'stale-1',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
 const preview=validate(state,proposal);
 assert.equal(preview.status,'ready_for_preview');
 state.aiMessages=[{commandProposal:proposal,commandContextFingerprint:fingerprint(state),commandStatus:'pending',commandPlan:preview.plan}];
 state.layouts.h1.boxes[1].frames[0].type='changed-after-preview';
 let confirmations=0,saves=0,renders=0;
 const deps={S:state,confirm:()=>{confirmations++;return true},aiCommandContextIsCurrent:(s,m)=>m.commandContextFingerprint===fingerprint(s),save:async()=>{saves++;return true},renderAIChat:()=>{renders++}};
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(confirmations,0,'stale plan must not reach confirmation');
 assert.equal(deps.S.aiMessages[0].commandStatus,'stale');
 assert.equal(deps.S.layouts.h1.boxes[1].frames.some(frame=>frame.frameId==='A'),true);
 assert.equal(deps.S.layouts.h1.boxes[3].frames.length,0);
 assert.equal(deps.S.auditLog,undefined);
 assert.equal(saves,1,'stale status is persisted for the user');
 assert.equal(renders,1);
});
test('AI frame move rejects a tampered reviewed plan after confirmation without applying it',async()=>{
 const state=frameMoveFixture();
 const planMoves=loadFunction('planFrameMoves');
 const validate=loadFunction('validateAICommandProposal',{planFrameMoves:planMoves});
 const fingerprint=loadFunction('aiCommandContextFingerprint',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const proposal={schemaVersion:1,kind:'move_frames',commandId:'tamper-1',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
 const preview=validate(state,proposal);
 assert.equal(preview.status,'ready_for_preview');
 state.aiMessages=[{commandProposal:proposal,commandContextFingerprint:fingerprint(state),commandStatus:'pending',commandPlan:{...preview.plan,moves:preview.plan.moves.map(move=>({...move,toBox:'2'}))}}];
 let confirmations=0,saves=0,renders=0;
 const deps={
  S:state,confirm:()=>{confirmations++;return true},
  aiCommandContextIsCurrent:(s,m)=>m.commandContextFingerprint===fingerprint(s),
  revalidateAICommandPreview:loadFunction('revalidateAICommandPreview',{validateAICommandProposal:validate}),
  applyFrameMovePlan:loadFunction('applyFrameMovePlan',{planFrameMoves:planMoves}),
  frameLocationName:box=>'корпус '+box,today:()=>'2026-11-12',
  save:async()=>{saves++;return true},renderAIChat:()=>{renders++}
 };
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(confirmations,1,'the reviewed action reaches the explicit confirmation gate');
 assert.equal(deps.S.aiMessages[0].commandStatus,'stale');
 assert.equal(deps.S.layouts.h1.boxes[1].frames.some(frame=>frame.frameId==='A'),true);
 assert.equal(deps.S.layouts.h1.boxes[2].frames.some(frame=>frame.frameId==='A'),false);
 assert.equal(deps.S.layouts.h1.boxes[3].frames.length,0);
 assert.equal(saves,1,'the rejected preview status is saved');
 assert.equal(renders,1);
});
test('AI frame move completes the full preview-confirmation-persistence flow atomically',async()=>{
 const state=frameMoveFixture();
 const planMoves=loadFunction('planFrameMoves');
 const validate=loadFunction('validateAICommandProposal',{planFrameMoves:planMoves});
 const revalidate=loadFunction('revalidateAICommandPreview',{validateAICommandProposal:validate});
 const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:planMoves});
 const fingerprint=loadFunction('aiCommandContextFingerprint',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const isCurrent=loadFunction('aiCommandContextIsCurrent',{aiCommandContextFingerprint:fingerprint});
 const proposal={schemaVersion:1,kind:'move_frames',commandId:'integration-1',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
 const preview=validate(state,proposal);
 assert.equal(preview.status,'ready_for_preview');
 const message={role:'assistant',content:'План подготовлен.',commandProposal:proposal,commandContextFingerprint:fingerprint(state),commandStatus:'pending',commandPlan:preview.plan};
 state.aiMessages=[message];
 let persistedSnapshot='',saveCalls=0,renderCalls=0;
 const deps={
  S:state,confirm:()=>true,aiCommandContextIsCurrent:isCurrent,
  revalidateAICommandPreview:revalidate,applyFrameMovePlan:apply,
  frameLocationName:box=>'корпус '+box,today:()=>'2026-11-12',
  save:async()=>{saveCalls++;persistedSnapshot=JSON.stringify(deps.S);return true},
  renderAIChat:()=>{renderCalls++}
 };
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(saveCalls,1,'the confirmed operation is persisted once');
 assert.equal(renderCalls,1,'the chat is refreshed after the result');
 assert.equal(deps.S.aiMessages[0].commandStatus,'applied');
 assert.ok(deps.S.aiMessages[0].appliedAt);
 assert.deepEqual(deps.S.layouts.h1.boxes[1].frames.map(frame=>frame.frameId),['B']);
 assert.deepEqual(deps.S.layouts.h1.boxes[3].frames.map(frame=>frame.frameId),['A']);
 assert.equal(deps.S.layouts.h1.boxes[3].frames[0].location,'3');
 assert.equal(deps.S.layouts.h1.boxes[3].frames[0].history.at(-1).action,'move');
 assert.equal(deps.S.auditLog.at(-1).type,'frames_moved_batch');
 const saved=JSON.parse(persistedSnapshot);
 assert.equal(saved.aiMessages[0].commandStatus,'applied');
 assert.deepEqual(saved.layouts.h1.boxes[3].frames.map(frame=>frame.frameId),['A']);
});
test('AI assistant has a dedicated central navigation control and a themed workspace',()=>{
  assert.match(html,/<button data-tab="ai" class="nav-ai-button"[^>]*aria-label="Открыть ИИ-помощника"/);
  assert.match(html,/class="ai-hero"/);
  assert.match(html,/class="ai-hero-orb"/);
  assert.match(html,/class="card ai-console-card"/);
  assert.ok(html.includes('main>nav[aria-label="Основные разделы"]{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 66px'));
});

test('inline application JavaScript remains syntactically valid',()=>{
  const start=html.indexOf('<script>'),end=html.indexOf('</script>',start);
  assert.ok(start>=0&&end>start);
  assert.doesNotThrow(()=>new Function(html.slice(start+8,end)));
});


test('AI move preview becomes stale when a source or target family assignment changes',()=>{
  const plan=loadFunction('planFrameMoves');
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:plan});
  const revalidate=loadFunction('revalidateAICommandPreview',{validateAICommandProposal:validate});
  const state=frameMoveFixture();
  state.layouts.h1.boxes[1].family='family-a';
  state.layouts.h1.boxes[3].family='family-b';
  const proposal={schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
  const reviewed=validate(state,proposal);
  assert.equal(reviewed.status,'ready_for_preview');
  state.layouts.h1.boxes[3].family='family-c';
  state.meta.revisionId='rev-family-changed';
  const checked=revalidate(state,proposal,reviewed.plan);
  assert.equal(checked.ok,false);
  assert.equal(checked.status,'stale');
});

test('batch frame move compares the executable plan with its reviewed preview',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:plan});
  const state=frameMoveFixture(),before=JSON.stringify(state);
  const prepared=plan(state,[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]);
  prepared.moves[0].fromPosition=99;
  prepared.preview[0].fromPosition=99;
  const result=apply(state,prepared,'2026-11-12');
  assert.equal(result.ok,false);
  assert.equal(result.errors[0].code,'move_plan_changed');
  assert.equal(JSON.stringify(state),before);
});


test('hybrid workspace exposes ten clear navigation destinations and home AI entry points',()=>{
  const navStart=html.indexOf('<nav aria-label="Основные разделы">');
  const navEnd=html.indexOf('</nav>',navStart);
  assert.ok(navStart>=0&&navEnd>navStart,'accessible main navigation exists');
  const nav=html.slice(navStart,navEnd);
  assert.equal((nav.match(/data-tab=/g)||[]).length,10);
  for(const label of ['Обзор','Ульи','Лёток','Журнал','Медоносы','Клещ','Инцидент','План','Ещё'])assert.ok(nav.includes('>'+label+'</button>'));
  assert.match(nav,/<span class="nav-ai-label">ИИ<\/span>/);
  assert.ok(html.includes('id="homeAIQuestion"'));
  assert.ok(html.includes('class="ai-capabilities"'));
  assert.ok(html.includes('class="ai-prompt-chips"'));
});

test('hands-free voice parser requires the wake phrase and separates confirmation controls from questions',()=>{
 const parse=new Function(voiceParserSource+'\nreturn parseApiaryVoiceCommand;')();
 assert.deepEqual(parse('Пасека, слушай'),{type:'wake'});
 assert.deepEqual(parse('Пасека, слушай, поменяй местами рамки 1 и 2'),{type:'question',text:'поменяй местами рамки 1 и 2'});
 assert.deepEqual(parse('Пасека слушай: поменяй местами рамки 1 и 2'),{type:'question',text:'поменяй местами рамки 1 и 2'});
 assert.deepEqual(parse('СЛУШАЙ, запиши наблюдение',true),{type:'question',text:'запиши наблюдение'});
 assert.deepEqual(parse('слушай подтверждаю'),{type:'confirm'});
 assert.deepEqual(parse('отмени',true),{type:'cancel'});
 assert.deepEqual(parse('прочитай ответ',true),{type:'repeat'});
 assert.deepEqual(parse('подтверждаю'),{type:'ignore'});
 assert.deepEqual(parse('заверши голосовой режим'),{type:'stop'});
 assert.deepEqual(parse('пчёлы активно летают'),{type:'ignore'});
});
test('AI hands-free voice UI explains foreground session and exposes live status',()=>{
 assert.match(html,/id="aiVoiceSessionButton"[^>]*onclick="toggleApiaryVoiceSession\(\)"/);
 assert.match(html,/id="apiaryVoiceStatus"[^>]*aria-live="polite"/);
 assert.match(html,/Экран приложения должен оставаться открытым/);
 assert.match(html,/function stopApiaryVoiceSession\(\)/);
 assert.match(html,/function speakApiaryVoice\(value\)/);
});
test('AI command confirmation can be explicitly confirmed by voice without removing the visual confirmation flow',()=>{
 assert.match(html,/async function confirmAICommand\(index,voiceConfirmed=false\)/);
 assert.equal((html.match(/if\(!voiceConfirmed&&!confirm\(/g)||[]).length,2);
 assert.match(html,/handleApiaryVoiceTranscript\(transcript\)/);
});
test('home AI entry copies the chosen prompt into chat without sending it',()=>{
  let activeTab='',focused=false;
  const nodes={homeAIQuestion:{value:'  Проверь состояние семей  '},aiQuestion:{value:'',focus(){focused=true}}};
  const ask=loadFunction('askAIFromHome',{$:id=>nodes[id],showTab:tab=>{activeTab=tab}});
  ask();
  assert.equal(activeTab,'ai');
  assert.equal(nodes.aiQuestion.value,'Проверь состояние семей');
  assert.equal(focused,true);
  const helper=loadFunction('useAIPrompt',{$:id=>nodes[id]});
  helper('Составь план работ');
  assert.equal(nodes.aiQuestion.value,'Составь план работ');
});


test('voice dictation appends Russian transcript to the draft without sending it',()=>{
  let started=false,alerts=[];
  const field={value:'Проверь семьи',focus(){}};
  function FakeRecognition(){this.start=()=>{started=true;this.onresult({results:[[{transcript:'и отводки'}]]});this.onend()}}
  const button={disabled:false,textContent:'🎙 Диктовать'};
  const recognitionState={aiBusy:false,aiRecognition:null};
  const dictate=loadFunction('startAIVoiceInput',{
    window:{SpeechRecognition:FakeRecognition},
    confirm:()=>true,
    alert:message=>alerts.push(message),
    $:id=>id==='aiQuestion'?field:null,
    ...recognitionState
  });
  dictate(button);
  assert.equal(started,true);
  assert.equal(field.value,'Проверь семьи и отводки');
  assert.equal(button.disabled,false);
  assert.equal(button.textContent,'🎙 Диктовать');
  assert.deepEqual(alerts,[]);
});

test('voice dictation explains unsupported browsers and does not start silently',()=>{
  let warning='',confirmed=false;
  const dictate=loadFunction('startAIVoiceInput',{
    window:{},aiBusy:false,aiRecognition:null,
    confirm:()=>{confirmed=true;return true},
    alert:message=>{warning=message}
  });
  dictate({disabled:false,textContent:'🎙 Диктовать'});
  assert.match(warning,/нет встроенного распознавания речи/);
  assert.equal(confirmed,false);
});

test('AI panel discloses speech-recognition privacy and keeps explicit send control',()=>{
  assert.ok(html.includes('id="aiVoiceButton"'));
  assert.ok(html.includes('аудио может обрабатываться внешним сервисом'));
  assert.ok(html.includes('id="aiSendButton"'));
});


test('inspection parser recognizes common Russian beekeeping count synonyms and preserves evidence',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Осмотр: пчёлами занято 5 рамок, расплод на 3 рамках, свободной суши 2 рамки.');
  assert.deepEqual(result.fields,{occupancy:5,broodFrames:3,freeDrawn:2});
  assert.equal(result.fieldCount,3);
  for(const key of Object.keys(result.fields))assert.match(result.evidence[key],/рам/);
  const alternate=parse('Осмотр: 4 рамки обсижены пчёлами, 2 рамки с расплодом.');
  assert.equal(alternate.fields.occupancy,4);
  assert.equal(alternate.fields.broodFrames,2);
});

test('inspection parser handles explicit queen, eggs, brood and queen-cell findings',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Проверил улей: матка не обнаружена, свежие яйца есть, сплошной ровный расплод, роевых маточников нет.');
  assert.deepEqual(result.fields,{queen:'eggs',eggs:'yes',broodPattern:'solid'});
  const negative=parse('Осмотрел семью: матку не видел, свежих яиц нет, расплода нет, маточников нет, роевых признаков нет.');
  assert.deepEqual(negative.fields,{queen:'notSeen',eggs:'no',broodPattern:'none',queenCells:'none',swarmSigns:'none'});
});

test('inspection parser leaves hedged and approximate observations unfilled',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Возможно, занято 5 рамок; кажется, матка есть; примерно 3 рамки с расплодом.');
  assert.deepEqual(result.fields,{});
  assert.equal(result.fieldCount,0);
  const uncertain=parse('Осмотрел семью, возможно матка обнаружена.');
  assert.equal(uncertain.type,'Осмотр');
  assert.equal(uncertain.fields.queen,undefined);
});

test('inspection parser does not infer absent values or accept counts outside 0–6',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Осмотр: занято 7 рамок, расплод на 10 рамках, свободных отстроенных рамок — 8.');
  assert.deepEqual(result.fields,{});
  assert.equal(result.fieldCount,0);
  const sparse=parse('Осмотрел семью. Состояние матки и расплода не оценивал.');
  assert.deepEqual(sparse.fields,{});
  assert.equal(sparse.type,'Осмотр');
});

test('inspection parser recognizes queen cells by type without confusing them with swarm signs',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Осмотр: обнаружены свищевые маточники, несколько признаков роевого состояния.');
  assert.deepEqual(result.fields,{queenCells:'emergency',swarmSigns:'several'});
});

test('inspection parser handles colloquial frame counts and shortened beekeeping wording',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Осмотр: пчёлы на 5 рамках; расплода на 3-х рамках; суши свободной — 2.');
  assert.deepEqual(result.fields,{occupancy:5,broodFrames:3,freeDrawn:2});
  assert.equal(result.fieldCount,3);
  const alternate=parse('Пчёлами занято 4 рамки, 2 рамки обсижены пчёлами.');
  assert.equal(alternate.fields.occupancy,undefined);
  const common=parse('5 рамок обсижены пчёлами; расплода 3 рамки.');
  assert.equal(common.fields.occupancy,5);
  assert.equal(common.fields.broodFrames,3);
});

test('inspection parser scopes negatives and positives to separate clauses',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Осмотр: матки не видел, яйца есть; расплода нет, но свежие яйца обнаружены; маточников нет, но есть один роевой признак.');
  assert.equal(result.fields.queen,'eggs');
  assert.equal(result.fields.eggs,'yes');
  assert.equal(result.fields.broodPattern,'none');
  assert.equal(result.fields.queenCells,'none');
  assert.equal(result.fields.swarmSigns,'one');
  const opposite=parse('Роевых признаков нет, маточники обнаружены.');
  assert.equal(opposite.fields.swarmSigns,'none');
  assert.equal(opposite.fields.queenCells,'unknown');
});

test('inspection parser rejects contradictory values for the same field',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Матка не найдена, но матка есть; расплода нет, расплод ровный; занято 5 рамок, затем 4 рамки обсижены.');
  assert.equal(result.fields.queen,undefined);
  assert.equal(result.fields.broodPattern,undefined);
  assert.equal(result.fields.occupancy,undefined);
  assert.equal(result.fieldCount,0);
});

test('inspection parser ignores uncertainty only in the clause where it occurs',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Возможно, занято 5 рамок; матка обнаружена; свежие яйца есть.');
  assert.deepEqual(result.fields,{queen:'seen',eggs:'yes'});
  assert.equal(result.fieldCount,2);
  const allUncertain=parse('Пчёлы занимают около 5 рамок; матка вроде бы есть.');
  assert.deepEqual(allUncertain.fields,{});
});

test('inspection parser accepts only explicit count values within physical frame capacity',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  for(const value of [0,1,2,3,4,5,6]){
    const result=parse('Осмотр: занято '+value+' рамок.');
    assert.equal(result.fields.occupancy,value);
  }
  const invalid=parse('Осмотр: занято 7 рамок.');
  assert.equal(invalid.fields.occupancy,undefined);
});

test('journal draft from AI workspace maps explicit inspection values and keeps an editable source note',()=>{
  const alerts=[],tabs=[],nodes={
    aiJournalHiveSelect:{value:'hive-1'},
    aiJournalDraftInput:{value:' Осмотрел семью: матка обнаружена, свежие яйца есть, пчёлами занято 5 рамок. '},
    rtype:{value:''},rtext:{value:''},recordTitle:{textContent:''},
    roccupancy:{value:''},rbrood:{value:''},rdrawn:{value:''},
    rqueen:{value:''},reggs:{value:''},rbroodPattern:{value:''},rqueenCells:{value:''},rswarmSigns:{value:''},
    aiJournalExtractNotice:{textContent:'',style:{display:'none'}}
  };
  const state={hives:[{id:'hive-1'}],records:[]};
  let opened=false,toggled=false;
  const prepare=loadFunction('prepareJournalDraftFromAI',{
    S:state,activeJournalHive:'',
    $:id=>nodes[id]||{value:''},
    alert:message=>alerts.push(message),
    showTab:tab=>tabs.push(tab),
    newRecord:()=>{opened=true},
    toggleOccupancy:()=>{toggled=true},
    extractInspectionFieldsFromText:loadFunction('extractInspectionFieldsFromText')
  });
  prepare();
  assert.equal(opened,true);
  assert.equal(toggled,true);
  assert.deepEqual(tabs,['journal']);
  assert.equal(nodes.rtype.value,'Осмотр');
  assert.equal(nodes.roccupancy.value,'5');
  assert.equal(nodes.rqueen.value,'seen');
  assert.equal(nodes.reggs.value,'yes');
  assert.equal(nodes.rtext.value,'Осмотрел семью: матка обнаружена, свежие яйца есть, пчёлами занято 5 рамок.');
  assert.match(nodes.aiJournalExtractNotice.textContent,/заполнено полей 3/);
  assert.equal(nodes.aiJournalExtractNotice.style.display,'block');
  assert.equal(nodes.recordTitle.textContent,'Черновик записи · проверь поля');
  assert.equal(state.records.length,0);
  assert.equal(alerts.length,0);
});

test('journal draft refuses to guess a hive when none is selected',()=>{
  const alerts=[];let opened=0;
  const nodes={aiJournalHiveSelect:{value:''},aiJournalDraftInput:{value:'Осмотрел семью'}};
  const prepare=loadFunction('prepareJournalDraftFromAI',{
    S:{hives:[{id:'hive-1'},{id:'hive-2'}],records:[]},activeJournalHive:'hive-2',
    $:id=>nodes[id]||{value:''},alert:message=>alerts.push(message),
    showTab:()=>{},newRecord:()=>opened++,toggleOccupancy:()=>{}
  });
  prepare();
  assert.equal(opened,0);
  assert.match(alerts[0],/Выбери улей/);
});

test('journal draft refuses empty descriptions and missing hives without opening a record',()=>{
  const alerts=[];
  let opened=0;
  const nodes={aiJournalDraftInput:{value:'   '}};
  const prepare=loadFunction('prepareJournalDraftFromAI',{
    S:{hives:[],records:[]},activeJournalHive:'',
    $:id=>nodes[id]||{value:''},
    alert:message=>alerts.push(message),
    showTab:()=>{},newRecord:()=>opened++,toggleOccupancy:()=>{}
  });
  prepare();
  assert.equal(opened,0);
  assert.match(alerts[0],/опиши наблюдение/);
  nodes.aiJournalDraftInput.value='Осмотр';
  prepare();
  assert.equal(opened,0);
  assert.match(alerts[1],/добавь улей/);
});


test('confirmed AI frame move rolls back the in-memory draft when persistence fails',async()=>{
  const message={commandStatus:'pending',commandProposal:{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',toBox:'3'}]},commandPlan:{moves:[{frameId:'A',fromBox:'1',toBox:'3'}]}};
  const state={aiMessages:[message],meta:{revisionId:'rev-1'}};
  const deps={
    S:state,confirm:()=>true,aiCommandContextIsCurrent:()=>true,
    revalidateAICommandPreview:()=>({ok:true,plan:{moves:[{frameId:'A'}]}}),
    applyFrameMovePlan:()=>({ok:true,state:{aiMessages:[message],changed:true,meta:{revisionId:'rev-2'}},moves:[]}),
    frameLocationName:box=>box,today:()=> '2026-11-12',
    save:async()=>{deps.S.meta.saveError='Конфликт сохранения';return false},renderAIChat:()=>{}
  };
  const confirmMove=loadFunction('confirmAICommand',deps);
  await confirmMove(0);
  assert.equal(deps.S,state,'the original in-memory state must be restored');
  assert.equal(deps.S.changed,undefined);
  assert.equal(deps.S.meta.saveError,'Конфликт сохранения');
  assert.equal(message.commandStatus,'save_failed');
  assert.match(message.commandError,/Операция отменена в текущей модели/);
  await confirmMove(0);
  assert.equal(message.commandStatus,'save_failed','a failed command must not be confirmed again');
});

test('confirmed AI frame move is marked applied only after persistence succeeds',async()=>{
  const message={commandStatus:'pending',commandProposal:{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',toBox:'3'}]},commandPlan:{moves:[{frameId:'A',fromBox:'1',toBox:'3'}]}};
  const confirmMove=loadFunction('confirmAICommand',{
    S:{aiMessages:[message]},confirm:()=>true,aiCommandContextIsCurrent:()=>true,
    revalidateAICommandPreview:()=>({ok:true,plan:{moves:[{frameId:'A'}]}}),
    applyFrameMovePlan:()=>({ok:true,state:{aiMessages:[message]},moves:[]}),
    frameLocationName:box=>box,today:()=> '2026-11-12',
    save:async()=>true,renderAIChat:()=>{}
  });
  await confirmMove(0);
  assert.equal(message.commandStatus,'applied');
  assert.ok(message.appliedAt);
});


test('batch frame move never treats winter-forbidden boxes as installed even in malformed winter order',()=>{
  const plan=loadFunction('planFrameMoves');
  const state=frameMoveFixture();
  state.layouts.h1.mode='winter';
  state.layouts.h1.winterOrder=[1,2,3];
  state.layouts.h1.installedBoxes=[1,2,3];
  const toForbidden=plan(state,[{hiveId:'h1',frameId:'A',toBox:'2'}]);
  assert.ok(toForbidden.errors.some(error=>error.code==='move_target_not_installed'));
  const fromForbidden=plan(state,[{hiveId:'h1',frameId:'C',fromBox:'2',toBox:'1'}]);
  assert.ok(fromForbidden.errors.some(error=>error.code==='move_source_not_installed'));
});

test('journal draft validator accepts a complete and correctly linked inspection',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[{id:'f1',hive:'h1'}],records:[]};
 const result=validate({id:'r1',date:'2024-02-29',type:'Осмотр',hive:'h1',family:'f1',occupancy:5,broodFrames:3,freeDrawn:1},state);
 assert.equal(result.ok,true);
 assert.deepEqual(result.errors,[]);
});

test('journal draft validator rejects impossible calendar dates and unsupported record types',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[],records:[]};
 const result=validate({id:'r1',date:'2026-02-30',type:'Неизвестный тип',hive:'h1',family:''},state);
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(error=>error.code==='journal_invalid_date'));
 assert.ok(result.errors.some(error=>error.code==='journal_invalid_type'));
});

test('journal draft validator rejects missing hives and cross-hive family links',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'},{id:'h2'}],families:[{id:'f1',hive:'h1'}],records:[]};
 const result=validate({id:'r1',date:'2026-11-12',type:'Заметка',hive:'h2',family:'f1'},state);
 assert.ok(result.errors.some(error=>error.code==='journal_family_mismatch'));
 const missing=validate({id:'r2',date:'2026-11-12',type:'Заметка',hive:'missing',family:''},state);
 assert.ok(missing.errors.some(error=>error.code==='journal_hive_missing'));
});

test('journal draft validator accepts an archived family link only while editing its original record',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[],records:[]};
 const archived={id:'r1',family:'old-family',familySnapshotAtTime:{id:'old-family',name:'Архивная семья'}};
 const draft={id:'r1',date:'2026-11-12',type:'Заметка',hive:'h1',family:'old-family'};
 assert.equal(validate(draft,state,archived).ok,true);
 assert.ok(validate({...draft,id:'r2'},state,null).errors.some(error=>error.code==='journal_family_mismatch'));
});

test('journal draft validator rejects duplicate record identifiers',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[],records:[{id:'existing'}]};
 const result=validate({id:'existing',date:'2026-11-12',type:'Заметка',hive:'h1',family:''},state);
 assert.ok(result.errors.some(error=>error.code==='journal_duplicate_id'));
 assert.equal(validate({id:'existing',date:'2026-11-12',type:'Заметка',hive:'h1',family:''},state,state.records[0]).ok,true);
});

test('journal inspection metrics must be whole numbers within the six-frame capacity',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[],records:[]};
 const result=validate({id:'r1',date:'2026-11-12',type:'Осмотр',hive:'h1',family:'',occupancy:6.5,broodFrames:-1,freeDrawn:7},state);
 assert.equal(result.errors.filter(error=>error.code==='journal_invalid_frame_count').length,3);
});

test('journal treatment follow-up date is validated as a real date',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[],records:[]};
 const result=validate({id:'r1',date:'2026-11-12',type:'Обработка',hive:'h1',family:'',treatmentCheck:'2026-02-30'},state);
 assert.ok(result.errors.some(error=>error.code==='journal_invalid_treatment_check_date'));
 assert.equal(validate({id:'r2',date:'2026-11-12',type:'Обработка',hive:'h1',family:'',treatmentCheck:'2024-02-29'},state).ok,true);
});

test('task draft validator accepts a valid task and rejects impossible dates, missing hives and invalid types',()=>{
 const validate=loadFunction('validateTaskDraft');
 const state={hives:[{id:'h1'}],tasks:[]};
 assert.equal(validate({id:'t1',hive:'h1',type:'Осмотр',date:'2024-02-29',note:'Проверить'},state).ok,true);
 const bad=validate({id:'t2',hive:'missing',type:'Неизвестно',date:'2026-02-30',note:'x'},state);
 for(const code of ['task_invalid_type','task_invalid_date','task_hive_missing'])assert.ok(bad.errors.some(error=>error.code===code));
});

test('task draft validator prevents duplicate IDs and oversized notes',()=>{
 const validate=loadFunction('validateTaskDraft');
 const state={hives:[{id:'h1'}],tasks:[{id:'existing'}]};
 const bad=validate({id:'existing',hive:'h1',type:'Другое',date:'2026-11-12',note:'x'.repeat(3001)},state);
 assert.ok(bad.errors.some(error=>error.code==='task_duplicate_id'));
 assert.ok(bad.errors.some(error=>error.code==='task_invalid_note'));
 assert.equal(validate({id:'existing',hive:'h1',type:'Другое',date:'2026-11-12',note:'ok'},state,state.tasks[0]).ok,true);
});

test('task completion validator prevents closing a task twice or without its hive',()=>{
 const validate=loadFunction('validateTaskCompletion');
 const state={hives:[{id:'h1'}],tasks:[{id:'t1',hive:'h1',type:'Осмотр',status:'pending'}],records:[]};
 assert.equal(validate(state,'t1','2026-11-12','r1').ok,true);
 state.records.push({id:'r1',taskId:'t1'});
 assert.ok(validate(state,'t1','2026-11-12','r2').errors.some(error=>error.code==='task_already_recorded'));
 state.tasks[0].status='done';state.records=[];
 assert.ok(validate(state,'t1','2026-11-12','r3').errors.some(error=>error.code==='task_not_active'));
 state.tasks[0].status='pending';state.tasks[0].hive='missing';
 assert.ok(validate(state,'t1','2026-11-12','r4').errors.some(error=>error.code==='task_hive_missing'));
});

test('task completion validator rejects invalid dates and duplicate journal record IDs',()=>{
 const validate=loadFunction('validateTaskCompletion');
 const state={hives:[{id:'h1'}],tasks:[{id:'t1',hive:'h1',type:'Осмотр',status:'pending'}],records:[{id:'taken'}]};
 const result=validate(state,'t1','2026-02-30','taken');
 assert.ok(result.errors.some(error=>error.code==='task_completion_invalid_date'));
 assert.ok(result.errors.some(error=>error.code==='task_completion_duplicate_record'));
});

test('completeTask rolls back task, journal and audit changes when persistence fails',async()=>{
 const task={id:'t1',hive:'h1',type:'Осмотр',status:'pending',note:'Осмотр'};
 const state={hives:[{id:'h1'}],tasks:[task],records:[],auditLog:[],snapshots:[],meta:{revisionId:'rev-old'}};
 let renders=0;
 const complete=loadFunction('completeTask',{
  S:state,uid:()=> 'record-1',today:()=> '2026-11-12',
  validateTaskCompletion:loadFunction('validateTaskCompletion'),
  logAudit:(type,details)=>state.auditLog.push({type,...details}),
  save:async()=>{state.meta.saveError='Не сохранено';return false},
  render:()=>{renders++},alert:()=>{}
 });
 const result=await complete('t1');
 assert.equal(result,false);
 assert.equal(task.status,'pending');
 assert.equal(task.completedRecordId,undefined);
 assert.equal(state.records.length,0);
 assert.equal(state.auditLog.length,0);
 assert.equal(state.snapshots.length,0);
 assert.equal(state.meta.saveError,'Не сохранено');
 assert.equal(renders,1);
});

test('completeTask persists one linked journal record and blocks a repeated completion',async()=>{
 const task={id:'t1',hive:'h1',type:'Осмотр',status:'pending',note:'Осмотр'};
 const state={hives:[{id:'h1'}],tasks:[task],records:[],auditLog:[],snapshots:[],meta:{}};
 let saves=0;
 const complete=loadFunction('completeTask',{
  S:state,uid:()=> 'record-1',today:()=> '2026-11-12',
  validateTaskCompletion:loadFunction('validateTaskCompletion'),
  logAudit:(type,details)=>state.auditLog.push({type,...details}),
  save:async()=>{saves++;return true},render:()=>{},alert:()=>{}
 });
 assert.equal(await complete('t1'),true);
 assert.equal(task.status,'done');
 assert.equal(task.completedRecordId,'record-1');
 assert.equal(state.records.length,1);
 assert.equal(state.records[0].taskId,'t1');
 assert.equal(state.auditLog.length,1);
 await complete('t1');
 assert.equal(saves,1);
 assert.equal(state.records.length,1);
});

test('AI task planner requires real source records belonging to the selected hive',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр',text:'Матка не обнаружена'}],tasks:[]};
 const base={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Проверка матки',date:null,note:'Провести повторную проверку матки.',rationale:'В записи осмотра указано, что матка не обнаружена.',sourceRecordIds:['r1']}]};
 const good=validate(state,base);
 assert.equal(good.status,'ready_for_preview');
 assert.equal(good.plan.suggestions[0].date,null);
 assert.equal(good.plan.suggestions[0].evidence[0].id,'r1');
 const fabricated=structuredClone(base);fabricated.suggestions[0].sourceRecordIds=['invented'];
 assert.equal(validate(state,fabricated).errors[0].code,'ai_task_evidence_not_found_or_mismatched');
 const wrongHive=structuredClone(base);wrongHive.suggestions[0].hiveId='h2';
 assert.equal(validate(state,wrongHive).errors[0].code,'ai_task_hive_missing');
});
test('AI task planner rejects invalid dates and duplicate active or repeated suggestions',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const base={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Осмотр',date:'2026-02-30',note:'Повторный осмотр.',rationale:'Основание из журнала.',sourceRecordIds:['r1']}]};
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'}],tasks:[]};
 assert.equal(validate(state,base).errors[0].code,'ai_task_invalid_date');
 const duplicate={...base,suggestions:[{...base.suggestions[0],date:null},{...base.suggestions[0],date:null}]};
 assert.equal(validate(state,duplicate).errors[0].code,'ai_task_duplicate_in_proposal');
 const active={...state,tasks:[{hive:'h1',type:'Осмотр',status:'pending'}]};
 assert.equal(validate(active,{...duplicate,suggestions:[{...duplicate.suggestions[0],date:null}]}).errors[0].code,'ai_task_duplicate_active');
});
test('AI task preview becomes stale when its source journal record changes',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const revalidate=loadFunction('revalidateAITaskSuggestionPreview',{validateAITaskSuggestionProposal:validate,aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр',text:'Исходное наблюдение'}],tasks:[]};
 const proposal={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Проверка матки',date:null,note:'Проверить.',rationale:'По записи.',sourceRecordIds:['r1']}]};
 const plan=validate(state,proposal).plan;
 assert.equal(revalidate(state,proposal,plan).ok,true);
 state.records[0].text='Изменённое наблюдение';
 assert.equal(revalidate(state,proposal,plan).status,'stale');
});
test('AI task suggestions are not added until the explicit draft-apply step',()=>{
 const validateDraft=loadFunction('validateTaskDraft');
 const stable=loadFunction('aiStableSnapshot');
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:stable});
 const revalidate=loadFunction('revalidateAITaskSuggestionPreview',{validateAITaskSuggestionProposal:validate});
 const apply=loadFunction('applyAITaskSuggestionsToDraft',{validateTaskDraft:validateDraft,revalidateAITaskSuggestionPreview:revalidate});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'}],tasks:[],auditLog:[],meta:{revisionId:'rev-1'}};
 const proposal={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Осмотр',date:null,note:'Повторно проверить.',rationale:'Есть основание.',sourceRecordIds:['r1']}]};
 const plan=validate(state,proposal).plan;
 assert.equal(state.tasks.length,0);
 const result=apply(state,plan,(()=>{let n=0;return()=> 'new-'+(++n)})(),'2026-11-12T12:00:00.000Z');
 assert.equal(state.tasks.length,0);
 assert.equal(result.ok,true);
 assert.equal(result.state.tasks.length,1);
 assert.equal(result.state.tasks[0].status,'suggested');
 assert.equal(result.state.tasks[0].date,null);
 assert.deepEqual(result.state.tasks[0].aiSourceRecordIds,['r1']);
 assert.equal(result.state.auditLog[0].type,'ai_task_suggestions_created');
});
test('AI suggested tasks may remain undated until the user accepts them',()=>{
 const validate=loadFunction('validateTaskDraft');
 const state={hives:[{id:'h1'}],tasks:[]};
 assert.equal(validate({id:'t1',hive:'h1',type:'Осмотр',date:null,note:'Проверить',source:'ai',status:'suggested'},state).ok,true);
 assert.equal(validate({id:'t2',hive:'h1',type:'Осмотр',date:null,note:'Проверить',source:'manual',status:'pending'},state).ok,false);
});

test('AI suggested task cannot be accepted without a user-selected date',async()=>{
 const task={id:'t1',hive:'h1',type:'Осмотр',date:null,status:'suggested',source:'ai'};
 const state={tasks:[task],hives:[{id:'h1'}],auditLog:[],snapshots:[],meta:{}};
 let saves=0;
 const accept=loadFunction('acceptTask',{S:state,prompt:()=>null,alert:()=>{},save:async()=>{saves++;return true},logAudit:(type,details)=>state.auditLog.push({type,...details}),render:()=>{}});
 await accept('t1');
 assert.equal(task.status,'suggested');
 assert.equal(task.date,null);
 assert.equal(saves,0);
});

test('AI task planner rejects repeated task type for one hive even with different evidence',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'},{id:'r2',hive:'h1',date:'2026-11-11',type:'Осмотр'}],tasks:[]};
 const item={hiveId:'h1',type:'Осмотр',date:null,note:'Провести осмотр.',rationale:'Есть основание.',sourceRecordIds:['r1']};
 const result=validate(state,{schemaVersion:1,kind:'suggest_tasks',suggestions:[item,{...item,sourceRecordIds:['r2']}]});
 assert.equal(result.errors[0].code,'ai_task_duplicate_in_proposal');
});
test('AI task evidence fingerprint detects structured field changes, not only text',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const revalidate=loadFunction('revalidateAITaskSuggestionPreview',{validateAITaskSuggestionProposal:validate});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр',queen:'seen',text:''}],tasks:[],meta:{revisionId:'rev-1'}};
 const proposal={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Проверка матки',date:null,note:'Повторно проверить.',rationale:'По данным осмотра.',sourceRecordIds:['r1']}]};
 const plan=validate(state,proposal).plan;
 state.records[0].queen='notSeen';
 assert.equal(revalidate(state,proposal,plan).status,'stale');
});
test('AI command context fingerprint ignores save metadata but detects domain changes',()=>{
 const fingerprint=loadFunction('aiCommandContextFingerprint',{S:{},aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const current=loadFunction('aiCommandContextIsCurrent',{aiCommandContextFingerprint:fingerprint});
 const state={hives:[{id:'h1'}],families:[],layouts:{h1:{}},records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр',queen:'seen'}],tasks:[],extractions:[],meta:{revisionId:'rev-1'}};
 const message={commandContextFingerprint:fingerprint(state)};
 state.meta.revisionId='rev-2';
 assert.equal(current(state,message),true);
 state.records[0].queen='notSeen';
 assert.equal(current(state,message),false);
});
test('AI task evidence with duplicate active journal IDs is rejected as ambiguous',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'},{id:'r1',hive:'h1',date:'2026-11-11',type:'Осмотр'}],tasks:[]};
 const proposal={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Осмотр',date:null,note:'Проверить.',rationale:'Есть основание.',sourceRecordIds:['r1']}]};
 assert.equal(validate(state,proposal).errors[0].code,'ai_task_evidence_not_found_or_mismatched');
});
test('AI task apply rejects stale/tampered plans and generated duplicate IDs atomically',()=>{
 const validateDraft=loadFunction('validateTaskDraft');
 const stable=loadFunction('aiStableSnapshot');
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:stable});
 const revalidate=loadFunction('revalidateAITaskSuggestionPreview',{validateAITaskSuggestionProposal:validate});
 const apply=loadFunction('applyAITaskSuggestionsToDraft',{validateTaskDraft:validateDraft,revalidateAITaskSuggestionPreview:revalidate});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'}],tasks:[],auditLog:[],meta:{revisionId:'rev-1'}};
 const proposal={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Осмотр',date:null,note:'Проверить.',rationale:'По записи.',sourceRecordIds:['r1']}]};
 const plan=validate(state,proposal).plan;
 const tampered={...plan,suggestions:plan.suggestions.map(x=>({...x,note:'подменено после проверки'}))};
 assert.equal(apply(state,tampered,()=> 'id-1','2026-11-12T12:00:00Z').ok,false);
 assert.equal(state.tasks.length,0);
 assert.equal(apply(state,plan,()=> 'same-id','2026-11-12T12:00:00Z').ok,false);
 assert.equal(state.tasks.length,0);
});


function rawBackupFixture(){
 return {hives:[],families:[],records:[],tasks:[],extractions:[],layouts:{}};
}
function inspectRawBackup(state){
 const inspectFamilyLineage=loadFunction('inspectFamilyLineage');
 const inspectTaskIntegrity=loadFunction('inspectTaskIntegrity');
 const inspectPlantModuleIntegrity=loadFunction('inspectPlantModuleIntegrity');
 return loadFunction('validateRawBackupIntegrity',{inspectFamilyLineage,inspectTaskIntegrity,inspectPlantModuleIntegrity})(state);
}

test('main database write rejects a stale revision without overwriting newer state',async()=>{
 let stored={meta:{revisionId:'rev-1'},value:'original'};
 const db={
  transaction(){
   let aborted=false;
   const tx={
    error:null,
    objectStore(){
     return {
      get(){
       const request={result:null,error:null};
       queueMicrotask(()=>{if(!aborted){request.result=structuredClone(stored);request.onsuccess?.()}});
       return request;
      },
      put(value){
       stored=structuredClone(value);
       queueMicrotask(()=>{if(!aborted)tx.oncomplete?.()});
      }
     };
    },
    abort(){
     aborted=true;
     queueMicrotask(()=>tx.onabort?.());
    }
   };
   return tx;
  }
 };
 const write=loadFunction('writeMainIfUnchanged',{db,STORE:'main'});
 const previous=await write({meta:{revisionId:'rev-2'},value:'newer'},'rev-1');
 assert.equal(previous.meta.revisionId,'rev-1');
 assert.equal(stored.meta.revisionId,'rev-2');
 await assert.rejects(write({meta:{revisionId:'rev-3'},value:'stale'},'rev-1'),error=>error.name==='PasekaConflictError');
 assert.equal(stored.meta.revisionId,'rev-2');
 assert.equal(stored.value,'newer');
});
test('automatic backup writes the exact previous state only when the main revision matches',async()=>{
 let current={meta:{revisionId:'rev-2'},value:'current'},backup=null,putCount=0;
 const db={transaction(stores,mode){
  assert.deepEqual(stores,['main','backup']);assert.equal(mode,'readwrite');
  let wrote=false;
  const tx={objectStore(name){return name==='main'?{get(){const request={};queueMicrotask(()=>{request.result=structuredClone(current);request.onsuccess?.();if(!wrote)tx.oncomplete?.()});return request}}:{put(value,key){wrote=true;putCount++;backup={value:structuredClone(value),key};queueMicrotask(()=>tx.oncomplete?.())}}}};
  return tx;
 }};
 const write=loadFunction('writeAutoBackup',{db,STORE:'main',BACKUP_STORE:'backup'});
 const previous={meta:{revisionId:'rev-1'},value:'previous'};
 assert.equal(await write(previous,'rev-2'),true);
 assert.equal(putCount,1);assert.equal(backup.key,'previous');assert.deepEqual(backup.value.state,previous);
 assert.equal(await write({value:'stale'},'rev-1'),false);
 assert.equal(putCount,1,'a stale snapshot must never replace the existing automatic backup');
 assert.deepEqual(backup.value.state,previous);
});
async function runAtomicRestore(expectedRevision='rev-1',backupFails=false){
 let mainState={meta:{revisionId:'rev-1'},value:'current'},backupState={state:{value:'older'}};
 const db={transaction(stores,mode){
  assert.deepEqual(stores,['main','backup']);assert.equal(mode,'readwrite');
  let stagedMain=null,stagedBackup=null,aborted=false;
  const tx={error:null,
   objectStore(name){
    if(name==='main')return{
     get(){const request={};queueMicrotask(()=>{request.result=structuredClone(mainState);request.onsuccess?.();queueMicrotask(()=>{if(!aborted){if(stagedMain!==null)mainState=stagedMain;if(stagedBackup!==null)backupState=stagedBackup;tx.oncomplete?.()}})});return request},
     put(value){stagedMain=structuredClone(value)}
    };
    return{put(value,key){if(backupFails)throw new Error('quota exceeded');stagedBackup={value:structuredClone(value),key}}};
   },
   abort(){aborted=true;queueMicrotask(()=>tx.onabort?.())}
  };
  return tx;
 }};
 const write=loadFunction('writeMainWithBackup',{db,STORE:'main',BACKUP_STORE:'backup'});
 return{write,read:()=>({mainState,backupState})};
}
test('atomic restore replaces the main database and preserves the exact previous state in one transaction',async()=>{
 const fixture=await runAtomicRestore();
 const restored={meta:{revisionId:'rev-2'},value:'restored'};
 const previous=await fixture.write(restored,'rev-1');
 assert.deepEqual(previous,{meta:{revisionId:'rev-1'},value:'current'});
 assert.deepEqual(fixture.read().mainState,restored);
 assert.deepEqual(fixture.read().backupState,{value:{at:fixture.read().backupState.value.at,state:previous},key:'previous'});
});
test('atomic restore rejects a stale revision without changing either database store',async()=>{
 const fixture=await runAtomicRestore('stale');
 const before=structuredClone(fixture.read());
 await assert.rejects(fixture.write({meta:{revisionId:'rev-2'},value:'restored'},'stale'),error=>error.name==='PasekaConflictError');
 assert.deepEqual(fixture.read(),before);
});
test('atomic restore rolls back the main database when preserving the previous backup fails',async()=>{
 const fixture=await runAtomicRestore('rev-1',true);
 const before=structuredClone(fixture.read());
 await assert.rejects(fixture.write({meta:{revisionId:'rev-2'},value:'restored'},'rev-1'),/quota exceeded/i);
 assert.deepEqual(fixture.read(),before);
});
test('backup shape validator accepts a minimal valid empty apiary',()=>{
 const validate=loadFunction('validateBackupState');
 const state=rawBackupFixture();
 assert.equal(validate(state),state);
});
test('backup shape validator rejects unsupported future schema versions without migration',()=>{
 const validate=loadFunction('validateBackupState');
 assert.throws(()=>validate({...rawBackupFixture(),meta:{schemaVersion:12}}),error=>error.code==='UNSUPPORTED_SCHEMA_VERSION'&&/более новой версией приложения/i.test(error.message));
 assert.throws(()=>validate({...rawBackupFixture(),meta:{schemaVersion:0}}),/версия схемы/i);
 assert.throws(()=>validate({...rawBackupFixture(),meta:{schemaVersion:'2'}}),/версия схемы/i);
 assert.equal(validate({...rawBackupFixture(),meta:{schemaVersion:5},plantCatalog:[],plantLocations:[],plantObservations:[],plantAIQueue:[]}).meta.schemaVersion,5);
 const legacy=rawBackupFixture();assert.equal(validate(legacy),legacy);
});
test('backup shape validator rejects malformed journal media and nested box data',()=>{
 const validate=loadFunction('validateBackupState');
 assert.throws(()=>validate({...rawBackupFixture(),records:[{id:'r1',media:'not-an-array'}]}),/вложений записи журнала/i);
 assert.throws(()=>validate({...rawBackupFixture(),layouts:{h1:{boxes:{1:{frames:'not-an-array'}}}}}),/гнездовые корпуса/i);
 assert.throws(()=>validate({...rawBackupFixture(),layouts:{h1:{honeyFrames:[[], 'bad']}}}),/медовые рамки/i);
});
test('backup shape validator rejects malformed entries in optional collections',()=>{
 const validate=loadFunction('validateBackupState');
 for(const key of ['tasks','snapshots','auditLog','aiMessages']){
  assert.throws(()=>validate({...rawBackupFixture(),[key]:[null]}),/повреждённые элементы/i, key+' must contain objects only');
  assert.equal(validate({...rawBackupFixture(),[key]:[]})[key].length,0);
  assert.equal(validate({...rawBackupFixture(),[key]:[{id:'valid'}]})[key][0].id,'valid');
 }
});
test('raw backup integrity rejects duplicate hive identity and number',()=>{
 const state={...rawBackupFixture(),hives:[{id:'h1',number:1},{id:'h1',number:1}]};
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='duplicate_hive_id'));
 assert.ok(result.errors.some(error=>error.code==='duplicate_hive_number'));
});
test('raw backup integrity rejects duplicate frame IDs and mismatched physical locations',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  layouts:{h1:{mode:'summer',installedBoxes:[1,2],boxes:{
   1:{frames:[{frameId:'f1',location:'2',history:[]}]},
   2:{frames:[{frameId:'f1',location:'2',history:[]}]}
  },honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='duplicate_frame_id'));
 assert.ok(result.errors.some(error=>error.code==='frame_location_mismatch'));
});
test('raw backup integrity allows the same local frame ID in different hives',()=>{
 const frame={frameId:'GLOBAL-FRAME-01',location:'1',history:[]};
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1},{id:'h2',number:2}],
  layouts:{
   h1:{mode:'summer',installedBoxes:[1],boxes:{1:{frames:[{...frame}]}},honeyFrames:[[],[]]},
   h2:{mode:'summer',installedBoxes:[1],boxes:{1:{frames:[{...frame}]}},honeyFrames:[[],[]]}
  }
 };
 const result=inspectRawBackup(state);
 assert.equal(result.errors.some(error=>error.code==='duplicate_frame_id'),false);
});
test('raw backup integrity rejects forbidden winter family placement',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  families:[{id:'fam',hive:'h1',box:2}],
  layouts:{h1:{mode:'winter',installedBoxes:[1,2,3],winterOrder:[1,2,3],boxes:{2:{family:'fam',frames:[]}}}}
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='family_in_forbidden_winter_box'));
 assert.ok(result.errors.some(error=>error.code==='winter_requires_three_allowed_boxes'));
});
test('raw backup integrity rejects dangling task and journal links',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  records:[{id:'r1',hive:'missing-hive',taskId:'missing-task'}],
  tasks:[{id:'t1',hive:'missing-hive',completedRecordId:'missing-record'}]
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='record_hive_missing'));
 assert.ok(result.errors.some(error=>error.code==='record_task_link_missing'));
 assert.ok(result.errors.some(error=>error.code==='task_hive_missing'));
 assert.ok(result.errors.some(error=>error.code==='task_completion_record_missing'));
});
test('raw backup assertion rejects invalid source data without rewriting it',()=>{
 const state={...rawBackupFixture(),hives:[{id:'h1',number:1},{id:'h1',number:2}]};
 const before=JSON.stringify(state);
 const validateRawBackupIntegrity=state=>inspectRawBackup(state);
 const assertIntegrity=loadFunction('assertRawBackupIntegrity',{validateRawBackupIntegrity});
 assert.throws(()=>assertIntegrity(state),/Архив не прошёл проверку исходных данных/);
 assert.equal(JSON.stringify(state),before);
});


function taskSuggestionCommandFixture(){
 const suggestion={hiveId:'h1',type:'Осмотр',date:null,note:'Повторно проверить.',rationale:'Есть исходная запись.',sourceRecordIds:['r1']};
 const message={role:'assistant',content:'Предлагаю задачу.',commandStatus:'pending',commandProposal:{schemaVersion:1,kind:'suggest_tasks',suggestions:[suggestion]},commandPlan:{kind:'suggest_tasks',suggestions:[suggestion]}};
 return {hives:[{id:'h1',number:7}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'}],tasks:[],auditLog:[],aiMessages:[message],meta:{revisionId:'rev-1'}};
}
test('AI task suggestion confirmation persists suggested tasks and audit exactly once',async()=>{
 const state=taskSuggestionCommandFixture();
 const message=state.aiMessages[0];
 let saves=0,renders=0,savedState=null;
 const deps={
  S:state,confirm:()=>true,aiCommandContextIsCurrent:()=>true,
  revalidateAICommandPreview:(current,proposal,plan)=>({ok:true,plan}),
  applyAITaskSuggestionsToDraft:(current,plan)=>{const draft=structuredClone(current);draft.tasks.push({id:'task-1',hive:'h1',status:'suggested',date:null});draft.auditLog.push({id:'audit-1',type:'ai_task_suggestions_created'});return {ok:true,state:draft}},
  uid:()=> 'generated-id',
  save:async()=>{saves++;savedState=deps.S;return true},
  renderAIChat:()=>{renders++}
 };
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(saves,1);
 assert.equal(renders,1);
 assert.equal(deps.S.tasks.length,1);
 assert.equal(deps.S.tasks[0].status,'suggested');
 assert.equal(deps.S.aiMessages[0].commandStatus,'applied');
 assert.ok(deps.S.aiMessages[0].appliedAt);
 assert.equal(deps.S.auditLog[0].type,'ai_task_suggestions_created');
 assert.equal(savedState,deps.S);
 assert.equal(message.commandStatus,'pending','the previous snapshot is not mutated by draft application');
});
test('AI task suggestion confirmation rolls back the in-memory draft when persistence fails',async()=>{
 const state=taskSuggestionCommandFixture();
 const message=state.aiMessages[0];
 const deps={
  S:state,confirm:()=>true,aiCommandContextIsCurrent:()=>true,
  revalidateAICommandPreview:(current,proposal,plan)=>({ok:true,plan}),
  applyAITaskSuggestionsToDraft:(current)=>{const draft=structuredClone(current);draft.tasks.push({id:'task-1',hive:'h1',status:'suggested'});draft.auditLog.push({id:'audit-1',type:'ai_task_suggestions_created'});return {ok:true,state:draft}},
  uid:()=> 'generated-id',
  save:async()=>{deps.S.meta.saveError='Ошибка записи';return false},
  renderAIChat:()=>{}
 };
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(deps.S,state);
 assert.equal(deps.S.tasks.length,0);
 assert.equal(deps.S.meta.saveError,'Ошибка записи');
 assert.equal(message.commandStatus,'save_failed');
 assert.match(message.commandError,/исходные данные не изменены/);
});


test('raw backup integrity accepts a valid family placed in its physical brood box',()=>{
 const state={
  ...rawBackupFixture(),
  hives:[{id:'h1',number:1}],
  families:[{id:'fam-1',hive:'h1',box:1,origin:'swarm'}],
  layouts:{h1:{mode:'summer',installedBoxes:[1],boxes:{1:{family:'fam-1',frames:[]}},honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.equal(result.errorCount,0,JSON.stringify(result.errors));
});


test('raw backup integrity rejects frames without IDs before restore',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  layouts:{h1:{mode:'summer',installedBoxes:[1],boxes:{1:{frames:[{location:1,history:[]}]}},honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='missing_frame_id'));
});
test('raw backup integrity rejects invalid family lifecycle fields',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  families:[{id:'fam-1',hive:'h1',origin:'swarm',stage:'developing',box:null}],
  layouts:{h1:{mode:'summer',installedBoxes:[],boxes:{},honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='invalid_non_offshoot_stage'));
});

test('raw backup integrity accepts a valid establishment date for an independent offshoot',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  families:[{id:'fam-1',hive:'h1',origin:'offshoot',stage:'independent',establishedAt:'2026-05-03',parentFamilyId:'archived-parent',parentFamilySnapshot:{id:'archived-parent'},box:null}],
  layouts:{h1:{mode:'summer',installedBoxes:[],boxes:{},honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.equal(result.errorCount,0,JSON.stringify(result.errors));
});

test('raw backup integrity rejects impossible calendar dates for independent offshoots',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  families:[{id:'fam-1',hive:'h1',origin:'offshoot',stage:'independent',establishedAt:'2026-02-30',parentFamilyId:'archived-parent',parentFamilySnapshot:{id:'archived-parent'},box:null}],
  layouts:{h1:{mode:'summer',installedBoxes:[],boxes:{},honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='invalid_family_established_date'));
});

test('inspection text extraction maps only explicit observations to structured fields',()=>{
 const extract=loadFunction('extractInspectionFieldsFromText');
 const result=extract('Осмотр: пчёлами занято 5 рамок; расплода на 4 рамках; 2 свободные отстроенные рамки; матка обнаружена; свежие яйца есть; расплод ровный; роевые маточники; несколько признаков роевого состояния.');
 assert.equal(result.type,'Осмотр');
 assert.deepEqual(result.fields,{occupancy:5,broodFrames:4,freeDrawn:2,queen:'seen',eggs:'yes',broodPattern:'solid',queenCells:'swarm',swarmSigns:'several'});
 assert.equal(result.fieldCount,8);
 assert.equal(Object.keys(result.evidence).length,8);
});

test('inspection text extraction leaves unspecified and ambiguous observations empty',()=>{
 const extract=loadFunction('extractInspectionFieldsFromText');
 const result=extract('Осмотрел семью. Матка, возможно, есть; яйца вроде бы видел; расплод выглядит нормально.');
 assert.equal(result.type,'Осмотр');
 assert.deepEqual(result.fields,{});
 assert.equal(result.fieldCount,0);
});

test('inspection text extraction preserves explicit negative and alternative observations',()=>{
 const extract=loadFunction('extractInspectionFieldsFromText');
 const result=extract('Матка не обнаружена, свежих яиц нет, расплода нет, маточники не обнаружены, роевых признаков не обнаружено.');
 assert.deepEqual(result.fields,{queen:'notSeen',eggs:'no',broodPattern:'none',queenCells:'none',swarmSigns:'none'});
});

test('inspection text extraction rejects frame counts outside the six-frame brood box',()=>{
 const extract=loadFunction('extractInspectionFieldsFromText');
 const result=extract('Занято 8 рамок, расплода на 7 рамках, 9 свободных отстроенных рамок.');
 assert.deepEqual(result.fields,{});
});



test('hive profile catalog resolves legacy hives to the preserved Farrar profile',()=>{
  const clone=loadFunction('cloneHiveProfile');
  const getProfile=loadFunction('getHiveProfile',{cloneHiveProfile:clone,HIVE_PROFILE_CATALOG:{
    'farrar-6x6-v1':{id:'farrar-6x6-v1',schemaVersion:1,family:'farrar',status:'ready',name:'Farrar',frame:{heightMm:180},brood:{boxCount:6,framesPerBox:6,boxKeys:['1','2','3','4','5','6']},honey:{boxCount:2,framesPerBox:10,boxKeys:['H1','H2'],installation:'paired'},winter:{enabled:true,requiredBroodBoxes:3,allowedBoxKeys:['1','3','4','6'],forbiddenBoxKeys:['2','5']}}
  }});
  const profile=getProfile({id:'old-hive'});
  assert.equal(profile.id,'farrar-6x6-v1');
  assert.equal(profile.brood.framesPerBox,6);
   assert.equal(profile.frame.heightMm,180);
  profile.name='Changed copy';
  assert.equal(getProfile({profileId:'farrar-6x6-v1'}).name,'Farrar');
});

test('hive profile validator accepts a complete configurable construction',()=>{
  const validate=loadFunction('validateHiveProfile');
  const profile={id:'custom-v1',schemaVersion:1,status:'ready',name:'Custom',frame:{heightMm:230},brood:{boxCount:3,framesPerBox:10,boxKeys:['B1','B2','B3']},honey:{boxCount:1,framesPerBox:10,boxKeys:['M1'],installation:'independent'},winter:{enabled:true,requiredBroodBoxes:2,allowedBoxKeys:['B1','B2'],forbiddenBoxKeys:['B3']}};
  assert.deepEqual(validate(profile),{ok:true,errors:[]});
});

test('hive profile validator refuses incomplete Dadant and Ruta templates as active configurations',()=>{
  const validate=loadFunction('validateHiveProfile');
  for(const family of ['dadant','ruta']){
    const template={id:family+'-template-v1',schemaVersion:1,family,status:'template',name:family+' setup'};
    assert.equal(validate(template).ok,false);
    assert.ok(validate(template).errors.some(x=>x.code==='profile_requires_configuration'));
    assert.equal(validate(template,{allowTemplate:true}).ok,true);
  }
});

test('hive profile validator rejects mismatched capacities and winter references',()=>{
  const validate=loadFunction('validateHiveProfile');
  const profile={id:'bad-v1',schemaVersion:1,status:'ready',name:'Bad',frame:{heightMm:195},brood:{boxCount:2,framesPerBox:6,boxKeys:['1','2']},honey:{boxCount:1,framesPerBox:10,boxKeys:['H1'],installation:'invalid-mode'},winter:{enabled:true,requiredBroodBoxes:3,allowedBoxKeys:['1','9'],forbiddenBoxKeys:['2']}};
  const result=validate(profile);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.code==='profile_honey_installation_invalid'));
  assert.ok(result.errors.some(x=>x.code==='profile_winter_required_count_invalid'));
  assert.ok(result.errors.some(x=>x.code==='profile_winter_allowed_keys_invalid'));
});

test('profile capabilities expose only validated physical parameters',()=>{
 const validate=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const get=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validate,cloneHiveProfile:clone});
 const profile={id:'custom-v1',schemaVersion:1,status:'ready',name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:3,framesPerBox:10,boxKeys:['B1','B2','B3']},honey:{boxCount:1,framesPerBox:10,boxKeys:['M1'],installation:'independent'},winter:{enabled:true,requiredBroodBoxes:2,allowedBoxKeys:['B1','B2'],forbiddenBoxKeys:['B3'],honeyAllowed:false}};
 const result=get(profile);
 assert.equal(result.ok,true);
 assert.deepEqual(result.broodKeys,['B1','B2','B3']);
 assert.equal(result.broodCapacity,10);
 assert.equal(result.honeyInstallation,'independent');
 assert.equal(result.frameHeightMm,230);
});

test('profile assembly validation enforces profile-specific winter and honey rules',()=>{
 const validateProfile=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const get=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validateProfile,cloneHiveProfile:clone});
 const validate=loadFunction('validateHiveAssemblyProfile',{getHiveProfileCapabilities:get});
 const profile={id:'custom-v1',schemaVersion:1,status:'ready',name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:3,framesPerBox:10,boxKeys:['B1','B2','B3']},honey:{boxCount:1,framesPerBox:10,boxKeys:['M1'],installation:'independent'},winter:{enabled:true,requiredBroodBoxes:2,allowedBoxKeys:['B1','B2'],forbiddenBoxKeys:['B3'],honeyAllowed:false}};
 assert.deepEqual(validate(profile,{mode:'winter',installedBoxes:['B1','B2'],winterOrder:['B1','B2'],honeyBoxInstalled:[false],honeyFrames:[[]]}),{ok:true,errors:[]});
 const invalid=validate(profile,{mode:'winter',installedBoxes:['B1','B3'],winterOrder:['B1','B3'],honeyBoxInstalled:[true]});
 assert.ok(invalid.errors.some(error=>error.code==='winter_box_not_allowed'));
 assert.ok(invalid.errors.some(error=>error.code==='winter_honey_not_allowed'));
});

test('paired honey configuration rejects partial installation while independent honey permits it',()=>{
 const validateProfile=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const get=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validateProfile,cloneHiveProfile:clone});
 const validate=loadFunction('validateHiveAssemblyProfile',{getHiveProfileCapabilities:get});
 const base={schemaVersion:1,status:'ready',name:'test',frame:{heightMm:195},brood:{boxCount:2,framesPerBox:6,boxKeys:['1','2']},winter:{enabled:false}};
 const paired={...base,id:'paired',honey:{boxCount:2,framesPerBox:10,boxKeys:['H1','H2'],installation:'paired'}};
 const independent={...base,id:'independent',honey:{boxCount:2,framesPerBox:10,boxKeys:['H1','H2'],installation:'independent'}};
 const layout={mode:'summer',installedBoxes:['1'],honeyBoxInstalled:[true,false],honeyFrames:[[],[]]};
 assert.ok(validate(paired,layout).errors.some(error=>error.code==='honey_pair_mismatch'));
 assert.equal(validate(independent,layout).ok,true);
});

test('frame move planner uses configured profile keys and capacities',()=>{
 const plan=loadFunction('planFrameMoves');
 const profile={id:'custom-v1',status:'ready',family:'custom',brood:{boxKeys:['B1','B2','B3'],framesPerBox:10},honey:{boxKeys:['M1'],framesPerBox:8,installation:'independent'},winter:{enabled:true,requiredBroodBoxes:2,allowedBoxKeys:['B1','B2'],forbiddenBoxKeys:['B3']}};
 const frame=(id,location)=>({frameId:id,location,history:[]});
 const state={hives:[{id:'custom-hive',profile}],layouts:{'custom-hive':{mode:'summer',installedBoxes:['B1','B2'],honeyBoxInstalled:[true],boxes:{B1:{family:'',frames:[frame('f1','B1')]},B2:{family:'',frames:Array.from({length:9},(_,i)=>frame('b'+i,'B2'))},B3:{family:'',frames:[]}},honeyFrames:[Array.from({length:8},(_,i)=>frame('m'+i,'M1'))]}}};
 const result=plan(state,[{hiveId:'custom-hive',frameId:'f1',fromBox:'B1',toBox:'B2'}]);
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(result.moves[0].toBox,'B2');
 const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:plan});
 const applied=apply(state,result,'2026-11-12');
 assert.equal(applied.ok,true,JSON.stringify(applied.errors));
 assert.equal(applied.state.layouts['custom-hive'].boxes.B1.frames.length,0);
 assert.equal(applied.state.layouts['custom-hive'].boxes.B2.frames.length,10);
 assert.equal(applied.state.layouts['custom-hive'].boxes.B2.frames.at(-1).location,'B2');
 const invalid=plan(state,[{hiveId:'custom-hive',frameId:'f1',fromBox:'B1',toBox:'1'}]);
 assert.equal(invalid.ok,false);
 assert.ok(invalid.errors.some(error=>error.code==='invalid_move_reference'));
});

test('frame move planner refuses profile templates that are not operational',()=>{
 const plan=loadFunction('planFrameMoves');
 const state={hives:[{id:'h1',profile:{id:'ruta-template-v1',status:'template',brood:{boxKeys:['B1']},honey:{boxKeys:[]}}}],layouts:{h1:{mode:'summer',installedBoxes:['B1'],boxes:{B1:{frames:[{frameId:'f',location:'B1',history:[]}]}},honeyFrames:[],honeyBoxInstalled:[]}}};
 const result=plan(state,[{hiveId:'h1',frameId:'f',fromBox:'B1',toBox:'B1'}]);
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(error=>error.code==='move_profile_not_operational'));
});

test('profile frame helpers use the selected hive capacities and custom honey keys',()=>{
 const profile={id:'custom-v1',status:'ready',schemaVersion:1,name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:2,framesPerBox:10,boxKeys:['B1','B2']},honey:{boxCount:1,framesPerBox:8,boxKeys:['M1'],installation:'independent'},winter:{enabled:false}};
 const profileForHive=()=>profile;
 const isHoney=loadFunction('isHoneyBoxKey',{profileHoneyKeys:()=>['M1']});
 const capacity=loadFunction('frameCapacity',{profileForHive,isHoneyBoxKey:isHoney});
 assert.equal(capacity('B1','h1'),10);
 assert.equal(capacity('M1','h1'),8);
 assert.equal(isHoney('M1','h1'),true);
 assert.equal(isHoney('H1','h1'),false);
});

test('layout initialization creates physical frame arrays from the selected profile',()=>{
 const profile={id:'custom-v1',status:'ready',schemaVersion:1,name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:2,framesPerBox:10,boxKeys:['B1','B2']},honey:{boxCount:1,framesPerBox:8,boxKeys:['M1'],installation:'independent'},winter:{enabled:false}};
 const state={layouts:{},hives:[{id:'h1'}]};
 const profileForHive=()=>profile;
 const frameCapacity=(key)=>key==='M1'?8:10;
 const framePrefix=(key)=>key;
 const layout=loadFunction('layoutFor',{S:state,profileForHive,frameCapacity,framePrefix});
 const result=layout('h1');
 assert.equal(result.boxes.B1.frames.length,10);
 assert.equal(result.boxes.B2.frames.length,10);
 assert.equal(result.honeyFrames.length,1);
 assert.equal(result.honeyFrames[0].length,8);
 assert.equal(result.honeyFrames[0][0].location,'M1');
});

test('profile assembly rejects removing a brood box that still owns a family',()=>{
 const validateProfile=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const get=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validateProfile,cloneHiveProfile:clone});
 const validate=loadFunction('validateHiveAssemblyProfile',{getHiveProfileCapabilities:get});
 const profile={id:'custom-v1',schemaVersion:1,status:'ready',name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:2,framesPerBox:10,boxKeys:['B1','B2']},honey:{boxCount:0,framesPerBox:0,boxKeys:[],installation:'independent'},winter:{enabled:false}};
 const layout={mode:'summer',installedBoxes:['B2'],winterOrder:[],honeyBoxInstalled:[],boxes:{B1:{family:'family-1',frames:[]},B2:{family:'',frames:[]}},honeyFrames:[]};
 const result=validate(profile,layout);
 assert.ok(result.errors.some(error=>error.code==='family_box_not_installed'));
});


test('mobile navigation includes all ten sections and is positioned as a safe-area-aware bottom bar',()=>{
 const nav=html.match(/<nav aria-label="Основные разделы">([\s\S]*?)<\/nav>/);
 assert.ok(nav);
 assert.equal((nav[1].match(/data-tab=/g)||[]).length,10);
 assert.match(html,/main>nav\[aria-label="Основные разделы"\][\s\S]*?position:fixed!important/);
 assert.match(html,/env\(safe-area-inset-bottom,0px\)/);
});

test('responsive workspace defines both portrait and landscape orientation layouts',()=>{
 assert.match(html,/@media \(orientation:landscape\)/);
 assert.match(html,/@media \(orientation:portrait\)/);
 assert.match(html,/max-height:520px/);
});

test('apiary workspace exposes global, hive and journal search controls',()=>{
 assert.match(html,/id="globalSearch"/);
 assert.match(html,/id="hiveSearch"/);
 assert.match(html,/id="hiveModeFilter"/);
 assert.match(html,/id="journalSearch"/);
 assert.match(html,/id="journalTypeFilter"/);
 assert.match(html,/id="journalDateFilter"/);
 assert.match(html,/function renderGlobalSearch/);
 assert.match(html,/function renderJournalRecords/);
});

test('journal uses chronological entries and profile-aware frame search',()=>{
 assert.match(html,/class="journal-timeline"/);
 assert.match(html,/class="[^"]*\bjournal-entry\b/);
 assert.match(html,/profileBroodKeys\(hive\.id\)/);
 assert.match(html,/profileHoneyKeys\(hive\.id\)/);
});

test('PWA manifest does not lock the app to portrait or landscape',()=>{
 assert.equal(manifest.orientation,'any');
});

test('hive list miniatures use the selected construction profile',()=>{
 const source=extractFunction('card');
 assert.match(source,/profileBroodKeys\(h\.id\)/);
 assert.match(source,/profileHoneyKeys\(h\.id\)/);
 assert.match(source,/profile\?\.layout\?\.rows/);
});

test('home miniatures render the installed boxes and honey boxes from each hive profile',()=>{
 const source=extractFunction('renderHome');
 assert.match(source,/profileBroodKeys\(h\.id\)/);
 assert.match(source,/profileHoneyKeys\(h\.id\)/);
 assert.match(source,/layoutRows\.map/);
 assert.doesNotMatch(source,/\[1,2,3\]/);
 assert.doesNotMatch(source,/\[1,2\]\.filter/);
});

test('configured honey box arrays are initialized to their profile capacity',()=>{
 const profile={id:'test-profile',schemaVersion:1,status:'ready',name:'Test',family:'custom',frame:{heightMm:230},brood:{boxCount:1,framesPerBox:8,boxKeys:['B1']},honey:{boxCount:1,framesPerBox:7,boxKeys:['M1'],installation:'independent'},winter:{enabled:false}};
 const state={layouts:{},hives:[{id:'h1'}]};
 const layout=loadFunction('layoutFor',{S:state,profileForHive:()=>profile,frameCapacity:key=>key==='M1'?7:8,framePrefix:key=>key});
 const result=layout('h1');
 assert.equal(result.honeyFrames[0].length,7);
 assert.equal(result.honeyFrames[0][0].frameId,'M1-01');
});

test('journal supports family filtering and inline attachment previews',()=>{
 assert.match(html,/id="journalFamilyFilter"/);
 const source=extractFunction('renderJournalRecords');
 assert.match(source,/familySelect/);
 assert.match(source,/mediaHtml\(r\.media\)/);
 assert.match(source,/mediaNames/);
});

test('hive detail keeps the hives navigation destination active',()=>{
 const paint=extractFunction('paintTab');
 assert.match(paint,/tab==='hiveDetail'&&x\.dataset\.tab==='hives'/);
 assert.doesNotMatch(paint,/tab==='hiveDetail'&&x\.dataset\.tab==='home'/);
});

test('hive directory uses correct Russian declension for the hive count',()=>{
 const source=extractFunction('renderHiveDirectory');
 assert.match(source,/ruPlural\(S\.hives\.length,'улей','улья','ульев'\)/);
});

test('hive and frame cards support keyboard activation',()=>{
 assert.match(html,/class="hive-row-main" role="button" tabindex="0"/);
 assert.match(html,/class="home-hive" role="button" tabindex="0"/);
 assert.match(html,/target\??\.matches\('\.hive-row-main\[role="button"\],\.home-hive\[role="button"\],\.frame-chip\[role="button"\]'\)/);
});


test('custom Farrar column keeps frame height distinct from brood box height',()=>{
  const profileBlock=html.match(/'farrar-6x6-v1':\{([\s\S]*?)\n \},\n 'dadant-template-v1'/);
  assert.ok(profileBlock,'Farrar column profile must exist');
  assert.ok(profileBlock[1].includes('frame:{widthMm:null,heightMm:180,'));
  assert.ok(profileBlock[1].includes('brood:{boxCount:6,framesPerBox:6,boxHeightMm:195,'));
  assert.ok(profileBlock[1].includes("honey:{boxCount:2,framesPerBox:10,boxHeightMm:null,boxKeys:['H1','H2'],installation:'paired'}"));
  assert.equal((profileBlock[1].match(/frame:\{/g)||[]).length,1,'profile defines one shared frame geometry for brood and honey frames');

});


test('Farrar column uses one 180 mm frame geometry in brood and honey boxes in every assembly mode',()=>{
 const profile={id:'farrar-6x6-v1',schemaVersion:1,status:'ready',name:'Farrar sectional column',family:'farrar',
  frame:{widthMm:null,heightMm:180,topBarMm:null,bottomBarMm:null},
  brood:{boxCount:6,framesPerBox:6,boxHeightMm:195,boxKeys:['1','2','3','4','5','6']},
  honey:{boxCount:2,framesPerBox:10,boxHeightMm:null,boxKeys:['H1','H2'],installation:'paired'},
  winter:{enabled:true,requiredBroodBoxes:3,allowedBoxKeys:['1','3','4','6'],forbiddenBoxKeys:['2','5'],honeyAllowed:false}};
 const validate=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const capabilities=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validate,cloneHiveProfile:clone});
 assert.equal(validate(profile).ok,true);
 for(const mode of ['summer','winter']){
  const assembly={mode,installedBoxes:mode==='winter'?['1','3','4']:['1','2','3','4','5','6'],winterOrder:mode==='winter'?['1','3','4']:[],honeyBoxInstalled:mode==='winter'?[false,false]:[true,true]};
  const result=capabilities(profile);
  assert.equal(result.ok,true);
  assert.equal(result.frameHeightMm,180);
  assert.equal(result.broodCapacity,6);
  assert.equal(result.honeyCapacity,10);
  assert.equal(assembly.mode,mode);
 }
 assert.equal(profile.brood.boxHeightMm,195);
 assert.equal(profile.honey.boxHeightMm,null);
 assert.equal(profile.frame.heightMm,180);
});



test('six-digit frame inventory is not part of the current model',()=>{
 const source=extractFunction('migrateState');
 assert.match(source,/delete frame\.inventoryNumber/);
 assert.match(source,/delete S\.meta\.nextFrameInventoryNumber/);
 assert.doesNotMatch(source,/ensureFrameInventoryNumbers/);
});
test('runtime integrity allows the same local frame ID in different hives',()=>{
 const frame={frameId:'GLOBAL-FRAME-02',location:'1',history:[]};
 const state={
  hives:[{id:'h1',number:1},{id:'h2',number:2}],families:[],records:[],tasks:[],extractions:[],
  layouts:{
   h1:{mode:'summer',installedBoxes:[1],honeyBoxInstalled:[false,false],boxes:{1:{frames:[{...frame}]}},honeyFrames:[[],[]]},
   h2:{mode:'summer',installedBoxes:[1],honeyBoxInstalled:[false,false],boxes:{1:{frames:[{...frame}]}},honeyFrames:[[],[]]}
  }
 };
 const profile={id:'farrar-6x6-v1',family:'farrar'};
 const validate=loadFunction('validateVirtualApiary',{
  S:state,inspectFamilyLineage:()=>[],inspectTaskIntegrity:()=>[],
  getHiveProfile:()=>profile,validateHiveProfile:()=>({ok:true,errors:[]})
 });
 const result=validate();
 assert.equal(result.errors.some(error=>error.code==='duplicate_frame_id'),false);
});
test('schema migration refuses unsupported future or malformed versions without modifying the database state',()=>{
 for(const version of [0,13,'2']){
  const state={meta:{schemaVersion:version},hives:[],families:[],records:[],tasks:[],extractions:[],snapshots:[],layouts:{},auditLog:[],aiMessages:[]};
  const before=JSON.stringify(state),migrate=loadFunction('migrateState',{S:state});
  assert.throws(()=>migrate(),error=>/Неподдерживаемая версия схемы данных/.test(error.message)&&(version===13?error.code==='UNSUPPORTED_SCHEMA_VERSION':!error.code));
  assert.equal(JSON.stringify(state),before);
 }
});
test('schema migration preserves physical frame IDs and adds stable metadata exactly once',()=>{
 const state={
  meta:{schemaVersion:1},
  hives:[{id:'h1',number:1}],
  families:[{name:'Семья без внутреннего ID'}],
  records:[{hive:'h1',date:'2026-11-12',type:'Осмотр'}],
  tasks:[],extractions:[{items:[{}]}],snapshots:[],layouts:{},auditLog:[],aiMessages:[]
 };
 const frame={frameId:'PHYSICAL-FRAME-01',location:'1',inventoryNumber:'000001'};
 const layoutFor=hiveId=>{
  state.layouts[hiveId]=state.layouts[hiveId]||{boxes:{},honeyFrames:[[],[]]};
  return state.layouts[hiveId];
 };
 const frameArray=(layout,key)=>{
  if(key==='H1'||key==='H2'){
   const index=key==='H1'?0:1;
   return layout.honeyFrames[index];
  }
  layout.boxes[key]=layout.boxes[key]||{frames:[]};
  return layout.boxes[key].frames;
 };
 layoutFor('h1').boxes['1']={frames:[frame]};
 let sequence=0;
 const migrate=loadFunction('migrateState',{S:state,uid:()=> 'generated-'+(++sequence),layoutFor,frameArray});
 assert.equal(migrate(),true);
 assert.equal(state.meta.schemaVersion,12);
 assert.deepEqual(state.varroaObservations,[]);
 assert.deepEqual(state.pesticideIncidents,[]);
 assert.ok(state.meta.deviceId);
 assert.ok(state.hives[0].profileId==='farrar-6x6-v1');
 assert.ok(state.families[0].id);
 assert.ok(state.records[0].id);
 assert.ok(state.extractions[0].id);
 assert.ok(state.extractions[0].items[0].id);
 assert.ok(state.snapshots.length>0);
 assert.equal(frame.frameId,'PHYSICAL-FRAME-01');
 assert.ok(frame.id);
 assert.equal(frame.inventoryNumber,undefined);
 assert.equal(state.families[0].line,null);
 assert.equal(state.families[0].queen,null);
 assert.deepEqual(frame.history,[]);
 assert.ok(state.layouts.h1.corpusIds['1']);
 assert.ok(state.layouts.h1.corpusIds.H1);
 assert.equal(migrate(),false);
 assert.equal(state.hives[0].profileId,'farrar-6x6-v1');
});


function honeyReturnFixture(){
 const state={
  hives:[{id:'h1'},{id:'h2'}],
  layouts:{
   h1:{mode:'summer',honeyBoxInstalled:[false,false]},
   h2:{mode:'summer',honeyBoxInstalled:[false,false]}
  },
  extractions:[
   {id:'e1',date:'2026-08-01',items:[{hiveId:'h1',kilograms:12}]},
   {id:'e2',date:'2026-08-02',items:[{hiveId:'h2',kilograms:15}]}
  ],
  auditLog:[]
 };
 const elements={honeyReturnDate:{value:'2026-11-12'},returnHoneyDlg:{close(){}}};
 let saves=0;const alerts=[];
 const deps={
  S:state,
  returningHoney:[{eventId:'e1',hiveId:'h1'},{eventId:'e2',hiveId:'h2'}],
  $:id=>elements[id],
  alert:message=>alerts.push(message),
  render:()=>{},
  save:async()=>{saves++;return true},
  logAudit:null
 };
 deps.logAudit=(type,details)=>deps.S.auditLog.push({type,...details});
 return {get state(){return deps.S},deps,alerts,get saves(){return saves}};
}
test('honey pair return validates all hives before atomically returning both pairs',async()=>{
 const fixture=honeyReturnFixture();
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.deepEqual(fixture.state.layouts.h1.honeyBoxInstalled,[true,true]);
 assert.deepEqual(fixture.state.layouts.h2.honeyBoxInstalled,[true,true]);
 assert.equal(fixture.state.extractions[0].items[0].returnedAt,'2026-11-12');
 assert.equal(fixture.state.extractions[1].items[0].returnedAt,'2026-11-12');
 assert.equal(fixture.state.auditLog.length,2);
 assert.equal(fixture.saves,1);
 assert.deepEqual(fixture.alerts,[]);
});
test('honey pair return rejects an invalid later hive without partially changing an earlier hive',async()=>{
 const fixture=honeyReturnFixture();
 fixture.state.layouts.h2.mode='winter';
 const before=JSON.stringify(fixture.state);
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.equal(JSON.stringify(fixture.state),before);
 assert.equal(fixture.saves,0);
 assert.equal(fixture.state.auditLog.length,0);
 assert.match(fixture.alerts[0],/зимнюю сборку/i);
});

test('honey pair return restores the original state when persistence fails',async()=>{
 const fixture=honeyReturnFixture();
 const original=fixture.state;
 fixture.deps.save=async()=>{fixture.deps.S.meta={saveError:'Не удалось сохранить'};return false};
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.equal(fixture.state,original);
 assert.deepEqual(fixture.state.layouts.h1.honeyBoxInstalled,[false,false]);
 assert.equal(fixture.state.extractions[0].items[0].returnedAt,undefined);
 assert.equal(fixture.state.auditLog.length,0);
 assert.equal(fixture.state.meta.saveError,'Не удалось сохранить');
 assert.equal(fixture.saves,0);
});

test('honey pair return restores the exact original state when persistence throws',async()=>{
 const fixture=honeyReturnFixture();
 const original=JSON.stringify(fixture.state);
 fixture.deps.save=async()=>{throw new Error('storage exploded')};
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.equal(JSON.stringify(fixture.state),original);
 assert.deepEqual(fixture.alerts,['Возврат медовых корпусов отменён: storage exploded. Исходные данные восстановлены.']);
 assert.equal(fixture.saves,0);
});
test('honey pair return rolls back all changes when audit logging throws',async()=>{
 const fixture=honeyReturnFixture();
 const original=JSON.stringify(fixture.state);
 fixture.deps.logAudit=()=>{throw new Error('audit unavailable')};
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.equal(JSON.stringify(fixture.state),original);
 assert.deepEqual(fixture.alerts,['Возврат медовых корпусов отменён: audit unavailable. Исходные данные восстановлены.']);
 assert.equal(fixture.saves,0);
});
test('honey pair return rejects repeated and duplicate return requests',async()=>{
 const fixture=honeyReturnFixture();
 fixture.state.extractions[0].items[0].returnedAt='2026-11-10';
 fixture.deps.returningHoney=[{eventId:'e1',hiveId:'h1'}];
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.equal(fixture.saves,0);
 assert.match(fixture.alerts[0],/уже отмечены/i);
 const second=honeyReturnFixture();
 second.deps.returningHoney=[{eventId:'e1',hiveId:'h1'},{eventId:'e1',hiveId:'h1'}];
 await loadFunction('confirmHoneyReturn',second.deps)();
 assert.equal(second.saves,0);
 assert.match(second.alerts[0],/повторн/i);
});

test('record dialog has compact responsive layout rules for portrait and landscape phones',()=>{
  assert.match(html,/@media\s*\(orientation:landscape\)/);
 assert.match(html,/#recordDlg\s+form\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/@media\s*\(orientation:landscape\)\s*and\s*\(max-height:520px\)/);
 assert.match(html,/@media\s*\(orientation:portrait\)\s*and\s*\(max-width:560px\)/);
 assert.match(html,/max-height:calc\(100dvh - 8px\)/);
});


function openRealIndexedDb(factory, name, backupKeyPath = false) {
 return new Promise((resolve,reject)=>{
  const request=factory.open(name,1);
  request.onupgradeneeded=()=>{
   const db=request.result;
   db.createObjectStore('main');
   db.createObjectStore('backup',backupKeyPath?{keyPath:'id'}:undefined);
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error('Не удалось открыть тестовую IndexedDB'));
 });
}
function completeTransaction(tx) {
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onabort=()=>reject(tx.error||new Error('Тестовая транзакция прервана'));
  tx.onerror=()=>reject(tx.error||new Error('Ошибка тестовой транзакции'));
 });
}
async function seedIndexedDb(db, stores) {
 const tx=db.transaction(stores.map(([store])=>store),'readwrite');
 const done=completeTransaction(tx);
 for(const [store,value,key] of stores) tx.objectStore(store).put(value,key);
 await done;
}
async function readIndexedDb(db,store,key) {
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readonly'),request=tx.objectStore(store).get(key);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
let indexedDbTestSequence=0;

test('IndexedDB real API serializes competing revision writes and rejects the stale second writer',async()=>{
 const factory=new IDBFactory();
 const db=await openRealIndexedDb(factory,'revision-race-'+(++indexedDbTestSequence));
 try{
  await seedIndexedDb(db,[['main',{meta:{revisionId:'rev-1'},value:'initial'},'state']]);
  const write=loadFunction('writeMainIfUnchanged',{db,STORE:'main'});
  const results=await Promise.allSettled([
   write({meta:{revisionId:'rev-2a'},value:'writer-a'},'rev-1'),
   write({meta:{revisionId:'rev-2b'},value:'writer-b'},'rev-1')
  ]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const rejected=results.find(x=>x.status==='rejected');
  assert.equal(rejected.reason.name,'PasekaConflictError');
  const saved=await readIndexedDb(db,'main','state');
  assert.ok(['rev-2a','rev-2b'].includes(saved.meta.revisionId));
  assert.notEqual(saved.meta.revisionId,'rev-1');
 }finally{db.close()}
});

test('IndexedDB real API commits restored state and previous backup atomically',async()=>{
 const factory=new IDBFactory();
 const db=await openRealIndexedDb(factory,'atomic-restore-'+(++indexedDbTestSequence));
 try{
  const previous={meta:{revisionId:'rev-1'},value:'previous'};
  await seedIndexedDb(db,[['main',previous,'state']]);
  const write=loadFunction('writeMainWithBackup',{db,STORE:'main',BACKUP_STORE:'backup'});
  const restored={meta:{revisionId:'rev-2'},value:'restored'};
  const returned=await write(restored,'rev-1');
  assert.deepEqual(returned,previous);
  assert.deepEqual(await readIndexedDb(db,'main','state'),restored);
  const backup=await readIndexedDb(db,'backup','previous');
  assert.deepEqual(backup.state,previous);
  assert.equal(typeof backup.at,'string');
 }finally{db.close()}
});

test('IndexedDB real API aborts main restore when backup write fails',async()=>{
 const factory=new IDBFactory();
 const db=await openRealIndexedDb(factory,'atomic-restore-failure-'+(++indexedDbTestSequence),true);
 try{
  const previous={meta:{revisionId:'rev-1'},value:'must-survive'};
  await seedIndexedDb(db,[['main',previous,'state']]);
  const write=loadFunction('writeMainWithBackup',{db,STORE:'main',BACKUP_STORE:'backup'});
  await assert.rejects(write({meta:{revisionId:'rev-2'},value:'must-not-commit'},'rev-1'),error=>error?.name==='DataError');
  assert.deepEqual(await readIndexedDb(db,'main','state'),previous);
  assert.equal(await readIndexedDb(db,'backup','previous'),undefined);
 }finally{db.close()}
});

test('IndexedDB real API updates automatic backup only for the matching main revision',async()=>{
 const factory=new IDBFactory();
 const db=await openRealIndexedDb(factory,'auto-backup-'+(++indexedDbTestSequence));
 try{
  const current={meta:{revisionId:'rev-1'},value:'current'};
  const oldBackup={at:'2026-11-11T12:00:00.000Z',state:{meta:{revisionId:'rev-0'},value:'old-backup'}};
  await seedIndexedDb(db,[['main',current,'state'],['backup',oldBackup,'previous']]);
  const write=loadFunction('writeAutoBackup',{db,STORE:'main',BACKUP_STORE:'backup'});
  const snapshot={meta:{revisionId:'rev-1'},value:'snapshot-for-current'};
  assert.equal(await write(snapshot,'rev-1'),true);
  const written=await readIndexedDb(db,'backup','previous');
  assert.deepEqual(written.state,snapshot);
  assert.equal(typeof written.at,'string');
  await seedIndexedDb(db,[['main',{meta:{revisionId:'rev-2'},value:'newer-main'},'state']]);
  assert.equal(await write({meta:{revisionId:'rev-1'},value:'stale-snapshot'},'rev-1'),false);
  assert.deepEqual(await readIndexedDb(db,'backup','previous'),written);
 }finally{db.close()}
});

test('JSON backup restore keeps current in-memory state when atomic database write fails',async()=>{
 const current={meta:{revisionId:'current-rev'},hives:[{id:'current-hive'}],families:[],records:[],tasks:[],extractions:[],layouts:{},auditLog:[],aiMessages:[]};
 const restored={meta:{schemaVersion:2},hives:[],families:[],records:[],tasks:[],extractions:[],snapshots:[],layouts:{},auditLog:[],aiMessages:[]};
 const alerts=[];
 const deps={
  S:current,
  $:()=>({files:[{text:async()=>JSON.stringify({state:restored})}]}),
  confirm:()=>true,
  saveQueue:Promise.resolve(),
  readMain:async()=>({meta:{revisionId:'current-rev'}}),
  validateBackupState:state=>state,
  assertRawBackupIntegrity:state=>state,
  migrateState:()=>false,
  uid:()=> 'restored-rev',
  logAudit:(type)=>{deps.S.auditLog.push({type})},
  validateVirtualApiary:()=>({errorCount:0,errors:[]}),
  writeMainWithBackup:async()=>{throw new Error('simulated IndexedDB transaction failure')},
  render:()=>{},
  alert:message=>alerts.push(message)
 };
 await loadFunction('restoreBackup',deps)();
 assert.equal(deps.S,current,'failed restore must reinstate original in-memory state');
 assert.equal(current.meta.revisionId,'current-rev');
 assert.equal(alerts.length,1);
 assert.match(alerts[0],/simulated IndexedDB transaction failure/);
});

test('JSON backup restore rejects corrupt source before confirmation or database writes',async()=>{
 const current={meta:{revisionId:'current-rev'},hives:[],families:[],records:[],tasks:[],extractions:[],layouts:{}};
 const corrupt={...rawBackupFixture(),hives:[{id:'duplicate',number:1},{id:'duplicate',number:2}]};
 let confirmations=0,writes=0;
 const alerts=[];
 const validateBackupState=loadFunction('validateBackupState');
 const validateRawBackupIntegrity=loadFunction('validateRawBackupIntegrity',{
  inspectFamilyLineage:loadFunction('inspectFamilyLineage'),
  inspectTaskIntegrity:loadFunction('inspectTaskIntegrity'),
  inspectPlantModuleIntegrity:loadFunction('inspectPlantModuleIntegrity'),
  
 });
 const assertRawBackupIntegrity=loadFunction('assertRawBackupIntegrity',{validateRawBackupIntegrity,inspectPlantModuleIntegrity:loadFunction('inspectPlantModuleIntegrity')});
 const deps={
  S:current,
  $:()=>({files:[{text:async()=>JSON.stringify({state:corrupt})}]}),
  confirm:()=>{confirmations++;return true},
  saveQueue:Promise.resolve(),
  readMain:async()=>{writes++;return null},
  validateBackupState,
  assertRawBackupIntegrity,
  inspectPlantModuleIntegrity:loadFunction('inspectPlantModuleIntegrity'),

  alert:message=>alerts.push(message)
 };
 await loadFunction('restoreBackup',deps)();
 assert.equal(deps.S,current);
 assert.equal(confirmations,0,'corrupt archive must be rejected before user confirmation');
 assert.equal(writes,0,'corrupt archive must not read or write the live database');
 assert.equal(alerts.length,1);
 assert.match(alerts[0],/не прошёл проверку исходных данных/i);
});



test('JSON backup restore integrates with real IndexedDB and preserves the exact previous database state',async()=>{
 const factory=new IDBFactory();
 const db=await openRealIndexedDb(factory,'json-restore-integration-'+(++indexedDbTestSequence));
 try{
  const previous={meta:{schemaVersion:2,revisionId:'current-rev'},hives:[{id:'live-hive',number:1}],families:[],records:[],tasks:[],extractions:[],layouts:{},auditLog:[],aiMessages:[]};
  const restored={meta:{schemaVersion:2},hives:[{id:'restored-hive',number:2}],families:[],records:[],tasks:[],extractions:[],layouts:{},auditLog:[],aiMessages:[]};
  await seedIndexedDb(db,[['main',previous,'state']]);
  const alerts=[];
  const deps={
   S:previous,
   db,STORE:'main',BACKUP_STORE:'backup',
   $:()=>({files:[{text:async()=>JSON.stringify({state:restored})}]}),
   confirm:()=>true,
   saveQueue:Promise.resolve(),
   readMain:loadFunction('readMain',{db,STORE:'main'}),
   validateBackupState:state=>state,
   assertRawBackupIntegrity:state=>state,
   migrateState:()=>false,
   uid:()=> 'restored-rev',
   logAudit(type){deps.S.auditLog.push({type})},
   validateVirtualApiary:()=>({errorCount:0,errors:[]}),
   writeMainWithBackup:loadFunction('writeMainWithBackup',{db,STORE:'main',BACKUP_STORE:'backup'}),
   lastPersistedRevision:null,
   autoBackupInfo:null,
   autoBackupRecovered:false,
   render:()=>{},
   alert:message=>alerts.push(message)
  };
  await loadFunction('restoreBackup',deps)();
  const saved=await readIndexedDb(db,'main','state');
  const backup=await readIndexedDb(db,'backup','previous');
  assert.equal(saved.meta.revisionId,'restored-rev');
  assert.equal(saved.hives[0].id,'restored-hive');
  assert.equal(saved.auditLog.at(-1).type,'backup_restored');
  assert.deepEqual(backup.state,previous,'the automatic backup must preserve the exact state replaced by restore');
  assert.equal(deps.lastPersistedRevision,'restored-rev');
  assert.equal(alerts.length,1);
  assert.match(alerts[0],/Архив восстановлен/i);
 }finally{db.close()}
});


test('AI chat preserves the reader scroll position and follows new messages only when already at the bottom',()=>{
 function hostAt(scrollTop){
  return {
   _html:'',scrollTop,scrollHeight:1000,clientHeight:200,onclick:null,
   set innerHTML(value){this._html=value;this.scrollHeight=1200},
   get innerHTML(){return this._html}
  };
 }
 const reading=hostAt(120);
 loadFunction('renderAIChat',{$:()=>reading,S:{aiMessages:[{role:'user',content:'Earlier message'}]},safe:String,renderAICommandPreview:()=>''})();
 assert.equal(reading.scrollTop,120,'rendering must not pull a reader away from older messages');
 const following=hostAt(790);
 loadFunction('renderAIChat',{$:()=>following,S:{aiMessages:[{role:'user',content:'Latest message'}]},safe:String,renderAICommandPreview:()=>''})();
 assert.equal(following.scrollTop,1200,'a reader already at the bottom should follow the updated conversation');
});


test('IndexedDB open rejects a blocked upgrade and closes a late connection',async()=>{
 const request={},fakeDb={objectStoreNames:{contains:()=>true},close(){this.closed=true}};
 const deps={DB:'paseka-test',STORE:'main',BACKUP_STORE:'backup',db:null,indexedDB:{open(){return request}}};
 const open=loadFunction('openDB',deps),pending=open();
 request.onblocked();
 await assert.rejects(pending,/занята другой вкладкой/i);
 request.result=fakeDb;request.onsuccess();
 assert.equal(fakeDb.closed,true);
 assert.equal(deps.db,null);
});

test('IndexedDB connection closes on versionchange so another tab can upgrade',async()=>{
 const request={},fakeDb={objectStoreNames:{contains:()=>true},close(){this.closed=true}};
 const deps={DB:'paseka-test',STORE:'main',BACKUP_STORE:'backup',db:null,indexedDB:{open(){return request}}};
 const pending=loadFunction('openDB',deps)();
 request.result=fakeDb;request.onsuccess();
 await pending;
 assert.equal(deps.db,fakeDb);
 fakeDb.onversionchange();
 assert.equal(fakeDb.closed,true);
 assert.equal(deps.db,null);
});


test('save reports snapshot preparation failures without throwing or queuing a partial save',async()=>{
 const state={meta:{},hives:[],families:[],records:[],tasks:[],extractions:[],layouts:{},snapshots:[]};
 const alerts=[];
 let queued=false;
 const save=loadFunction('save',{
  S:state,
  uid:()=> 'new-revision',
  structuredClone:()=>{throw new DOMException('unsupported value','DataCloneError')},
  saveQueue:Promise.resolve(),
  persistSnapshot:async()=>{queued=true;return true},
  render:()=>{},
  alert:message=>alerts.push(message)
 });
 const result=await save();
 assert.equal(result,false);
 assert.equal(queued,false,'invalid snapshot must never enter the persistence queue');
 assert.equal(state.snapshots.length,0,'failed snapshot preparation must not mutate snapshot history');
 assert.match(state.meta.saveError,/подготовить копию данных/);
 assert.equal(alerts.length,1);
});


test('save queue serializes snapshots and continues after a failed persistence attempt',async()=>{
 const state={meta:{},hives:[],families:[],records:[],tasks:[],extractions:[],layouts:{},snapshots:[]};
 const calls=[];let sequence=0,releaseFirst;
 const firstWrite=new Promise((resolve,reject)=>{releaseFirst={resolve,reject}});
 const save=loadFunction('save',{
  S:state,
  uid:()=> 'revision-'+(++sequence),
  saveQueue:Promise.resolve(),
  persistSnapshot:async snapshot=>{
   calls.push(snapshot.meta.revisionId);
   if(calls.length===1)await firstWrite;
   return true;
  },
  render:()=>{},
  alert:()=>{}
 });
 const first=save();
 const second=save();
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.deepEqual(calls,['revision-1'],'the second snapshot must wait for the first persistence attempt');
 releaseFirst.reject(new Error('simulated interrupted write'));
 await assert.rejects(first,/simulated interrupted write/);
 assert.equal(await second,true,'a failed earlier write must not poison the save queue');
 assert.deepEqual(calls,['revision-1','revision-2']);
});

test('voice parser recognizes explicit inspection-field commands without capturing ordinary questions',()=>{
 const parse=new Function(voiceParserSource+';return parseApiaryVoiceCommand;')();
 assert.deepEqual(parse('Пасека, слушай, заполни поля осмотра: матка обнаружена, яйца есть, занято 4 рамки.'),{
  type:'inspection_fields',text:'матка обнаружена, яйца есть, занято 4 рамки.'
 });
 assert.equal(parse('Пасека, слушай, какие семьи требуют внимания?').type,'question');
});
test('voice inspection fills only empty fields, preserves the source note and never saves',()=>{
 const nodes={
  rtext:{value:'Осмотр начат вручную.'},
  roccupancy:{value:'2'},rbrood:{value:''},rdrawn:{value:''},
  rqueen:{value:''},reggs:{value:''},rbroodPattern:{value:''},
  rqueenCells:{value:''},rswarmSigns:{value:''},
  aiJournalExtractNotice:{textContent:'',style:{display:'none'}}
 };
 const apply=loadFunction('applyVoiceInspectionFieldsToOpenRecord',{
  $:id=>nodes[id]||null,
  extractInspectionFieldsFromText:loadFunction('extractInspectionFieldsFromText')
 });
 const result=apply('Матка обнаружена, свежие яйца есть, расплод на 3 рамках, занято 5 рамок.');
 assert.equal(result.ok,true);
 assert.deepEqual(result.filled,['broodFrames','queen','eggs']);
 assert.deepEqual(result.skipped,['occupancy']);
 assert.equal(nodes.roccupancy.value,'2','existing field must not be overwritten');
 assert.equal(nodes.rbrood.value,'3');
 assert.equal(nodes.rqueen.value,'seen');
 assert.equal(nodes.reggs.value,'yes');
 assert.equal(nodes.rtext.value,['Осмотр начат вручную.','Матка обнаружена, свежие яйца есть, расплод на 3 рамках, занято 5 рамок.'].join('\n'));
 assert.match(nodes.aiJournalExtractNotice.textContent,/не изменены уже заполненные поля/i);
 assert.match(nodes.aiJournalExtractNotice.textContent,/не сохранена/);
});
test('voice inspection refuses an oversized note before changing any field',()=>{
 const nodes={rtext:{value:'x'.repeat(12000)},roccupancy:{value:''}};
 const apply=loadFunction('applyVoiceInspectionFieldsToOpenRecord',{
  $:id=>nodes[id]||null,
  extractInspectionFieldsFromText:loadFunction('extractInspectionFieldsFromText')
 });
 const result=apply('Занято 5 рамок.');
 assert.equal(result.reason,'note_limit');
 assert.equal(nodes.roccupancy.value,'');
 assert.equal(nodes.rtext.value.length,12000);
});

test('voice parser recognizes explicit feeding and treatment field commands',()=>{
 const parse=new Function(voiceParserSource+';return parseApiaryVoiceCommand;')();
 assert.deepEqual(parse('Пасека, слушай, заполни поля подкормки: корм: сироп, состав: сахар и вода, количество: 1 л.'),{
  type:'feeding_fields',text:'корм: сироп, состав: сахар и вода, количество: 1 л.'
 });
 assert.deepEqual(parse('Пасека, слушай, заполни поля обработки: препарат: Бипин, действующее вещество: амитраз.'),{
  type:'treatment_fields',text:'препарат: Бипин, действующее вещество: амитраз.'
 });
 assert.equal(parse('Пасека, слушай, сколько дать сиропа?').type,'question');
});
test('journal operation parser maps only explicitly labelled feeding values',()=>{
 const extract=new Function(voiceParserSource+';return extractJournalOperationFields;')();
 const result=extract('корм: сироп, состав: сахар и вода, количество: 1 л, концентрация: 1:1, способ подачи: внутренняя кормушка','feeding');
 assert.deepEqual(result.fields,{type:'сироп',substance:'сахар и вода',amount:'1 л',concentration:'1:1',method:'внутренняя кормушка'});
 assert.equal(result.fieldCount,5);
 assert.deepEqual(result.ambiguous,[]);
});
test('journal operation parser preserves treatment labels and validates control dates',()=>{
 const extract=new Function(voiceParserSource+';return extractJournalOperationFields;')();
 const result=extract('препарат: Бипин, действующее вещество: амитраз, способ применения: по инструкции, доза: только по этикетке, контроль: 20.11.2026','treatment');
 assert.deepEqual(result.fields,{product:'Бипин',active:'амитраз',method:'по инструкции',dose:'только по этикетке',check:'2026-11-20'});
 const invalid=extract('контроль: 31.02.2026','treatment');
 assert.deepEqual(invalid.fields,{});
 assert.deepEqual(invalid.ambiguous,['check']);
});
test('journal operation parser refuses conflicting duplicate labels',()=>{
 const extract=new Function(voiceParserSource+';return extractJournalOperationFields;')();
 const result=extract('количество: 1 л, количество: 2 л','feeding');
 assert.deepEqual(result.fields,{});
 assert.deepEqual(result.ambiguous,['amount']);
});
test('voice operation fields fill only empty inputs and retain original transcript without saving',()=>{
 const nodes={rtext:{value:'Осмотр завершён.'},rtreatmentProduct:{value:''},rtreatmentActive:{value:'старое значение'},rtreatmentMethod:{value:''},rtreatmentDose:{value:''},rtreatmentCheck:{value:''},aiJournalExtractNotice:{textContent:'',style:{display:'none'}}};
 const apply=loadFunction('applyVoiceOperationFieldsToOpenRecord',{
  $:id=>nodes[id]||null,
  extractJournalOperationFields:new Function(voiceParserSource+';return extractJournalOperationFields;')()
 });
 const result=apply('treatment','препарат: Бипин, действующее вещество: амитраз, доза: 1 мл');
 assert.deepEqual(result.filled,['product','dose']);
 assert.deepEqual(result.skipped,['active']);
 assert.equal(nodes.rtreatmentProduct.value,'Бипин');
 assert.equal(nodes.rtreatmentActive.value,'старое значение');
 assert.equal(nodes.rtreatmentDose.value,'1 мл');
 assert.equal(nodes.rtext.value,'Осмотр завершён.\\nпрепарат: Бипин, действующее вещество: амитраз, доза: 1 мл');
 assert.match(nodes.aiJournalExtractNotice.textContent,/не сохранена/);
});
test('voice operation refuses to mutate form when note would exceed limit',()=>{
 const nodes={rtext:{value:'x'.repeat(12000)},rfeedingType:{value:''}};
 const apply=loadFunction('applyVoiceOperationFieldsToOpenRecord',{
  $:id=>nodes[id]||null,
  extractJournalOperationFields:new Function(voiceParserSource+';return extractJournalOperationFields;')()
 });
 const result=apply('feeding','корм: сироп');
 assert.equal(result.reason,'note_limit');
 assert.equal(nodes.rfeedingType.value,'');
 assert.equal(nodes.rtext.value.length,12000);
});

test('treatment voice parser extracts label waiting period and batch without calculating them',()=>{
 const extract=new Function(voiceParserSource+';return extractJournalOperationFields;')();
 const result=extract('препарат: Название с упаковки, срок ожидания по этикетке: 14 дней, номер партии: АБ123','treatment');
 assert.deepEqual(result.fields,{product:'Название с упаковки',waiting:'14 дней',batch:'АБ123'});
 assert.deepEqual(result.ambiguous,[]);
});
test('treatment waiting period and batch fields preserve existing values',()=>{
 const nodes={rtext:{value:''},rtreatmentProduct:{value:''},rtreatmentWaiting:{value:'уже записано'},rtreatmentBatch:{value:''},aiJournalExtractNotice:{textContent:'',style:{display:'none'}}};
 const apply=loadFunction('applyVoiceOperationFieldsToOpenRecord',{
  $:id=>nodes[id]||null,
  extractJournalOperationFields:new Function(voiceParserSource+';return extractJournalOperationFields;')()
 });
 const result=apply('treatment','срок ожидания: 14 дней, партия: АБ123');
 assert.deepEqual(result.filled,['batch']);
 assert.deepEqual(result.skipped,['waiting']);
 assert.equal(nodes.rtreatmentWaiting.value,'уже записано');
 assert.equal(nodes.rtreatmentBatch.value,'АБ123');
});

test('feeding ledger groups repeated feedings by family and sums only identical explicit units',()=>{
 const build=loadFunction('buildFeedingLedger');
 const records=[
  {id:'a',type:'Подкормка',hive:'h1',family:'f1',date:'2026-10-01',feedingAmount:'1 л'},
  {id:'b',type:'Подкормка',hive:'h1',family:'f1',date:'2026-10-03',feedingAmount:'0,5 л'},
  {id:'c',type:'Подкормка',hive:'h1',family:'f1',date:'2026-10-04',feedingAmount:'500 мл'},
  {id:'d',type:'Подкормка',hive:'h1',family:'f2',date:'2026-10-02',feedingAmount:'2 кг'},
  {id:'e',type:'Подкормка',hive:'h1',date:'2026-10-05',feedingAmount:'количество уточнить'},
  {id:'f',type:'Подкормка',hive:'h2',family:'f1',date:'2026-10-06',feedingAmount:'99 л'},
  {id:'g',type:'Подкормка',hive:'h1',family:'f1',date:'2026-10-07',feedingAmount:'3 л',archivedAt:'2026-10-08'}
 ];
 const result=build(records,[{id:'f1',name:'Семья 1'},{id:'f2',name:'Семья 2'}],'h1');
 assert.equal(result.length,3);
 const f1=result.find(group=>group.familyId==='f1');
 assert.equal(f1.count,3);assert.equal(f1.latest,'2026-10-04');
 assert.deepEqual(f1.totals,[{unit:'л',amount:1.5,count:2},{unit:'мл',amount:500,count:1}]);
 assert.deepEqual(result.find(group=>group.familyId==='f2').totals,[{unit:'кг',amount:2,count:1}]);
 assert.equal(result.find(group=>group.familyId==='__unassigned__').unparsedCount,1);
});
test('feeding ledger preserves historical family names and never combines incompatible units',()=>{
 const build=loadFunction('buildFeedingLedger');
 const result=build([
  {type:'Подкормка',hive:'h1',family:'deleted',familyNameAtTime:'Старая семья',date:'2026-09-01',feedingAmount:'1 л'},
  {type:'Подкормка',hive:'h1',family:'deleted',familySnapshotAtTime:{name:'Снимок семьи'},date:'2026-09-02',feedingAmount:'250 мл'}
 ],[],'h1');
 assert.equal(result[0].name,'Старая семья');
 assert.deepEqual(result[0].totals,[{unit:'л',amount:1,count:1},{unit:'мл',amount:250,count:1}]);
});

test('feeding task completion records actual quantity separately from planned quantity',async()=>{
 const task={id:'t-feed',hive:'h1',type:'Подкормка',status:'pending',note:'Выдать семье корм',plannedFeedingAmount:'2 л',plannedFeedingType:'Сироп',plannedFeedingSubstance:'Сахар и вода',plannedFeedingConcentration:'1:1',plannedFeedingMethod:'Внутренняя кормушка'};
 const state={hives:[{id:'h1'}],tasks:[task],records:[],auditLog:[],snapshots:[],meta:{}};let saved=0;
 const complete=loadFunction('completeTask',{S:state,uid:()=> 'record-feed',today:()=> '2026-11-13',prompt:()=> '1,5 л',validateTaskCompletion:loadFunction('validateTaskCompletion'),logAudit:(type,details)=>state.auditLog.push({type,...details}),save:async()=>{saved++;return true},render:()=>{},alert:()=>{}});
 assert.equal(await complete('t-feed'),true);assert.equal(saved,1);assert.equal(task.status,'done');assert.equal(state.records.length,1);
 assert.equal(state.records[0].feedingAmount,'1,5 л');assert.equal(state.records[0].plannedFeedingAmount,'2 л');assert.equal(state.records[0].feedingType,'Сироп');assert.equal(state.records[0].feedingSubstance,'Сахар и вода');
 assert.equal(state.auditLog[0].plannedFeedingAmount,'2 л');assert.equal(state.auditLog[0].actualFeedingAmount,'1,5 л');
});
test('canceling feeding task completion leaves task and journal untouched',async()=>{
 const task={id:'t-feed',hive:'h1',type:'Подкормка',status:'pending',plannedFeedingAmount:'2 л'};
 const state={hives:[{id:'h1'}],tasks:[task],records:[],auditLog:[],snapshots:[],meta:{}};let saves=0;
 const complete=loadFunction('completeTask',{S:state,uid:()=> 'record-feed',today:()=> '2026-11-13',prompt:()=>null,validateTaskCompletion:loadFunction('validateTaskCompletion'),logAudit:(type,details)=>state.auditLog.push({type,...details}),save:async()=>{saves++;return true},render:()=>{},alert:()=>{}});
 assert.equal(await complete('t-feed'),false);assert.equal(task.status,'pending');assert.equal(state.records.length,0);assert.equal(state.auditLog.length,0);assert.equal(saves,0);
});
test('non-feeding task completion does not request a feeding quantity',async()=>{
 const task={id:'t-inspect',hive:'h1',type:'Осмотр',status:'pending',note:'Проверить'};
 const state={hives:[{id:'h1'}],tasks:[task],records:[],auditLog:[],snapshots:[],meta:{}};let prompts=0;
 const complete=loadFunction('completeTask',{S:state,uid:()=> 'record-inspect',today:()=> '2026-11-13',prompt:()=>{prompts++;return 'x'},validateTaskCompletion:loadFunction('validateTaskCompletion'),logAudit:(type,details)=>state.auditLog.push({type,...details}),save:async()=>true,render:()=>{},alert:()=>{}});
 assert.equal(await complete('t-inspect'),true);assert.equal(prompts,0);
});

test('feeding quantity parser accepts explicit decimal amounts and rejects unknown or malformed units',()=>{
 const parse=loadFunction('parseFeedingQuantity');
 assert.deepEqual(parse('1,5 л'),{amount:1.5,unit:'л'});
 assert.deepEqual(parse('250 миллилитров'),{amount:250,unit:'мл'});
 assert.deepEqual(parse('2 килограмма'),{amount:2,unit:'кг'});
 assert.equal(parse('около литра'),null);
 assert.equal(parse('-1 л'),null);
 assert.equal(parse('1 л примерно'),null);
});
test('feeding plan comparison calculates only same-unit completed task differences',()=>{
 const parse=loadFunction('parseFeedingQuantity');
 const build=loadFunction('buildFeedingPlanComparison',{parseFeedingQuantity:parse});
 const records=[
  {id:'a',taskId:'ta',type:'Подкормка',hive:'h1',date:'2026-11-01',plannedFeedingAmount:'2 л',feedingAmount:'2 л'},
  {id:'b',taskId:'tb',type:'Подкормка',hive:'h1',date:'2026-11-02',plannedFeedingAmount:'2 л',feedingAmount:'1,5 л'},
  {id:'c',taskId:'tc',type:'Подкормка',hive:'h1',date:'2026-11-03',plannedFeedingAmount:'1 л',feedingAmount:'1,5 л'},
  {id:'d',taskId:'td',type:'Подкормка',hive:'h1',date:'2026-11-04',plannedFeedingAmount:'1 кг',feedingAmount:'500 г'},
  {id:'e',taskId:'te',type:'Подкормка',hive:'h1',date:'2026-11-05',plannedFeedingAmount:'3 л',feedingAmount:''},
  {id:'f',taskId:'tf',type:'Подкормка',hive:'h1',date:'2026-11-06',plannedFeedingAmount:'',feedingAmount:'1 л'},
  {id:'g',taskId:'tg',type:'Подкормка',hive:'h1',date:'2026-11-07',plannedFeedingAmount:'около литра',feedingAmount:'1 л'},
  {id:'manual',type:'Подкормка',hive:'h1',date:'2026-11-08',feedingAmount:'10 л'},
  {id:'archived',taskId:'th',type:'Подкормка',hive:'h1',date:'2026-11-09',plannedFeedingAmount:'1 л',feedingAmount:'1 л',archivedAt:'2026-11-10'},
  {id:'other',taskId:'ti',type:'Подкормка',hive:'h2',date:'2026-11-10',plannedFeedingAmount:'1 л',feedingAmount:'1 л'}
 ];
 const result=build(records,'h1');
 assert.equal(result.events.length,7);
 assert.deepEqual(result.summary,{matched:1,over:1,under:1,notMeasured:1,planMissing:1,unitMismatch:1,unparsed:1,duplicateTask:0});
 assert.deepEqual(result.totals,[{unit:'л',planned:5,actual:5,difference:0,count:3}]);
 assert.equal(result.events[0].id,'g','events are ordered newest first');
 assert.equal(result.events.find(event=>event.id==='b').difference,-0.5);
 assert.equal(result.events.find(event=>event.id==='c').difference,0.5);
 assert.equal(result.events.find(event=>event.id==='d').status,'unitMismatch');
 assert.equal(result.events.find(event=>event.id==='e').status,'notMeasured');
 assert.equal(result.events.find(event=>event.id==='f').status,'planMissing');
});

test('feeding plan comparison flags every duplicate task record and excludes them from totals',()=>{
 const parse=loadFunction('parseFeedingQuantity');
 const build=loadFunction('buildFeedingPlanComparison',{parseFeedingQuantity:parse});
 const records=[
  {id:'dup-a',taskId:'same-task',type:'Подкормка',hive:'h1',date:'2026-11-11',plannedFeedingAmount:'2 л',feedingAmount:'2 л'},
  {id:'dup-b',taskId:'same-task',type:'Подкормка',hive:'h1',date:'2026-11-12',plannedFeedingAmount:'2 л',feedingAmount:'3 л'},
  {id:'unique',taskId:'unique-task',type:'Подкормка',hive:'h1',date:'2026-11-13',plannedFeedingAmount:'1 л',feedingAmount:'1,5 л'}
 ];
 const result=build(records,'h1');
 assert.equal(result.events.length,3);
 assert.equal(result.summary.duplicateTask,2);
 assert.equal(result.summary.over,1);
 assert.equal(result.summary.matched,0);
 assert.deepEqual(result.totals,[{unit:'л',planned:1,actual:1.5,difference:0.5,count:1}]);
 assert.ok(result.events.filter(event=>event.taskId==='same-task').every(event=>event.status==='duplicateTask'));
});

test('feeding ledger preserves duplicate task records in history but excludes them from totals',()=>{
 const build=loadFunction('buildFeedingLedger');
 const result=build([
  {id:'dup-a',taskId:'same-task',type:'Подкормка',hive:'h1',family:'f1',date:'2026-11-10',feedingAmount:'2 л'},
  {id:'dup-b',taskId:'same-task',type:'Подкормка',hive:'h1',family:'f1',date:'2026-11-11',feedingAmount:'3 л'},
  {id:'unique',taskId:'unique-task',type:'Подкормка',hive:'h1',family:'f1',date:'2026-11-12',feedingAmount:'1,5 л'},
  {id:'other-hive',taskId:'same-task',type:'Подкормка',hive:'h2',family:'f1',date:'2026-11-12',feedingAmount:'99 л'}
 ],[{id:'f1',name:'Семья 1'}],'h1');
 assert.equal(result.length,1);
 const group=result[0];
 assert.equal(group.count,3,'all records remain visible in history');
 assert.equal(group.duplicateCount,2);
 assert.deepEqual(group.duplicateTaskIds,['same-task']);
 assert.deepEqual(group.totals,[{unit:'л',amount:1.5,count:1}]);
 assert.deepEqual(group.events.map(event=>event.id),['unique','dup-b','dup-a']);
});

test('profile assembly validates dynamic brood and honey frame registries',()=>{
 const validateProfile=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const get=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validateProfile,cloneHiveProfile:clone});
 const validate=loadFunction('validateHiveAssemblyProfile',{getHiveProfileCapabilities:get});
 const profile={id:'custom-v1',schemaVersion:1,status:'ready',name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:2,framesPerBox:2,boxKeys:['B1','B2']},honey:{boxCount:1,framesPerBox:1,boxKeys:['M1'],installation:'independent'},winter:{enabled:false}};
 const good={mode:'summer',installedBoxes:['B1','B2'],honeyBoxInstalled:[true],boxes:{B1:{family:'',frames:[{frameId:'f1',location:'B1',history:[]}]},B2:{family:'',frames:[{frameId:'f2',location:'B2',history:[]},{frameId:'f3',location:'B2',history:[]}]}},honeyFrames:[[{frameId:'f4',location:'M1',history:[]}]]};
 assert.deepEqual(validate(profile,good),{ok:true,errors:[]});
 const bad=structuredClone(good);
 bad.boxes.B2.frames[0].frameId='f1';
 bad.boxes.B2.frames[1].location='B1';
 bad.honeyFrames[0].push({frameId:'f5',location:'M1',history:[]});
 const result=validate(profile,bad);
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(error=>error.code==='duplicate_frame_id'));
 assert.ok(result.errors.some(error=>error.code==='frame_location_mismatch'));
 assert.ok(result.errors.some(error=>error.code==='honey_box_over_capacity'));
});

test('family transfer targets follow each hive profile keys and winter restrictions',()=>{
 const keys=loadFunction('familyTransferBoxKeys');
 const targets=loadFunction('familyTransferTargets',{familyTransferBoxKeys:keys,familyTransferWinterKeys:loadFunction('familyTransferWinterKeys')});
 const profile={brood:{boxKeys:['A','B','C','D']},winter:{allowedBoxKeys:['A','C']}};
 const summer={mode:'summer',installedBoxes:['A','B','C'],boxes:{A:{family:''},B:{family:'f1'},C:{family:''},D:{family:''}}};
 assert.deepEqual(targets(profile,summer),['A','C']);
 const winter={mode:'winter',winterOrder:['A','B','C'],installedBoxes:['A','B','C'],boxes:summer.boxes};
 assert.deepEqual(targets(profile,winter),['A','C']);
 assert.deepEqual(keys({brood:{boxKeys:['Корпус-01','X2']}}),['Корпус-01','X2']);
});


test('Varroa journal is integrated as a phone-only offline section with migration and backup support',()=>{
 assert.match(html,/data-tab="varroa"/);
 assert.match(html,/id="varroaForm"/);
 assert.match(html,/id="varroaHive"/);
 assert.match(html,/id="varroaType"/);
 assert.match(html,/PasekaVarroa\.buildVarroaObservation/);
 assert.match(html,/S\.meta\.schemaVersion=10/);
 assert.match(html,/varroaObservations/);
 assert.match(html,/PasekaVarroa\.inspectVarroaIntegrity/);
});
test('schema 9 migration creates an empty Varroa section and does not alter existing apiary data',()=>{
 const state={meta:{schemaVersion:9},hives:[{id:'h1',number:1,profileId:'farrar-6x6-v1'}],families:[],records:[],tasks:[],extractions:[],snapshots:[],layouts:{},auditLog:[],aiMessages:[],queens:[],queenEvents:[],equipmentLabels:{bodies:{}},equipmentInventory:{bodies:{},events:[]}};
 const migrate=loadFunction('migrateState',{S:state,uid:()=> 'varroa-migration-id',layoutFor:()=>({}),frameArray:()=>[]});
 assert.equal(migrate(),true);
 assert.equal(state.meta.schemaVersion,12);
 assert.deepEqual(state.varroaObservations,[]);
 assert.deepEqual(state.pesticideIncidents,[]);
 assert.equal(migrate(),false);
});


test('pesticide incident dossier is integrated with smartphone capture, local state, backup and migration',()=>{
 assert.match(html,/data-tab="incidents"/);
 assert.match(html,/id="incidentForm"/);
 assert.match(html,/capture="environment"/);
 assert.match(html,/captureIncidentLocation\(\)/);
 assert.match(html,/PasekaIncident\.buildPesticideIncidentDraft/);
 assert.match(html,/PasekaIncident\.inspectPesticideIncidentIntegrity/);
 assert.match(html,/S\.meta\.schemaVersion=12/);
 assert.match(html,/pesticideIncidents/);\n assert.match(html,/deadoutReviews/);\n assert.match(html,/PasekaDeadout\.inspectDeadoutIntegrity/);
});
test('schema 11 migration creates an empty deadout section and preserves existing incident and Varroa records',()=>{
 const state={meta:{schemaVersion:11},hives:[{id:'h1',number:1,profileId:'farrar-6x6-v1'}],families:[],records:[],tasks:[],extractions:[],snapshots:[],layouts:{},auditLog:[],aiMessages:[],queens:[],queenEvents:[],equipmentLabels:{bodies:{}},equipmentInventory:{bodies:{},events:[]},varroaObservations:[{id:'v1'}],pesticideIncidents:[{id:'p1'}]};
 const migrate=loadFunction('migrateState',{S:state,uid:()=> 'incident-migration-id',layoutFor:()=>({}),frameArray:()=>[]});
 assert.equal(migrate(),true);assert.equal(state.meta.schemaVersion,12);assert.deepEqual(state.deadoutReviews,[]);assert.deepEqual(state.pesticideIncidents,[{id:'p1'}]);assert.deepEqual(state.varroaObservations,[{id:'v1'}]);assert.equal(migrate(),false);
});
