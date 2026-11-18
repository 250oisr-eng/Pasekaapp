import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function injectAndroidPersistenceProbe(html) {
  if (typeof html !== 'string' || !html.trim()) throw new Error('Generated web index is empty');
  if (html.includes('__PASEKA_TEST_BUILD__') || html.includes('android-persistence-probe.js')) {
    throw new Error('Persistence probe is already enabled; refusing duplicate injection');
  }
  const normalized = html.toLowerCase();
  const closingBody = normalized.lastIndexOf('</body>');
  if (closingBody < 0 || normalized.indexOf('</body>') !== closingBody) {
    throw new Error('Generated web index must contain exactly one closing body tag');
  }
  const settingsMatches = html.match(/<section\b[^>]*\bid=["']settings["'][^>]*>/gi) || [];
  if (settingsMatches.length !== 1) {
    throw new Error('Generated web index must contain exactly one settings panel');
  }
  const injection = [
    '<script>window.__PASEKA_TEST_BUILD__ = true;</script>',
    '<script>(function(){var s=document.getElementById("settings");if(!s)throw new Error("Settings panel is missing from isolated Android test assets");var n=document.createElement("div");n.id="androidPersistenceProbeFallback";n.className="card";n.setAttribute("role","status");n.textContent="Диагностический модуль сохранения загружается. Если это сообщение не исчезло, проверка сохранения не запускалась.";s.appendChild(n);})();</script>',
    '<script src="./js/android-persistence-probe.js" onerror="var n=document.getElementById(\'androidPersistenceProbeFallback\');if(n){n.textContent=\'Ошибка загрузки диагностического модуля. Сохранение не проверялось.\';}"></script>'
  ].join('\n') + '\n';
  return html.slice(0, closingBody) + injection + html.slice(closingBody);
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const indexPath = path.join(root, 'www', 'index.html');
  const html = await readFile(indexPath, 'utf8');
  await writeFile(indexPath, injectAndroidPersistenceProbe(html), 'utf8');
  console.log('Enabled the IndexedDB persistence probe in isolated Android test web assets only.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
