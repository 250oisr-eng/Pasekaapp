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
