import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
async function load(path){
 const source=await readFile(new URL('../js/'+path,import.meta.url),'utf8');
 const root={};
 new Function('window',source)(root);
 return root;
}
const entrance=(await load('entrance-analysis.js')).PasekaEntranceAnalysis;
const evidence=(await load('video-model-evidence.js')).PasekaVideoModelEvidence;
const pipeline=(await load('video-observation-pipeline.js')).PasekaVideoObservationPipeline;
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('no queue flags, model draft or server claims can authorize original video deletion',async()=>{
 const forged={id:'v1',status:'analyzing',resultPersisted:true,
  serverDeleteConfirmed:true,cleanupAuthorized:true};
 assert.equal(entrance.transitionVideoQueue(forged,'completed',forged).reason,'recognition_evidence_required');
 assert.equal(entrance.canDeleteVideoOriginal({...forged,status:'completed'}),false);
 const fake={source:{source:'entrance_media',videoId:'v1',sourceSha256:'a'.repeat(64),sourceBytes:5},
  model:{id:'bee-model',version:'v1',weightsSha256:'b'.repeat(64),execution:'on_device'},
  frames:[{atSec:1,width:640,height:360,mimeType:'image/jpeg'},
    {atSec:2,width:640,height:360,mimeType:'image/jpeg'}],
  tracks:[]};
 const drafted=evidence.validateDraft(fake);
 assert.equal(drafted.ok,true);
 assert.equal(drafted.recognitionSucceeded,false);
 assert.equal(drafted.cleanupAuthorized,false);
 const bad=pipeline.runObservationDraft(null,null);
 const out=await bad;
 assert.equal(out.recognitionSucceeded,false);assert.equal(out.cleanupAuthorized,false);
});
test('real entrance delete API never opens an IndexedDB transaction',async()=>{
 const start=html.indexOf('function deleteEntranceVideoBlob(id){');
 const end=html.indexOf('function entranceBytes(',start);
 assert.ok(start>=0&&end>start);
 const code=html.slice(start,end);
 const operations=[];
 const deletion=new Function('db','Promise',code+';return deleteEntranceVideoBlob;')(
   {transaction(...a){operations.push(a);throw Error('unsafe write')}},Promise);
 for(const id of ['v1','completed','legacy','']){
  await assert.rejects(deletion(id),e=>e?.code==='ENTRANCE_VIDEO_DELETE_BLOCKED');
 }
 assert.equal(operations.length,0);
});
test('video source cannot be replaced through queue metadata before any hypothetical inference',()=>{
 const bytes=new Blob(['video'],{type:'video/mp4'});
 const original={id:'v1',status:'waiting_for_server',blob:bytes,bytes:bytes.size,blobSha256:'a'.repeat(64)};
 const newValue=entrance.transitionVideoQueue(original,'uploading',{
  id:'other',blob:new Blob(['other']),bytes:8,blobSha256:'b'.repeat(64),
  cleanupAuthorized:true,resultPersisted:true});
 assert.equal(newValue.ok,true);
 for(const key of ['id','bytes','blobSha256','blob'])
  assert.equal(newValue.record[key],original[key]);
 assert.equal(newValue.record.cleanupAuthorized,undefined);
 assert.equal(newValue.record.resultPersisted,undefined);
});
test('only actual source-preserving staging APIs exist; no auto-cleanup can be wired silently',async()=>{
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 const modules=['entrance-frame-preparation.js','video-model-evidence.js','video-observation-pipeline.js'];
 for(const module of modules){
  assert.doesNotMatch(html,new RegExp('src="[.]\\/js\\/'+module.replaceAll('.','[.]')+'"'));
  assert.doesNotMatch(sw,new RegExp(module.replaceAll('.','[.]')));
 }
 assert.match(html,/ENTRANCE_VIDEO_DELETE_BLOCKED/);
 assert.match(html,/Удаление заблокировано/);
});
