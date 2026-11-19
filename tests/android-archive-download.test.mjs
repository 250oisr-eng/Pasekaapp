import test from 'node:test';
import assert from 'node:assert/strict';
import { patchMainActivitySource, createArchiveDownloadBridgeSource } from '../scripts/prepare-android-archive-download.mjs';

test('patches generated Capacitor MainActivity with the native archive download bridge', () => {
  const source = 'package ru.paseka.journal;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {}\n';
  const patched = patchMainActivitySource(source);
  assert.match(patched, /import android\.os\.Bundle;/);
  assert.match(patched, /getBridge\(\)\.getWebView\(\)\.addJavascriptInterface/);
  assert.match(patched, /"PasekaArchiveDownload"/);
  assert.equal(patchMainActivitySource(patched), patched);
});

test('refuses to patch an unknown Android activity', () => {
  assert.throws(() => patchMainActivitySource('public class MainActivity {}'), /unknown Android entry point/);
});

test('native bridge writes only validated .paseka files into the public Downloads folder', () => {
  const source = createArchiveDownloadBridgeSource('ru.paseka.journal');
  assert.match(source, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
  assert.match(source, /Environment\.DIRECTORY_DOWNLOADS \+ "\/Пасека"/);
  assert.match(source, /IS_PENDING/);
  assert.match(source, /application\/vnd\.paseka\.archive/);
  assert.match(source, /paseka-full-backup-\[0-9\]/);
  assert.match(source, /Base64\.decode/);
  assert.match(source, /cancelFile/);
  assert.throws(() => createArchiveDownloadBridgeSource('not a package'), /Invalid Android package/);
});

test('archive download helper writes bounded chunks and cleans up failed writes', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../js/paseka-android-download.js', import.meta.url), 'utf8');
  assert.match(source, /CHUNK_BYTES = 256 \* 1024/);
  assert.match(source, /bridge\.appendChunk\(sessionId, base64\)/);
  assert.match(source, /bridge\.cancelFile\(sessionId\)/);
  assert.match(source, /bridge\.finishFile\(sessionId\)/);
});


function loadAndroidDownloadHelper(bridge) {
  // Exercise the real browser helper with a FileReader shim, not regex-only checks.
  class TestFileReader {
    readAsDataURL(blob) {
      blob.arrayBuffer().then(
        bytes => {
          this.result = 'data:application/octet-stream;base64,' + Buffer.from(bytes).toString('base64');
          this.onload?.();
        },
        error => {
          this.error = error;
          this.onerror?.();
        }
      );
    }
  }
  return import('node:fs/promises').then(async ({readFile}) => {
    const source = await readFile(new URL('../js/paseka-android-download.js', import.meta.url), 'utf8');
    const window = { PasekaArchiveDownload: bridge };
    new Function('window', 'FileReader', source)(window, TestFileReader);
    return window.PasekaAndroidDownload;
  });
}

test('Android download refuses empty and invalid payloads without creating a Downloads entry', async () => {
  let beginCalls = 0;
  const helper = await loadAndroidDownloadHelper({
    beginFile() { beginCalls++; return 'session'; },
    appendChunk() { throw new Error('should not append'); },
    finishFile() { throw new Error('should not finish'); }
  });
  for (const payload of [null, {}, new Blob([]), {size:-1, slice(){}}]) {
    await assert.rejects(helper.saveToAndroidDownloads(payload, 'paseka-full-backup-20261119.paseka'), /пуст или повреждён/);
  }
  assert.equal(beginCalls, 0);
});

test('Android download actually encodes all chunks and reports success only after finishFile', async () => {
  const data = Buffer.alloc(300000, 42);
  const chunks = [], events = [], progress = [];
  const helper = await loadAndroidDownloadHelper({
    beginFile(filename, mime) {
      events.push('begin');
      assert.match(filename, /\\.paseka$/);
      assert.equal(mime, 'application/vnd.paseka.archive');
      return 'session-id';
    },
    appendChunk(id, text) {
      assert.equal(id, 'session-id');
      chunks.push(Buffer.from(text, 'base64'));
      events.push('chunk');
      return true;
    },
    finishFile(id) {
      assert.equal(id, 'session-id');
      events.push('finish');
      return 'content://test/downloads/archive';
    },
    cancelFile() { throw new Error('must not cancel successful save'); }
  });
  const uri = await helper.saveToAndroidDownloads(
    new Blob([data]), 'paseka-full-backup-20261119.paseka',
    (done, total) => progress.push([done, total])
  );
  assert.equal(uri, 'content://test/downloads/archive');
  assert.deepEqual(events, ['begin','chunk','chunk','finish']);
  assert.deepEqual(progress, [[1,2],[2,2]]);
  assert.deepEqual(Buffer.concat(chunks), data);
});

test('Android download cancels the pending native file if a chunk write fails', async () => {
  const events = [];
  const helper = await loadAndroidDownloadHelper({
    beginFile() { events.push('begin'); return 'session-id'; },
    appendChunk() { events.push('append-failed'); return false; },
    getLastError() { return 'native write failed'; },
    finishFile() { events.push('finish'); return 'unexpected-uri'; },
    cancelFile(id) { assert.equal(id, 'session-id'); events.push('cancel'); }
  });
  await assert.rejects(
    helper.saveToAndroidDownloads(new Blob(['fake synthetic archive']), 'paseka-full-backup-20261119.paseka'),
    /native write failed/
  );
  assert.deepEqual(events, ['begin','append-failed','cancel']);
});

test('Android download cancels the pending native file if finishFile fails', async () => {
  const events = [];
  const helper = await loadAndroidDownloadHelper({
    beginFile() { events.push('begin'); return 'session-id'; },
    appendChunk() { events.push('chunk'); return true; },
    finishFile() { events.push('finish-failed'); return ''; },
    getLastError() { return 'native finish failed'; },
    cancelFile() { events.push('cancel'); }
  });
  await assert.rejects(
    helper.saveToAndroidDownloads(new Blob(['fake synthetic archive']), 'paseka-full-backup-20261119.paseka'),
    /native finish failed/
  );
  assert.deepEqual(events, ['begin','chunk','finish-failed','cancel']);
});
