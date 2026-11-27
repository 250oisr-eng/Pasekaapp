import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_ID = 'ru.paseka.journal';
export const QA_ID = 'ru.paseka.journal.qa.ux20261127';
export const QA_NAME = 'Пасека UX — проверка';

export function makeQaConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw Error('QA_BLOCKED: invalid Capacitor config');
  }
  if (config.appId !== PRODUCTION_ID || config.webDir !== 'www') {
    throw Error('QA_BLOCKED: unexpected production package or web directory');
  }
  if (config.server?.url || config.server?.allowNavigation ||
      config.android?.allowMixedContent !== false) {
    throw Error('QA_BLOCKED: remotely hosted or mixed-content Android shell');
  }
  return { ...config, appId: QA_ID, appName: QA_NAME };
}

export function assertQaGradle(source) {
  if (typeof source !== 'string') throw Error('QA_BLOCKED: missing Android Gradle source');
  const ids = [...source.matchAll(/\bapplicationId\s*(?:=\s*)?["']([^"']+)["']/g)].map(m => m[1]);
  if (ids.length !== 1 || ids[0] !== QA_ID) {
    throw Error('QA_BLOCKED: compiled applicationId is not uniquely isolated');
  }
  return true;
}

export async function writeWorkspaceQaConfig(filePath) {
  const config = JSON.parse(await readFile(filePath, 'utf8'));
  const qa = makeQaConfig(config);
  await writeFile(filePath, JSON.stringify(qa, null, 2) + '\n', 'utf8');
  return qa;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  writeWorkspaceQaConfig(join(root, 'capacitor.config.json'))
    .then(cfg => console.log('QA_WORKSPACE_CONFIGURED: ' + cfg.appId))
    .catch(e => { console.error(String(e.message)); process.exitCode = 1; });
}
