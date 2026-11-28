import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function openEquipmentInventory(');
const code=html.slice(start,html.indexOf('async function createInventoryStock(',start));
test('a corpus search result focuses its exact inventory card, clearing filters only when needed',()=>{
 const calls=[];
 const card={hidden:true,focus:()=>calls.push('focus'),scrollIntoView:()=>calls.push('scroll')};
 const fields={'inventory-body-one':card,equipmentInventoryDlg:{showModal:()=>calls.push('open')},
  inventoryFilterResult:{},inventorySearch:{focus:()=>calls.push('search')}};
 const open=new Function('$','renderEquipmentInventory','clearEquipmentInventoryFilters',code+';return openEquipmentInventory')(
  id=>fields[id],()=>calls.push('render'),()=>{calls.push('clear');card.hidden=false;});
 open('one');
 assert.deepEqual(calls,['render','open','clear','focus','scroll']);
 calls.length=0;
 open('one');
 assert.deepEqual(calls,['render','open','focus','scroll']);
 calls.length=0;
 open('removed');
 assert.match(fields.inventoryFilterResult.textContent,/не найден/);
 assert.deepEqual(calls,['render','open','search']);
 calls.length=0;
 open();
 assert.deepEqual(calls,['render','open']);
 assert.match(html,/openEquipmentInventory\(button.dataset.id\)/);
});

test('a stale journal result cannot open an archived, moved or missing entry',()=>{
 const code=html.slice(html.indexOf('function openGlobalSearchResult('),html.indexOf('function inventoryConditionLabel('));
 const entries=[{id:'one',hive:'h1'},{id:'two',hive:'h2',archivedAt:'2026-11-27'},{id:'three',hive:'gone'}];
 const opened=[],alerts=[];
 const open=new Function('S','editRecord','renderGlobalSearch','alert',code+';return openGlobalSearchResult')(
  {records:entries,hives:[{id:'h1'},{id:'h2'}]},id=>opened.push(id),()=>{},s=>alerts.push(s));
 for(const [id,hive] of [['one','h1'],['two','h2'],['one','h2'],['three','gone'],['missing','h1']]){
  open({dataset:{kind:'record',id,hive}});
 }
 assert.deepEqual(opened,['one']);
 assert.equal(alerts.length,4);
 // Duplicate IDs in damaged historical data must never select an arbitrary first record.
 entries.push({id:'one',hive:'h1',text:'conflicting duplicate'});
 open({dataset:{kind:'record',id:'one',hive:'h1'}});
 assert.deepEqual(opened,['one'],'ambiguous ID must not open another editor');
 assert.equal(alerts.length,5,'ambiguous ID must fail closed');
});

test('exact marking search routes via live identity and refuses a disappeared or duplicate record',()=>{
 const code=html.slice(html.indexOf('function openGlobalSearchResult('),html.indexOf('function inventoryConditionLabel('));
 const calls=[],button={dataset:{kind:'family',markType:'family',markCode:'12',id:'f',hive:'h'}},S={};
 let answer={status:'found',target:{kind:'family',id:'f',hiveId:'h'}};
 const fn=new Function('S','PasekaLabels','openFamilyHistory','renderGlobalSearch','alert',code+';return openGlobalSearchResult')(S,{lookupMarking:()=>answer},(...args)=>calls.push(args),()=>calls.push('refresh'),msg=>calls.push(msg));
 fn(button);assert.deepEqual(calls,[['f','h']]);answer={status:'ambiguous'};fn(button);assert.equal(calls[1],'refresh');assert.match(calls[2],/однозначно/);
 answer={status:'found',target:{kind:'family',id:'different',hiveId:'h'}};fn(button);assert.equal(calls[3],'refresh');assert.match(calls[4],/однозначно/);assert.equal(calls.length,5);
});

 test('exact family search preserves its semantic kind and permanent ID in result markup',()=>{
 const code=html.slice(html.indexOf('function renderGlobalSearch()'),html.indexOf("document.addEventListener('keydown',event=>",html.indexOf('function renderGlobalSearch()')));
 const host={innerHTML:''},els={globalSearch:{value:'С-12'},globalSearchResults:host,globalSearchStatus:{}};
 const render=new Function('$','S','safe','PasekaReconciliationVoice','PasekaLabels',code+';return renderGlobalSearch')(id=>els[id],{},String,{parseMarkingLookup:()=>({kind:'family',code:'12'})},{lookupMarking:()=>({status:'found',title:'С-12',target:{kind:'family',id:'family-uid',hiveId:'h'}})});
 render();assert.match(host.innerHTML,/data-kind="family"/);assert.match(host.innerHTML,/data-id="family-uid"/);assert.match(host.innerHTML,/data-mark-code="12"/);
});
