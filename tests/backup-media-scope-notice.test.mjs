import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function extract(start,end){
 const a=html.indexOf(start),z=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&z>a,'expected original production function: '+start);
 return html.slice(a,z);
}
const exportSource=extract('async function downloadBackup(){','function validateBackupState(state){');
const jsonRestoreSource=extract('async function restoreBackup(){','async function restoreAutoBackup(){');
const autoRestoreSource=extract('async function restoreAutoBackup(){','async function deleteAllData(){');

test('manual JSON backup clearly excludes separate entrance video originals',()=>{
 assert.match(html, /Ручной JSON-архив/);
 assert.match(html, /не содержит оригиналы видео летков/);
 assert.match(html, /Скачать JSON \(без видео летков\)/);
 assert.match(jsonRestoreSource, /Оригиналы видео летков в JSON не входят/);
 assert.match(autoRestoreSource, /Оригиналы видео летков из отдельного хранилища этим действием НЕ восстанавливаются/);
 assert.match(html, /Локальная автокопия журнала:/);
});

test('actual manual backup serializes journal state only, without touching separate entrance media',async()=>{
 const state={
  meta:{schemaVersion:15,revisionId:'rev1'},
  hives:[{id:'hive1',number:1}],families:[],records:[{id:'rec1',media:[{name:'inspection-image'}]}],
  sectionalTechProcesses:[{id:'tech1',state:{operations:[{operationId:'OP-07-HONEY-PAIR-ADD',status:'DONE'}]}}],
  equipmentInventory:{bodies:{h3:{frames:[{frameId:'f3'}]},h4:{frames:[{frameId:'f4'}]}}}
 };
 const entranceMedia=[{id:'video1',blob:new Blob(['separate original video'])}];
 const before=structuredClone(state),priorVideos=entranceMedia.slice();
 let downloaded,clicked=false,released=false;
 const link={set href(value){this._href=value},get href(){return this._href},
  set download(value){this._download=value},get download(){return this._download},
  click(){clicked=true},remove(){}};
 const document={createElement(tag){assert.equal(tag,'a');return link},
  body:{appendChild(element){assert.strictEqual(element,link)}}};
 const mockURL={createObjectURL(blob){downloaded=blob;return 'blob:test-archive'},
  revokeObjectURL(url){assert.equal(url,'blob:test-archive');released=true}};
 const run=new Function('saveQueue','S','confirm','document','URL','Blob','today','setTimeout',
  exportSource+'\nreturn downloadBackup;')(
  Promise.resolve(),state,()=>{throw Error('unexpected confirmation')},
  document,mockURL,Blob,()=> '2026-11-20',callback=>callback());
 await run();
 assert.equal(clicked,true);
 assert.equal(released,true);
 assert.match(link.download,/^paseka-backup-2026-11-20\.json$/);
 const exported=JSON.parse(await downloaded.text());
 assert.equal(exported.app,'Paseka');
 assert.deepEqual(exported.state,before);
 assert.deepEqual(exported.state.sectionalTechProcesses,before.sectionalTechProcesses);
 assert.equal(exported.state.entrance_media,undefined);
 assert.deepEqual(entranceMedia,priorVideos,'export must not mutate separate video store');
});

test('manual archive with unsaved state requests explicit confirmation',async()=>{
 const state={meta:{saveError:'storage error'},hives:[],families:[],records:[]};
 let confirms=0,downloads=0;
 const run=new Function('saveQueue','S','confirm','document','URL','Blob','today','setTimeout',
   exportSource+'\nreturn downloadBackup;')(
   Promise.resolve(),state,()=>{confirms++;return false},
   {createElement(){downloads++;throw Error('must not download')}},
   {createObjectURL(){downloads++;throw Error('must not download')}},
   Blob,()=>'2026-11-20',()=>{});
 await run();
 assert.equal(confirms,1);assert.equal(downloads,0);
});
