import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { injectAndroidPersistenceProbe } from '../scripts/enable-android-persistence-probe.mjs';
import { assertAndroidPersistenceProbeAssets } from '../scripts/verify-android-persistence-probe-assets.mjs';

test('injects the diagnostic flag, visible fallback and script into generated Android test assets', () => {
  const source = '<html><head></head><body><section id="settings" class="panel"></section></body></html>';
  const result = injectAndroidPersistenceProbe(source);
  assert.ok(result.indexOf('window.__PASEKA_TEST_BUILD__ = true') < result.indexOf('androidPersistenceProbeFallback'));
  assert.ok(result.indexOf('androidPersistenceProbeFallback') < result.indexOf('android-persistence-probe.js'));
  assert.ok(result.indexOf('android-persistence-probe.js') < result.indexOf('</body>'));
  assert.equal((result.match(/android-persistence-probe[.]js/g) || []).length, 1);
});

test('refuses duplicate injection and malformed generated HTML', () => {
  assert.throws(() => injectAndroidPersistenceProbe('<body></body><script>window.__PASEKA_TEST_BUILD__=true</script>'), /already enabled/);
  assert.throws(() => injectAndroidPersistenceProbe('<html><body><section id="settings"></section></body><body></body></html>'), /exactly one/);
  assert.throws(() => injectAndroidPersistenceProbe('<html><body><section id="other"></section></body></html>'), /settings panel/);
  assert.throws(() => injectAndroidPersistenceProbe('<html><head></head></html>'), /closing body/);
});

test('production source index does not load the Android-only persistence probe', async () => {
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(source.includes('android-persistence-probe.js'), false);
  assert.equal(source.includes('__PASEKA_TEST_BUILD__'), false);
  assert.equal(source.includes('androidPersistenceProbeFallback'), false);
});

test('runtime probe is guarded, upgrades the visible fallback and uses regular persistence paths', async () => {
  const source = await readFile(new URL('../js/android-persistence-probe.js', import.meta.url), 'utf8');
  assert.ok(source.includes("window.__PASEKA_TEST_BUILD__ !== true"));
  assert.ok(source.includes("document.getElementById('androidPersistenceProbeFallback')"));
  assert.ok(source.includes('fallback.hidden = true'));
  assert.ok(source.includes('await save()'));
  assert.ok(source.includes('await readMain()'));
  assert.ok(source.includes('await writeAutoBackup(S'));
  assert.match(source, /androidPersistenceProbe/);
});

test('packaged assets verifier rejects a missing settings panel or runtime script', () => {
  const html = '<section id="settings"></section><script>window.__PASEKA_TEST_BUILD__ = true;</script><div id="androidPersistenceProbeFallback"></div><script src="./js/android-persistence-probe.js" onerror="document.getElementById(\'androidPersistenceProbeFallback\')"></script>';
  const runtime = "(function(){ if (window.__PASEKA_TEST_BUILD__ !== true) return; const markerKey = 'androidPersistenceProbe'; document.getElementById('settings'); document.getElementById('androidPersistenceProbeFallback'); settings.appendChild(panel); await save(); await readMain(); })();";
  assert.equal(assertAndroidPersistenceProbeAssets(html, runtime), true);
  assert.throws(() => assertAndroidPersistenceProbeAssets(html.replace('android-persistence-probe.js', 'missing.js'), runtime), /script reference/);
  assert.throws(() => assertAndroidPersistenceProbeAssets(html, ''), /runtime script/);
});
