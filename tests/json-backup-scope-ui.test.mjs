import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fragment(start, end) {
 const a = html.indexOf(start);
 assert.ok(a >= 0, 'missing function: ' + start);
 const b = html.indexOf(end, a + start.length);
 assert.ok(b > a, 'missing next function delimiter: ' + end);
 return html.slice(a, b);
}

test('legacy JSON download clearly describes that entrance videos are excluded', () => {
 const download = fragment('async function downloadBackup()', 'function validateBackupState(');
 assert.match(download, /JSON\.stringify\(\{app:'Paseka',state:S\}/);
 assert.doesNotMatch(download, /entrance_media|ENTRANCE_MEDIA_STORE|mediaStore\.getAll/);
 assert.match(html, />Скачать JSON \(без отдельных видео летков\)<\/button>/);
});

test('manual JSON restore no longer promises a complete media backup', () => {
 const restore = fragment('async function restoreBackup()', 'async function restoreAutoBackup()');
 assert.match(restore, /отдельные видео летков в неё не входят/);
 assert.match(restore, /Архив восстановлен \\(JSON-состояние\\)/);
 assert.doesNotMatch(restore, /Перед заменой текущие данные сохранятся в полной автокопии/);
});

test('local state auto-backup does not claim to restore separate entrance videos', () => {
 const restore = fragment('async function restoreAutoBackup()', 'async function deleteAllData()');
 assert.match(restore, /Отдельные видео летков не включены/);
 assert.match(restore, /Отдельные видео летков не затронуты/);
 assert.doesNotMatch(restore, /полное состояние, включая фотографии и видео/);
});

test('backup panel does not promise original entrance-video storage is duplicated', () => {
 assert.match(html, /копия предыдущего состояния приложения, включая вложения внутри записей, но не отдельные видео летков/);
 assert.match(html, /Автокопия состояния:/);
 assert.doesNotMatch(html, /одна полная копия предыдущего состояния, включая фотографии и видео/);
});
