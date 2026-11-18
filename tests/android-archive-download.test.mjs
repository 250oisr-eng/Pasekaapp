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
