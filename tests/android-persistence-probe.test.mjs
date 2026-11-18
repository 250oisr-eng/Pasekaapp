import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { injectAndroidPersistenceProbe } from '../scripts/enable-android-persistence-probe.mjs';

test('injects the diagnostic flag and script into generated Android test assets', () => {
  const source = '<html><head></head><body><main>app</main></body></html>';
  const result = injectAndroidPersistenceProbe(source);
  assert.ok(result.indexOf('window.__PASEKA_TEST_BUILD__ = true') < result.indexOf('android-persistence-probe.js'));
  assert.ok(result.indexOf('android-persistence-probe.js') < result.indexOf('</body>'));
  assert.equal((result.match(/android-persistence-probe[.]js/g) || []).length, 1);
});

test('refuses duplicate injection and malformed generated HTML', () => {
  assert.throws(() => injectAndroidPersistenceProbe('<body></body><script>window.__PASEKA_TEST_BUILD__=true</script>'), /already enabled/);
  assert.throws(() => injectAndroidPersistenceProbe('<html><body></body></html><body></body>'), /exactly one/);
  assert.throws(() => injectAndroidPersistenceProbe('<html><head></head></html>'), /closing body/);
});

test('production source index does not load the Android-only persistence probe', async () => {
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(source.includes('android-persistence-probe.js'), false);
  assert.equal(source.includes('__PASEKA_TEST_BUILD__'), false);
});

test('runtime probe is guarded and uses the regular save, read and backup paths', async () => {
  const source = await readFile(new URL('../js/android-persistence-probe.js', import.meta.url), 'utf8');
  assert.ok(source.includes('window.__PASEKA_TEST_BUILD__ !== true'));
  assert.ok(source.includes('await save()'));
  assert.ok(source.includes('await readMain()'));
  assert.ok(source.includes('await writeAutoBackup(S'));
  assert.match(source, /androidPersistenceProbe/);
});
