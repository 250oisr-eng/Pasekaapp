import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('full .paseka archive modules are loaded in dependency order and cached for offline use', () => {
  const sha = html.indexOf('<script src="./js/paseka-sha256.js"></script>');
  const codec = html.indexOf('<script src="./js/paseka-archive.js"></script>');
  const restore = html.indexOf('<script src="./js/paseka-archive-restore.js"></script>');
  assert.ok(sha >= 0 && codec > sha && restore > codec);
  for (const path of ['paseka-sha256.js', 'paseka-archive.js', 'paseka-archive-restore.js']) {
    assert.ok(serviceWorker.includes("'./js/" + path + "'"), path + ' must be available offline');
  }
  assert.match(serviceWorker, /paseka-shell-v314/);
});

test('IndexedDB v4 adds archive staging and history without replacing existing stores', () => {
  assert.match(html, /indexedDB\.open\(DB,4\)/);
  assert.match(html, /createObjectStore\('archive_staging',\{keyPath:'id'\}\)/);
  assert.match(html, /createIndex\('sessionId','sessionId',\{unique:false\}\)/);
  assert.match(html, /createIndex\('kind','kind',\{unique:false\}\)/);
  assert.match(html, /createIndex\('backupId','backupId',\{unique:true\}\)/);
  assert.match(html, /createObjectStore\('archive_history',\{keyPath:'backupId'\}\)/);
});

test('JSON backup is clearly distinguished from the full archive that contains entrance videos', () => {
  assert.match(html, /не включает отдельные оригиналы видео летка/);
  assert.match(html, /id="downloadFullArchiveButton"/);
  assert.match(html, /Скачать полный архив \.paseka/);
  assert.match(html, /id="fullArchiveFile"/);
  assert.match(html, /onclick="prepareFullArchiveRestore\(\)"/);
  assert.match(html, /onclick="commitFullArchiveRestore\(\)"/);
  assert.match(html, /id="archiveImportHistory"/);
});

test('full archive restore validates state and integrity before staging, then exposes explicit commit and rollback', () => {
  assert.match(html, /function validateFullArchiveImportState\(state\)[\s\S]*?validateBackupState\(state\)[\s\S]*?assertRawBackupIntegrity\(state\)/);
  assert.match(html, /PasekaArchiveRestore\.stageArchiveForRestore/);
  assert.match(html, /PasekaArchiveRestore\.commitStagedArchive/);
  assert.match(html, /PasekaArchiveRestore\.rollbackCommittedArchive/);
  assert.match(html, /PasekaArchiveRestore\.discardArchiveRollbackSnapshot/);
  assert.match(html, /if \(committed\)[\s\S]*?Повторно импортировать архив не нужно/);
});

test('interrupted archive staging and import history are shown again after app startup', () => {
  assert.match(html, /renderArchiveImportHistory\(\)\.catch\(\(\)=>\{\}\)/);
});
