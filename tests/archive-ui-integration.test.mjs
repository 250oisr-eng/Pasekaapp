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


test('restore UI requires a stable saved revision, explicit confirmation and offers a safe cancel path', async () => {
  const prepareStart = html.indexOf('async function prepareFullArchiveRestore()');
  const prepareEnd = html.indexOf('async function finalizeFullArchiveStaging(', prepareStart);
  const prepare = html.slice(prepareStart, prepareEnd);
  assert.ok(prepare.indexOf('await saveQueue') < prepare.indexOf('const live = await readMain()'));
  assert.match(prepare, /S\.meta\?\.saveError/);
  assert.match(prepare, /expectedRevision !== \(S\.meta\?\.revisionId \?\? null\)/);
  assert.match(prepare, /window\.__pasekaPendingFullArchiveRestore = \{ sessionId: staged\.session\.sessionId, expectedRevision \}/);

  const commitStart = html.indexOf('async function commitFullArchiveRestore()');
  const commitEnd = html.indexOf('async function rollbackFullArchiveImport(', commitStart);
  const commit = html.slice(commitStart, commitEnd);
  assert.ok(commit.indexOf("if (!confirm(") < commit.indexOf('PasekaArchiveRestore.commitStagedArchive'));
  assert.match(commit, /window\.__pasekaRestoreBusy/);
  assert.match(commit, /live\?\.meta\?\.revisionId[\s\S]*?S\.meta\?\.revisionId/);
  assert.match(commit, /if \(committed\)[\s\S]*?Повторно импортировать архив не нужно/);

  const cancelStart = html.indexOf('async function cancelFullArchiveRestore()');
  const cancelEnd = html.indexOf('async function prepareMigratedArchiveState(', cancelStart);
  const cancel = html.slice(cancelStart, cancelEnd);
  assert.match(cancel, /discardArchiveRestoreSession/);
  assert.match(cancel, /fullArchiveRestorePreview/);
  assert.match(cancel, /fullArchiveRestoreActions/);
  assert.match(html, /onclick="cancelFullArchiveRestore\(\)"/);
});

test('rollback UI requires explicit confirmation and refuses a stale in-memory view', async () => {
  const start = html.indexOf('async function rollbackFullArchiveImport(');
  const end = html.indexOf('async function discardFullArchiveRollbackSnapshot(', start);
  const rollback = html.slice(start, end);
  assert.ok(rollback.indexOf('if (!confirm(') < rollback.indexOf('PasekaArchiveRestore.rollbackCommittedArchive'));
  assert.match(rollback, /live\.meta\?\.revisionId[\s\S]*?S\.meta\?\.revisionId/);
  assert.match(rollback, /window\.__pasekaRestoreBusy/);
});


test('archive modules are loaded as separate script elements without literal escape text', async () => {
  assert.match(html, /<script src="\.\/js\/deadout-review\.js"><\/script>\s*<script src="\.\/js\/paseka-sha256\.js"><\/script>\s*<script src="\.\/js\/paseka-archive\.js"><\/script>\s*<script src="\.\/js\/paseka-archive-restore\.js"><\/script>/);
  assert.doesNotMatch(html, /<\/script>\\\\n<script/);
});
