import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const archive=await readFile(new URL('../js/disaster-archive.js',import.meta.url),'utf8');

test('B01 settings label must not claim automatic snapshots cover standalone entrance videos',()=>{
 assert.match(html,/копия предыдущего состояния приложения, включая вложения внутри записей, но не отдельные видео летков/);
 assert.doesNotMatch(html,/полная копия предыдущего состояния, включая фотографии и видео/);
});
test('B01 JSON export must disclose separately stored entrance-video exclusion',()=>{
 assert.match(html,/Скачать JSON \(без отдельных видео летков\)/);
 assert.match(html,/Этот формат не включает отдельные видео летков/);
});
test('B01 full read-only IndexedDB export remains a distinct non-destructive operation',()=>{
 assert.match(html,/id="p0FullArchiveReadonly"/);
 assert.match(html,/Полный архив IndexedDB \(только чтение\)/);
 assert.match(archive,/const FORMAT='paseka-idb-full-v1'/);
 assert.match(archive,/names\.includes\('entrance_media'\)/);
 assert.match(html,/Проверить источники и скачать отчёт G0/);
});
