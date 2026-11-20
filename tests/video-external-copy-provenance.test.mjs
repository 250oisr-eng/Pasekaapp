import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('new entrance video explicitly records that external camera/gallery copies are unknown',()=>{
 const from=html.indexOf('async function handleEntranceVideoFile(files){');
 const to=html.indexOf('async function viewEntranceVideo(id){',from);
 assert.ok(from>=0&&to>from);
 const capture=html.slice(from,to);
 assert.match(capture,/captureProvenance:\{source:'file_input_or_external_camera',externalCopyState:'unknown',verifiedAt:null\}/);
 assert.doesNotMatch(capture,/externalCopyState:'verified_absent'|externalCopyState:'deleted'/);
 assert.match(capture,/await putEntranceVideo\(record\)/);
 assert.match(capture,/Галерея сохранили ещё одну копию/);
});
test('video queue UI never implies Android external copies can be deleted',()=>{
 const from=html.indexOf('async function refreshEntranceVideos(){');
 const to=html.indexOf('async function inspectEntranceVideoFile(',from);
 const list=html.slice(from,to);
 assert.match(list,/Внешние копии в Галерее\/камере не проверены/);
 assert.match(list,/Удаление заблокировано/);
 assert.doesNotMatch(list,/Внешние копии удалены|Все копии удалены/);
});
