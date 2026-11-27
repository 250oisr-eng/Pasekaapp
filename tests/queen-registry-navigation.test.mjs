import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function queenRegistryFamily('),html.indexOf('function openQueenForm('));

test('queen registry filters actual statuses and opens only the uniquely linked family',()=>{
 const fields={queenRegistryList:{},queenRegistrySearch:{value:''},queenRegistryStatus:{value:'all'},queenRegistryResultCount:{}};
 const S={hives:[{id:'h1'},{id:'h2'}],families:[{id:'f1',hive:'h1',name:'Семья А',currentQueenId:'q2'},{id:'f2',hive:'h2',name:'Семья Б'}],queens:[
  {id:'q1',familyId:'f1',code:'Старая',status:'replaced'},
  {id:'q2',familyId:'f1',code:'Новая',source:'Питомник',status:'current'},
  {id:'q3',familyId:'f2',code:'Неизвестная'}
 ],queenEvents:[]};
 const calls=[],alerts=[];
 const api=new Function('$','S','safe','hname','openFamilyHistory','openQueenForm','alert',source+';return {renderQueenRegistry,openQueenRegistryFamily,queenRegistryFamily}')(
  id=>fields[id],S,String,id=>id,(...args)=>calls.push(args),id=>calls.push(['edit',id]),message=>alerts.push(message));
 const before=JSON.stringify(S);
 api.renderQueenRegistry();
 assert.equal(fields.queenRegistryResultCount.textContent,'Показано: 3 из 3');
 fields.queenRegistryStatus.value='historical';api.renderQueenRegistry();
 assert.match(fields.queenRegistryList.innerHTML,/Старая/);
 assert.doesNotMatch(fields.queenRegistryList.innerHTML,/Новая|Изменить \/ заменить/);
 fields.queenRegistrySearch.value='питомник';fields.queenRegistryStatus.value='all';api.renderQueenRegistry();
 assert.equal(fields.queenRegistryResultCount.textContent,'Показано: 1 из 3');
 assert.match(fields.queenRegistryList.innerHTML,/Новая/);
 const button={dataset:{queenId:'q2',familyId:'f1',hiveId:'h1'}};
 api.openQueenRegistryFamily(button);api.openQueenRegistryFamily(button,true);
 assert.deepEqual(calls,[['f1','h1'],['edit','f1']]);
 assert.equal(JSON.stringify(S),before);
 S.families[0].hive='h2';api.openQueenRegistryFamily(button);
 assert.equal(alerts.length,1);assert.equal(calls.length,2);
 S.families.push({...S.families[0]});assert.equal(api.queenRegistryFamily(S,'q2','f1','h2'),null);
});



test('queen registry blocks navigation and editing for duplicate hive identifiers',()=>{
 const state={hives:[{id:'h1'},{id:'h1'}],families:[{id:'f1',hive:'h1',currentQueenId:'q1'}],queens:[{id:'q1',familyId:'f1',status:'current'}],queenEvents:[]};
 const messages=[],opened=[];
 const fields={queenRegistryList:{innerHTML:''},queenRegistrySearch:{value:''},queenRegistryStatus:{value:'all'},queenRegistryResultCount:{}};
 const api=new Function('S','$','safe','hname','alert','openFamilyHistory','openQueenForm',source+';return {queenRegistryFamily,openQueenRegistryFamily}')(
  state,id=>fields[id],String,id=>id,message=>messages.push(message),id=>opened.push(id),id=>opened.push(['edit',id]));
 const before=JSON.stringify(state);
 assert.equal(api.queenRegistryFamily(state,'q1','f1','h1'),null);
 const button={dataset:{queenId:'q1',familyId:'f1',hiveId:'h1'}};
 api.openQueenRegistryFamily(button);
 api.openQueenRegistryFamily(button,true);
 assert.deepEqual(opened,[]);
 assert.equal(messages.filter(x=>x.includes('недоступна')).length,2);
 assert.equal(JSON.stringify(state),before);
});

test('queen registry blocks navigation on missing or malformed indices without exceptions',()=>{
 const valid={queens:[{id:'q',familyId:'f',status:'current'}],families:[{id:'f',hive:'h',currentQueenId:'q'}],hives:[{id:'h'}],queenEvents:[]};
 const api=new Function(source+';return queenRegistryFamily')();
 assert.equal(api(valid,'q','f','h').id,'f');
 for(const field of ['queens','families','hives']){
  for(const damaged of [undefined,null,{},'invalid']){
   const state={...valid,[field]:damaged};
   const snapshot=JSON.stringify(state);
   assert.equal(api(state,'q','f','h'),null,field+' malformed state must fail closed');
   assert.equal(JSON.stringify(state),snapshot);
  }
 }
 assert.equal(api(null,'q','f','h'),null);
});

test('queen registry renderer reports corrupt indexes without mutating state',()=>{
 const fields={queenRegistryList:{innerHTML:'',textContent:''},queenRegistryResultCount:{textContent:''}};
 const state={queens:[{id:'q',familyId:'f'}],families:{damaged:true},hives:[{id:'h'}],queenEvents:[]};
 const before=JSON.stringify(state);
 const api=new Function('$','S',source+';return {renderQueenRegistry,queenRegistryFamily}')(
  id=>fields[id],state);
 assert.doesNotThrow(()=>api.renderQueenRegistry());
 assert.match(fields.queenRegistryList.textContent,/Реестр маток повреждён/);
 assert.equal(fields.queenRegistryResultCount.textContent,'Проверка данных требуется');
 assert.equal(api.queenRegistryFamily(state,'q','f','h'),null);
 assert.equal(JSON.stringify(state),before);
});
