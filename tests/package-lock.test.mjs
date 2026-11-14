import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const detectorPackage = JSON.parse(readFileSync(new URL('../capacitor-bee-detector/package.json', import.meta.url), 'utf8'));

test('npm lockfile is v3 and root dependency declarations match package.json', () => {
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages?.['']?.dependencies ?? {}, packageJson.dependencies ?? {});
  assert.deepEqual(lock.packages?.['']?.devDependencies ?? {}, packageJson.devDependencies ?? {});
});

test('local BeeDetector dependency is represented as a link to the checked-in package', () => {
  const link = lock.packages?.['node_modules/@paseka/capacitor-bee-detector'];
  const target = lock.packages?.['capacitor-bee-detector'];

  assert.deepEqual(link, { resolved: 'capacitor-bee-detector', link: true });
  assert.equal(target?.name, detectorPackage.name);
  assert.equal(target?.version, detectorPackage.version);
  assert.deepEqual(target?.peerDependencies ?? {}, detectorPackage.peerDependencies ?? {});
});
