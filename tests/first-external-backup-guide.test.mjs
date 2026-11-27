import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('<div class="card" id="firstExternalBackupGuide"');
const end = html.indexOf('<div class="card"><b>Автоматически</b>',start);
const guide = start >= 0 && end > start ? html.slice(start,end) : '';
const exportStart = html.indexOf('async function downloadDisasterArchive(){');
const verifyStart = html.indexOf('async function verifyDisasterArchive(){',exportStart);
const jsonStart = html.indexOf('async function downloadBackup(){',verifyStart);
const exportSrc = exportStart >= 0 && verifyStart > exportStart ? html.slice(exportStart,verifyStart) : '';
const verifySrc = verifyStart >= 0 && jsonStart > verifyStart ? html.slice(verifyStart,jsonStart) : '';

test('first external backup instructions are visible, truthful, and read-only', () => {
  assert.ok(guide, 'guide must precede existing backup actions in settings');
  assert.match(guide, /role="region" aria-labelledby="firstExternalBackupTitle"/);
  assert.match(guide, /id="firstExternalBackupTitle"/);
  assert.match(guide, /Если внешней резервной копии ещё нет/);
  assert.match(guide, /<ol[^>]*>[\s\S]*?<li>[\s\S]*?<li>[\s\S]*?<li>[\s\S]*?<li>[\s\S]*?<\/ol>/);
  assert.match(guide, /paseka-full-idb-\*\.json/);
  for(const caveat of [
    'вне телефона приложение проверить не может',
    'Файл подготовлен',
    'не включает отдельные видео',
    'SHA-256 и структура подтверждают только содержимое выбранного файла',
    'независимое восстановление и безопасность удаления данных НЕ подтверждены'
  ]) assert.ok(guide.includes(caveat), 'missing first-copy caveat: ' + caveat);
  const links=[...guide.matchAll(/onclick="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(links,["document.getElementById('p0FullArchiveReadonly')?.scrollIntoView({block:'start'})"]);
  assert.ok(!/deleteAllData\(|atomicRestore\(|restoreBackup\(|save\(/.test(guide),
    'guide must not execute destructive or persistence actions');
});

test('first-copy guide reuses existing full archive, not the legacy state-only JSON', () => {
  assert.equal((html.match(/id="firstExternalBackupGuide"/g) || []).length,1);
  assert.equal((html.match(/id="p0FullArchiveReadonly"/g) || []).length,1);
  assert.match(html, /onclick="downloadDisasterArchive\(\)">Скачать полный архив текущей базы/);
  assert.match(html, /id="disasterFile" type="file" accept="\.json,application\/json"/);
  assert.match(html, /onclick="verifyDisasterArchive\(\)">Проверить целостность файла без записи/);
  assert.match(html, /<label for="backupFile">Восстановить JSON<\/label><input type="file" id="backupFile"/);
  assert.match(html, /Скачать JSON \(без отдельных видео летков\)/);
});

test('full export fails closed on unready main, unsaved media and failed persistence', () => {
  assert.ok(exportSrc, 'live full export must exist');
  for(const token of [
    'rejectWhileStartupNotReady()', 'await saveQueue',
    "S.meta?.saveError", 'pendingRecordMedia.length',
    'pendingPlantMedia.length','pendingIncidentMedia.length',
    'pendingDeadoutMedia.length','videoRecorder','cameraStream',
    'const source=await readMain()', "if(!source)",
    'PasekaDisasterArchive.exportArchive(db)',
    'PasekaDisasterArchive.inspectArchive(raw,db'
  ]) assert.ok(exportSrc.includes(token),'missing existing safe export gate: ' + token);
  assert.match(exportSrc, /Фактическое сохранение, внешняя копия и восстановление НЕ подтверждены/);
  assert.doesNotMatch(exportSrc, /PasekaDisasterArchive\.atomicRestore|\.clear\(\)|deleteDatabase\(/);
});

test('read-back verification reports only file checks, never independent recovery', () => {
  assert.ok(verifySrc, 'live read-only verifier must exist');
  assert.match(verifySrc, /if\(!file\).*Выберите ранее сохранённый файл полного архива/);
  assert.match(verifySrc, /const raw=await file\.text\(\)/);
  assert.match(verifySrc, /PasekaDisasterArchive\.inspectArchive\(raw,db/);
  assert.match(verifySrc, /Независимое восстановление НЕ подтверждено/);
  assert.doesNotMatch(verifySrc,/PasekaDisasterArchive\.atomicRestore|\.clear\(\)|deleteDatabase\(/);
});
