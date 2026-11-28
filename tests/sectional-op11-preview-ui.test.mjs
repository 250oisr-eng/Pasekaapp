import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const js=await readFile(new URL('../js/sectional-op11-preview-ui.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
class Element {
 constructor(tag,document){
  this.tagName=tag.toUpperCase();this.ownerDocument=document;
  this.children=[];this.attributes={};this.listeners={};this.textContent='';
  this.value='';this.hidden=false;this.required=false;
 }
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=[...children]}
 setAttribute(key,value){this.attributes[key]=String(value)}
 getAttribute(key){return this.attributes[key]??null}
 addEventListener(name,fn){this.listeners[name]=fn}
 fire(name){let prevented=false;this.listeners[name]?.({preventDefault(){prevented=true}});return prevented}
 find(predicate){
  if(predicate(this))return this;
  for(const child of this.children){
   const hit=child.find?.(predicate);if(hit)return hit;
  }
  return null;
 }
 findAll(predicate){
  return [...(predicate(this)?[this]:[]),...this.children.flatMap(c=>c.findAll?.(predicate)||[])];
 }
}
function harness(api){
 const document={createElement(tag){return new Element(tag,document)}};
 const root={document,PasekaSectionalOP11Preview:api};
 new Function('window',js)(root);
 const host=new Element('div',document);
 const state={meta:{revisionId:'r1'},hives:[{id:'h',profileId:'sectional-multiqueen-v1'}]};
 const items=Object.fromEntries([
  ['bottom','bottom','hive'],['cover','cover','storage'],
  ['riser','topRiser','storage'],['feeder','feeder','storage'],
  ['plug','plasticPlug','storage']
 ].map(([id,kind,type])=>[id,{id,kind,condition:'good',location:type==='hive'
  ?{type:'hive',hiveId:'h',stackId:'s'}:{type:'storage',label:'Склад'}}]));
 const audit={ok:true,kept:['upper-a','upper-b','upper-c'],
  stacks:[{bottomItemId:'bottom'}],items,
  openings:[{bodyId:'upper-a',openingId:'opening-a'}]};
 return {root,host,state,audit,document,
  mount(){return root.PasekaSectionalOP11PreviewUI.mount(host,{getState:()=>state,hiveId:'h'})}};
}
function apiHarness(){
 const calls=[];
 const h=harness({
  inspect(_state,{expectedRevisionId}){return expectedRevisionId==='r1'?h.audit:{ok:false,error:'op11_stale_revision'}},
  preview(state,input){
   calls.push(input);
   if(state.meta.revisionId!==input.expectedRevisionId)return {ok:false,error:'op11_stale_revision'};
   if(input.plugAssignments['opening-a']!=='plug')return {ok:false,error:'op11_one_stored_plastic_plug_per_upper_opening_required'};
   return {ok:true,readOnly:true,readyForPersistence:false,completionRecorded:false,
    retainedBodyIds:[input.lowerBodyId,input.middleBodyId,input.upperBodyId],
    removedBodyIds:['lower-a','lower-b','lower-c'],
    removedBottomItemIds:['bottom2','bottom3'],
    retainedBottomItemId:input.bottomItemId,
    retainedCoverItemId:input.coverItemId,retainedTopRiserItemId:input.topRiserItemId,
    ceilingFeederItemId:input.feederItemId,
    removeTechnicalExcluderItemIds:['grid1','grid2'],
    closureAssignments:[{openingId:'opening-a',plasticPlugItemId:'plug'}]};
  }
 });return {...h,calls};
}
const findField=(host,key,attr='data-op11-field')=>host.find(e=>e.getAttribute?.(attr)===key);
const fill=host=>{
 const values={
  lowerBodyId:'upper-a',middleBodyId:'upper-b',upperBodyId:'upper-c',
  bottomItemId:'bottom',coverItemId:'cover',topRiserItemId:'riser',
  feederItemId:'feeder',ventilationOption:'upper_only'
 };
 for(const [key,value] of Object.entries(values)){
  const input=findField(host,key);assert.ok(input,key);input.value=value;
 }
 const plug=findField(host,'opening-a','data-op11-plug');assert.ok(plug);plug.value='plug';
};
const status=host=>host.find(e=>e.getAttribute?.('role')==='status');
const result=host=>host.find(e=>e.getAttribute?.('data-op11-result')==='');
const form=host=>host.find(e=>e.getAttribute?.('data-op11-form')==='');

test('B07 OP11 mounted form is read-only, empty by default, with manual choices and no execution button',()=>{
 const h=apiHarness(),before=structuredClone(h.state),m=h.mount();
 assert.deepEqual(m,{ok:true,readOnly:true,revisionId:'r1'});
 const fields=h.host.findAll(e=>e.tagName==='SELECT');
 assert.equal(fields.length,9,'three bodies, bottom, cover, riser, feeder, plug and ventilation');
 assert.ok(fields.every(e=>e.value===''));
 assert.deepEqual(h.state,before);
 assert.ok(h.host.find(e=>e.tagName==='BUTTON'&&/Проверить схему без записи/.test(e.textContent)));
 assert.equal(h.host.find(e=>e.tagName==='BUTTON'&&/сохран|выполн|подтверди/i.test(e.textContent)),null);
 const f=form(h.host);
 assert.equal(f.fire('submit'),true,'form submission must be prevented');
 assert.match(status(h.host).textContent,/Укажите все/);
 assert.equal(h.calls.length,0,'incomplete form never executes domain preview');
 fill(h.host);f.fire('submit');
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].expectedRevisionId,'r1');
 assert.equal(h.calls[0].ventilationOption,'upper_only');
 assert.equal(h.calls[0].plugAssignments['opening-a'],'plug');
 assert.match(status(h.host).textContent,/НЕ выполнено и НЕ сохранено/);
 assert.ok(result(h.host).findAll(e=>e.tagName==='P').length>=8);
 assert.deepEqual(h.state,before,'even a successful preview cannot write to loaded state');
 f.fire('change');
 assert.equal(result(h.host).children.length,0,'changing selections clears stale preview');
});
test('B07 OP11 stale revision, wrong ventilation and domain failures never display validated results',()=>{
 const h=apiHarness();h.mount();fill(h.host);
 const f=form(h.host);
 findField(h.host,'ventilationOption').value='';
 f.fire('submit');assert.equal(h.calls.length,0);
 fill(h.host);
 h.state.meta.revisionId='r2';
 f.fire('submit');
 assert.equal(h.calls.length,1);
 assert.match(status(h.host).textContent,/изменилось/);
 assert.equal(result(h.host).children.length,0);
});
test('B07 OP11 missing inspector or invalid sectional layout never mounts a selectable form',()=>{
 const noApi=harness(null);
 assert.equal(noApi.mount().ok,false);
 assert.equal(form(noApi.host),null);
 assert.match(noApi.host.find(e=>e.tagName==='P'&&e.getAttribute('role')==='status').textContent,/недоступен/);
 const invalid=harness({inspect(){return {ok:false,error:'op11_invalid_source_layout'}}});
 assert.equal(invalid.mount().ok,false);
 assert.equal(form(invalid.host),null);
 assert.match(status(invalid.host).textContent,/не прошла локальную проверку/);
});
test('B07 OP11 panel exists only in selected sectional hive and requires loaded safe DB',()=>{
 assert.match(html,/id="sectionalOp11PreviewHost" hidden/);
 assert.match(html,/function renderSectionalOp11Preview\(\)/);
 assert.match(html,/const visible=!!selectedHiveId&&isSectionalHive\(selectedHiveId\)/);
 assert.match(html,/if\(!startupWriteGate.ready\)/);
 assert.match(html,/renderSectionalOp11Preview\(\);/);
 assert.match(html,/\.\/js\/sectional-op11-preview\.js/);
 assert.match(html,/\.\/js\/sectional-op11-preview-ui\.js/);
 assert.match(html,/const SECTIONAL_HONEY_QA_WRITE_ENABLED=false/);
});
test('B07 OP11 offline shell keeps both new modules and never caches user records',()=>{
 assert.match(sw,/const CACHE='paseka-shell-v333'/);
 assert.match(sw,/\.\/js\/sectional-op11-preview\.js/);
 assert.match(sw,/\.\/js\/sectional-op11-preview-ui\.js/);
 assert.doesNotMatch(sw,/\.\/api\/private-video/);
 assert.doesNotMatch(js,/\.innerHTML\s*=|\.save\s*\(|\blocalStorage\s*\.|\bindexedDB\s*\.|\.completeOP11\s*\(/);
});
