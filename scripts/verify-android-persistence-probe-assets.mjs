import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function assertAndroidPersistenceProbeAssets(html, probeSource) {
  if (typeof html !== 'string' || !html.trim()) throw new Error('Packaged Android index is missing or empty');
  if (typeof probeSource !== 'string' || !probeSource.trim()) throw new Error('Packaged persistence probe runtime script is missing or empty');
  if (!/id=["']settings["']/i.test(html)) throw new Error('Packaged Android index has no settings panel');
  if ((html.match(/__PASEKA_TEST_BUILD__/g) || []).length !== 1) throw new Error('Packaged Android index must contain exactly one isolated test-build flag');
  if ((html.match(/androidPersistenceProbeFallback/g) || []).length < 2) throw new Error('Packaged Android index has no visible diagnostic fallback');
  if ((html.match(/android-persistence-probe[.]js/g) || []).length !== 1) throw new Error('Packaged Android index must contain exactly one persistence probe script reference');
  if (!/src=["']\.\/js\/android-persistence-probe[.]js["']/i.test(html)) throw new Error('Packaged Android index has an unexpected persistence probe script reference');
  if (!probeSource.includes("window.__PASEKA_TEST_BUILD__ !== true")) throw new Error('Runtime script is missing its isolated test-build guard');
  if (!probeSource.includes("document.getElementById('settings')")) throw new Error('Runtime script does not locate the settings panel');
  if (!probeSource.includes("document.getElementById('androidPersistenceProbeFallback')")) throw new Error('Runtime script does not handle the diagnostic fallback');
  if (!probeSource.includes('settings.appendChild(panel)')) throw new Error('Runtime script does not attach the diagnostic card');
  if (!probeSource.includes('await save()') || !probeSource.includes('await readMain()')) throw new Error('Runtime script is missing the regular IndexedDB save/read path');
  return true;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const htmlPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html');
  const scriptPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public', 'js', 'android-persistence-probe.js');
  const [html, probeSource] = await Promise.all([readFile(htmlPath, 'utf8'), readFile(scriptPath, 'utf8')]);
  assertAndroidPersistenceProbeAssets(html, probeSource);
  console.log('Verified the isolated IndexedDB probe is present in the Android packaged web assets.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
