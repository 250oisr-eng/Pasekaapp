import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_APP_ID = 'ru.paseka.journal';
export const TEST_APP_ID = 'ru.paseka.journal.test.persistence2';
export const TEST_APP_NAME = 'Пасека — тест 2';

export function createIsolatedTestConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Capacitor config must be an object');
  }
  if (config.appId !== PRODUCTION_APP_ID) {
    throw new Error('Unexpected production appId; refusing to derive a test package from an unknown application');
  }
  return { ...config, appId: TEST_APP_ID, appName: TEST_APP_NAME };
}

export function assertIsolatedTestApplicationId(gradleSource) {
  if (typeof gradleSource !== 'string' || !/applicationId\s+["']ru\.paseka\.journal\.test["']/.test(gradleSource)) {
    throw new Error('Generated Android applicationId is not the isolated test id ru.paseka.journal.test.persistence2');
  }
  if (/applicationId\s+["']ru\.paseka\.journal["']/.test(gradleSource)) {
    throw new Error('Generated Android applicationId unexpectedly matches the production id');
  }
  return true;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const configPath = path.join(root, 'capacitor.config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const isolated = createIsolatedTestConfig(config);
  await writeFile(configPath, JSON.stringify(isolated, null, 2) + '\n', 'utf8');
  console.log('Configured isolated Android test package:', isolated.appId);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
