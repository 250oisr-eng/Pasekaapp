import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const begin=html.indexOf('async function finishProfileAssemblySetup(');
const end=html.indexOf('function renderStructure(){',begin);
assert.ok(begin>=0&&end>begin,'configured-profile save function must exist');
const source=html.slice(begin,end);

function fixture(saveImpl,validation={ok:true,errors:[]},wasComplete=false){
 const S={meta:{schemaVersion:15,revisionId:'original-revision',updatedAt:'2026-11-19T00:00:00.000Z'},
  auditLog:[{id:'previous-event',type:'previous'}],snapshots:[{at:'original-backup'}]};
 const layout={mode:'summer',installedBoxes:['B1'],winterOrder:[],
  honeyBoxInstalled:[true,true,false,false],setupComplete:wasComplete,setupEditing:true};
 const selectedBefore=structuredClone(layout),snapshotsBefore=S.snapshots;
 const alerts=[],renders=[],logs=[];
 let assemblyEditSnapshot={hiveId:'h1',installedBoxes:['B1'],honeyBoxInstalled:[false,false,false,false]};
 let count=0;
 const logAudit=(type,details)=>{
  const id='new-assembly-event-'+(++count);
  S.auditLog.push({id,type,...details});logs.push(id);
 };
 const save=()=>saveImpl(S);
 const {run,getSnapshot}=new Function('validateHiveAssemblyProfile','S','logAudit','save','renderStructure','alert','initialSnapshot',
  'let assemblyEditSnapshot=initialSnapshot;\n'+source+
  '\nreturn {run:finishProfileAssemblySetup,getSnapshot:()=>assemblyEditSnapshot};')(
  ()=>validation,S,logAudit,save,()=>renders.push(structuredClone(layout)),m=>alerts.push(m),assemblyEditSnapshot);
 return {S,layout,selectedBefore,snapshotsBefore,alerts,renders,logs,run:()=>run('h1',layout,{id:'configured-hive'}) ,getSnapshot};
}

test('configured assembly completes only after acknowledged save',async()=>{
 const f=fixture(async S=>{
  S.meta.revisionId='persisted-new-revision';
  S.snapshots=[{at:'after-success'}];
  return true;
 });
 assert.equal(await f.run(),true);
 assert.equal(f.layout.setupComplete,true);
 assert.equal(f.layout.setupEditing,false);
 assert.equal(f.S.auditLog.length,2);
 assert.equal(f.S.auditLog.at(-1).type,'assembly_configured');
 assert.equal(f.getSnapshot(),null);
 assert.equal(f.renders.length,1);
 assert.deepEqual(f.alerts,[]);
});

test('false save restores editable assembly, original revision and audit with selected bodies intact',async()=>{
 const f=fixture(async S=>{
  S.meta.revisionId='unsaved-revision';
  S.meta.updatedAt='2026-11-20T00:00:00.000Z';
  S.meta.saveError='Недостаточно места';
  S.snapshots=[{at:'unsaved-snapshot'}];
  return false;
 });
 const originalAudit=structuredClone(f.S.auditLog);
 assert.equal(await f.run(),false);
 assert.deepEqual(f.layout,f.selectedBefore,'valid selected bodies must remain editable');
 assert.deepEqual(f.S.auditLog,originalAudit,'failed save must not create a false completion event');
 assert.equal(f.S.meta.revisionId,'original-revision');
 assert.equal(f.S.meta.updatedAt,'2026-11-19T00:00:00.000Z');
 assert.equal(f.S.meta.saveError,'Недостаточно места');
 assert.strictEqual(f.S.snapshots,f.snapshotsBefore);
 assert.equal(f.getSnapshot().hiveId,'h1','cancel/edit snapshot remains active');
 assert.equal(f.renders.length,1);
});

test('thrown save keeps editable selection and does not remove unrelated audit events',async()=>{
 const f=fixture(async S=>{
  S.auditLog.push({id:'independent-concurrent-event',type:'other'});
  S.meta.revisionId='unsaved-revision';
  throw new Error('IndexedDB write failed');
 },{ok:true,errors:[]},true);
 assert.equal(await f.run(),false);
 assert.equal(f.layout.setupComplete,true,'existing completed setup remains completed');
 assert.equal(f.layout.setupEditing,true);
 assert.deepEqual(f.S.auditLog.map(x=>x.id),['previous-event','independent-concurrent-event']);
 assert.equal(f.S.meta.revisionId,'original-revision');
 assert.equal(f.alerts.length,1);
 assert.match(f.alerts[0],/Не удалось сохранить комплектацию/);
 assert.equal(f.getSnapshot().hiveId,'h1');
});

test('invalid profile selection must not attempt persistence or append history',async()=>{
 let saves=0;
 const f=fixture(async()=>{saves++;return true},{ok:false,errors:[{code:'honey_pair_mismatch'}]});
 assert.equal(await f.run(),false);
 assert.equal(saves,0);
 assert.deepEqual(f.layout,f.selectedBefore);
 assert.deepEqual(f.S.auditLog.map(x=>x.id),['previous-event']);
 assert.match(f.alerts[0],/honey_pair_mismatch/);
});
