import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function upcomingTasksMarkup('),html.indexOf('function taskMarkup('));
const render=new Function('taskMarkup',source+';return upcomingTasksMarkup')(task=>'<b>'+task.id+'</b>');

test('upcoming tasks preserve order and expansion across the five-task boundary',()=>{
 const tasks=Array.from({length:7},(_,i)=>({id:i+1}));
 assert.equal(render([],false),'');
 assert.doesNotMatch(render(tasks.slice(0,5),true),/<details/);
 const list=render(tasks,false);
 assert.deepEqual(Array.from(list.matchAll(/<b>(\d+)<\/b>/g),match=>Number(match[1])),tasks.map(task=>task.id));
 assert.match(list,/<b>5<\/b><details id="moreUpcomingTasks"><summary>[^<]+\(2\)<\/summary><b>6<\/b>/);
 assert.match(render(tasks,true),/<details id="moreUpcomingTasks" open>/);
});

test('home plan filters all active groups by saved hive and keeps unlinked tasks in the overview',()=>{
 const fields={homeTaskHive:{value:'b'},homeAlerts:{},homeTasks:{}};
 const tasks=[
  {id:'late',hive:'b',status:'pending',date:'2026-01-01'},
  {id:'now',hive:'b',status:'pending',date:'2026-01-02'},
  {id:'later',hive:'b',status:'pending',date:'2026-01-03'},
  {id:'proposal',hive:'b',status:'suggested'},
  {id:'finished',hive:'b',status:'done'},
  {id:'other',hive:'a',status:'pending',date:'2026-01-03'},
  {id:'legacy',status:'pending',date:'2026-01-03'}
 ];
 const before=structuredClone(tasks);
 const source=html.slice(html.indexOf('function renderHomeTasks('),html.indexOf('function completedTaskRecord('));
 const draw=new Function('S','$','today','taskMarkup','upcomingTasksMarkup','renderCompletedHomeTasks',source+';return renderHomeTasks')(
  {tasks},id=>fields[id],()=>'2026-01-02',t=>t.id,rows=>rows.map(t=>t.id).join(' '),()=>{});
 draw();
 assert.match(fields.homeAlerts.innerHTML,/late/);
 for(const id of ['now','later','proposal'])assert.ok(fields.homeTasks.innerHTML.includes(id));
 assert.doesNotMatch(fields.homeTasks.innerHTML,/other|finished|legacy/);
 fields.homeTaskHive.value='empty';draw();
 assert.match(fields.homeTasks.innerHTML,/Для этого улья/);
 fields.homeTaskHive.value='';draw();
 assert.match(fields.homeTasks.innerHTML,/legacy/);
 assert.deepEqual(tasks,before);
});

test('planning dialog opens with the selected hive and collects only entered feeding details',()=>{
 const fields={};
 const get=id=>fields[id]??={style:{},value:''};
 get('planHive').replaceChildren=()=>{};
 let opened=false;
 get('planDlg').showModal=()=>{opened=true};
 get('planType').value='Осмотр';
 const source=html.slice(html.indexOf('const plannedFeedingFields='),html.indexOf("$('planForm').onsubmit"));
 const api=new Function('$','S','Option','hname','dateShift','today',source+';return {openPlanDialog,togglePlanFeedingFields,collectPlannedFeedingFields}')(
  get,{hives:[{id:'a'},{id:'b'}]},class Option {},String,()=> '2026-11-28',()=> '2026-11-27');
 api.openPlanDialog('b');
 assert.equal(opened,true);
 assert.equal(get('planHive').value,'b');
 assert.equal(get('planFeedingFields').style.display,'none');
 get('planType').value='Подкормка';
 api.togglePlanFeedingFields();
 assert.equal(get('planFeedingFields').style.display,'');
 get('planFeedingAmount').value='  отметка  ';
 assert.equal(api.collectPlannedFeedingFields().plannedFeedingAmount,'отметка');
 assert.equal(api.collectPlannedFeedingFields().plannedFeedingMethod,'');
});

test('completed task link requires unique reciprocal active journal association',()=>{
 const source=html.slice(html.indexOf('function completedTaskRecord('),html.indexOf('function openCompletedTaskRecord('));
 const find=new Function(source+';return completedTaskRecord')();
 const t={id:'t',status:'done',hive:'h',completedRecordId:'r'};
 const r={id:'r',hive:'h',taskId:'t'};
 const state={tasks:[t],records:[r],hives:[{id:'h'}]};
 assert.equal(find(state,t),r);
 for(const records of [[],[r,r],[{...r,archivedAt:'date'}],[{...r,hive:'other'}],[{...r,taskId:'other'}]])assert.equal(find({...state,records},t),null);
 assert.equal(find({...state,tasks:[t,t]},t),null);
 assert.equal(find({...state,hives:[]},t),null);
 assert.equal(find(state,{...t,status:'pending'}),null);
});
