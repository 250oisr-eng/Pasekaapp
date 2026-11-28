import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';

// Isolated storage-contract journey. This is not a browser UI or physical OnePlus E2E test.
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
const factory=new IDBFactory();
function extract(name){
 const start=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(').exec(html);
 assert(start,'missing application function '+name);
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=start.index+start[0].length;
 return html.slice(start.index,next.exec(html)?.index??html.indexOf('</script>',start.index));
}
function fn(name,deps){return new Function('deps','with(deps){return ('+extract(name)+');}')(deps)}
function open(){
 return new Promise((resolve,reject)=>{
  const q=factory.open('first-use-e2e-fixture',3);
  q.onupgradeneeded=()=>{
   const db=q.result;
   db.createObjectStore('main');
   db.createObjectStore('full_backup');
   db.createObjectStore('entrance_media',{keyPath:'id'});
  };
  q.onsuccess=()=>resolve(q.result);
  q.onerror=()=>reject(q.error);
 });
}
function read(db,key='state'){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('main','readonly');
  const q=tx.objectStore('main').get(key);
  q.onsuccess=()=>resolve(q.result);
  q.onerror=()=>reject(q.error);
 });
}
test('first-use storage journey: fresh database -> hive -> family -> journal -> persist -> reopen offline',async()=>{
 let db=await open();
 const gate={ready:true};
 const deps={db,STORE:'main',startupWriteGate:gate};
 deps.rejectWhileStartupNotReady=fn('rejectWhileStartupNotReady',deps);
 const write=fn('write',deps);
 const validate=fn('validateJournalRecordDraft',deps);
 assert.equal(await read(db),undefined,'empty database must have no invented live hive');

 // Synthetic fixtures are never written to any production database or device.
 const hive={id:'synthetic-hive-01',number:1,profileId:'farrar-6x6-v1'};
 const family={id:'synthetic-family-01',hive:hive.id,name:'TEST-01',origin:'family',stage:'independent'};
 const record={id:'synthetic-entry-01',date:'2026-11-24',type:'Заметка',
  hive:hive.id,family:family.id,text:'Synthetic first-use journal entry',media:[]};
 const state={meta:{schemaVersion:15,revisionId:'synthetic-rev-1'},
  hives:[hive],families:[family],records:[],snapshots:[],extractions:[],tasks:[]};
 assert.equal(validate(record,state).ok,true);
 assert.equal(validate({...record,family:'other-family'},state).ok,false,
  'a journal entry cannot reference a family outside the hive');
 state.records.push(record);
 await write(state);
 const first=await read(db);
 assert.equal(first.records[0].text,record.text,'write must complete before visible success');
 db.close();

 // Reopen the same locally persisted database with no network service or fetch mock.
 db=await open();
 const reopened=await read(db);
 assert.equal(reopened.hives.length,1);
 assert.equal(reopened.families.length,1);
 assert.equal(reopened.records.length,1);
 assert.equal(reopened.records[0].hive,reopened.hives[0].id);
 assert.equal(reopened.records[0].family,reopened.families[0].id);
 assert.equal(validate(reopened.records[0],reopened,reopened.records[0]).ok,true,'saved record is checked as existing, not a duplicate insertion');
 deps.db=db;
 gate.ready=false;
 await assert.rejects(write({...reopened,records:[]}),{name:'PasekaStartupBlockedError'});
 assert.equal((await read(db)).records.length,1,'blocked startup cannot erase saved journal');
 gate.ready=true;
 const offlineNote={...record,id:'synthetic-offline-entry-02',text:'Offline entry'};
 const update={...reopened,records:[...reopened.records,offlineNote]};
 assert.equal(validate(offlineNote,reopened).ok,true);
 await fn('write',deps)(update);
 db.close();
 db=await open();
 assert.deepEqual((await read(db)).records.map(r=>r.id),
  ['synthetic-entry-01','synthetic-offline-entry-02']);
 db.close();
});
test('offline shell contains the journal entry point and local modules',()=>{
 assert.match(sw,/\.\/index\.html/);
 assert.match(sw,/\.\/js\/hive-model\.js/);
 assert.match(sw,/await cache\.put\(asset\.href,response\)/);
 assert.match(sw,/cache\.match\('\.\/index\.html'\)/);
 // Offline availability on an actual WebView still needs an installed APK/device proof.
});
