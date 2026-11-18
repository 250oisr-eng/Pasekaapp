import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ARCHIVE_TEST_APP_ID = 'ru.paseka.journal.archive.test2';
export const ARCHIVE_TEST_APP_NAME = 'Пасека — архив тест 2';

export function createArchiveTestConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('Capacitor configuration must be an object.');
  }
  if (config.appId !== 'ru.paseka.journal') {
    throw new Error('Refusing to derive an isolated archive test APK from an unexpected application ID.');
  }
  if (config.appId === ARCHIVE_TEST_APP_ID) {
    throw new Error('Archive test package ID is already active.');
  }
  return {
    ...config,
    appId: ARCHIVE_TEST_APP_ID,
    appName: ARCHIVE_TEST_APP_NAME
  };
}

async function main() {
  const configPath = resolve(process.argv[2] || 'capacitor.config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const isolated = createArchiveTestConfig(config);
  await writeFile(configPath, JSON.stringify(isolated, null, 2) + '\n', 'utf8');
  console.log('Prepared isolated archive test APK:', isolated.appId);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
