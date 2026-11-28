import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const constants=html.match(/const FRAME_TYPES=[^\n]+;\nconst FRAME_STATUSES=[^\n]+;/)[0];
const helpers=html.slice(html.indexOf('function frameStatusName('),html.indexOf('function renderFrameEditor('));
const sync=html.slice(html.indexOf('function syncFrameType('),html.indexOf('async function swapPhysicalCorpora('));
const commit=html.slice(html.indexOf('function commitFrameEdit('),html.indexOf('function chooseFrame('));
function fixture(type='foundation',status='foundation'){
 const frame={type,status,note:'old',frameId:'11',history:[]},events=[],alerts=[];
 const select={value:status,_html:'',set innerHTML(value){this._html=value;this.value=value.match(/value="([^"]*)" selected/)?.[1]??value.match(/value="([^"]*)"/)?.[1]??'';},get innerHTML(){return this._html}};
 const fields={frameType:{value:type},frameStatus:select,frameNote:{value:'old'},frameStatusWarning:{textContent:''}};
 const api=new Function('$','layoutFor','selectedStructureHive','frameArray','PasekaLabels','logAudit','alert',constants+'\n'+helpers+'\n'+sync+'\n'+commit+'\nlet editingBox="1",editingFrame=0;return {allowedFrameStatuses,isFrameStatusAllowed,frameStatusOptions,syncFrameType,syncFrameStatus,commitFrameEdit,FRAME_STATUSES};')(id=>fields[id],()=>({}),()=> 'h1',()=>[frame],{appendFrameEvent:(x,action,data)=>x.history.push({action,...data})},(...x)=>events.push(x),x=>alerts.push(x));
 return {frame,fields,api,events,alerts};
}
test('foundation and strip permit only foundation; comb permits all statuses except foundation',()=>{
 const {api}=fixture();
 for(const type of ['foundation','strip'])assert.deepEqual(api.allowedFrameStatuses(type).map(x=>x[0]),['foundation']);
 assert.deepEqual(api.allowedFrameStatuses('comb'),api.FRAME_STATUSES.filter(x=>x[0]!=='foundation'));
 for(const type of ['foundation','strip','comb','unknown'])for(const [id] of api.FRAME_STATUSES)
  assert.equal(api.isFrameStatusAllowed(type,id),(type==='comb'&&id!=='foundation')||(['foundation','strip'].includes(type)&&id==='foundation'));
 assert.equal(api.isFrameStatusAllowed('comb','invented'),false);
});
test('switching from comb with honey or brood to either foundation type resets status and options',()=>{
 for(const type of ['foundation','strip'])for(const old of ['nectar','eggs','brood-sealed','sealed','damaged']){
  const {api,fields,frame}=fixture('comb',old);
  fields.frameType.value=type;api.syncFrameType();
  assert.equal(fields.frameStatus.value,'foundation');
  assert.equal((fields.frameStatus.innerHTML.match(/<option/g)||[]).length,1);
  assert.equal(api.commitFrameEdit(),true);
  assert.equal(frame.type,type);assert.equal(frame.status,'foundation');assert.equal(frame.history.length,1);
 }
});
test('switch to comb restores every non-foundation status and changing status never silently changes type',()=>{
 const {api,fields,frame}=fixture('strip','foundation');
 fields.frameType.value='comb';api.syncFrameType();
 assert.equal(fields.frameStatus.value,'drawn');
 assert.equal((fields.frameStatus.innerHTML.match(/<option/g)||[]).length,10);
 for(const [id] of api.allowedFrameStatuses('comb')){
  fields.frameStatus.value=id;api.syncFrameStatus();assert.equal(fields.frameType.value,'comb');assert.equal(api.commitFrameEdit(),true);assert.equal(frame.status,id);
 }
});
test('invalid programmatic combination is rejected before frame, audit or history mutation',()=>{
 const {api,fields,frame,events,alerts}=fixture();
 const previous=structuredClone(frame);
 fields.frameStatus.value='brood-sealed';
 assert.equal(api.commitFrameEdit(),false);
 assert.deepEqual(frame,previous);assert.deepEqual(events,[]);assert.equal(alerts.length,1);
});
test('legacy inconsistent frame requires explicit correction, not silent normalization',()=>{
 const {api,fields,frame}=fixture('strip','sealed');
 const options=api.frameStatusOptions(frame.type,frame.status);
 assert.match(options,/value="" selected disabled/);
 assert.doesNotMatch(options,/value="sealed"/);
 fields.frameStatus.innerHTML=options;
 assert.equal(api.commitFrameEdit(),false);
 assert.equal(frame.status,'sealed');assert.equal(frame.history.length,0);
 fields.frameType.value='comb';api.syncFrameType();fields.frameStatus.value='sealed';
 assert.equal(api.commitFrameEdit(),true);assert.equal(frame.status,'sealed');assert.equal(frame.type,'comb');assert.equal(frame.history.length,1);
});
test('each existing editor commit call aborts the caller on rejection',()=>{
 assert.equal((html.match(/if\(!commitFrameEdit\(\)\)return;/g)||[]).length,5);
 assert.equal((html.match(/commitFrameEdit\(\)/g)||[]).length,6);
 assert.match(html,/frameStatusOptions\(x.type,x.status\)/);
});


test('unknown editor frame type is rejected before recording audit or changing a frame',()=>{
 const {api,fields,frame,events,alerts}=fixture('comb','drawn');
 const before=structuredClone(frame);
 fields.frameType.value='obsolete-frame-type';
 fields.frameStatus.value='foundation';
 assert.equal(api.commitFrameEdit(),false);
 assert.deepEqual(frame,before);
 assert.deepEqual(events,[]);
 assert.equal(alerts.length,1);
});

test('comb with forbidden foundation status is never silently accepted',()=>{const {api,fields,frame}=fixture('comb','drawn');const before=structuredClone(frame);fields.frameStatus.value='foundation';assert.equal(api.commitFrameEdit(),false);assert.deepEqual(frame,before);});
