import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('<section id="home" class="panel active">');
const end=html.indexOf('</section>',start);
const home=start>=0&&end>start?html.slice(start,end):'';
const ai=html.match(/<section id="ai" class="panel">([\s\S]*?)<\/section>/)?.[1]||'';

test('approved home UX has one canonical bottom AI entry, without duplicate card or prompt relay',()=>{
  assert.ok(home);
  assert.doesNotMatch(home,/home-ai-card|homeAIQuestion|askAIFromHome|Перейти к ИИ/);
  assert.doesNotMatch(html,/function askAIFromHome\(/);
  const nav=html.match(/<nav aria-label="Основные разделы">([\s\S]*?)<\/nav>/)?.[1]||'';
  assert.equal((nav.match(/data-tab="ai"/g)||[]).length,1);
  assert.match(nav,/aria-label="Открыть ИИ-помощника"/);
  assert.match(ai,/id="aiQuestion"/);
  assert.match(ai,/class="ai-prompt-chips"/);
  assert.match(html,/function useAIPrompt\(prompt\)/);
});

test('one-tap unsaved journal draft survives home simplification',()=>{
  assert.match(home,/<div class="card home-recent-card"><div class="row"><b>Последние события<\/b><button type="button" onclick="newRecord\(\)">＋ Записать событие<\/button>/);
  assert.match(home,/id="recent"/);
  assert.match(home,/id="homeAlerts"/);
  assert.match(home,/id="homeTasks"/);
  assert.match(home,/id="globalSearch"/);
  assert.match(home,/id="homeHives"/);
  assert.match(html,/function newRecord\(/);
  assert.match(html,/Скачать полный архив текущей базы/);
  assert.match(html,/function openFamilyHistoryRecord\(/);
});

test('desktop layout consumes the removed AI card slot without touching task visibility',()=>{
  assert.match(html,/#home>\.apiary-status-card\{grid-column:1\/-1\}/);
  assert.match(html,/#home>\.home-tasks-card\{grid-column:1\}/);
  assert.match(html,/#home>\.home-recent-card\{grid-column:2\}/);
  assert.doesNotMatch(html,/#home>\.home-ai-card|\.home-ai-prompts/);
  assert.match(html,/const homeHivePreviewLimit=3;/);
  assert.match(html,/const overdue=active\.filter/);
});
