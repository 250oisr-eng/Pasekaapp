import test from 'node:test';
import assert from 'node:assert/strict';
import { patchAndroidGradleSources } from '../scripts/patch-android-gradle.mjs';

test('Android toolchain patch upgrades AGP and Gradle wrapper for API 36', () => {
  const result = patchAndroidGradleSources(
    "buildscript { dependencies { classpath 'com.android.tools.build:gradle:8.2.1' } }",
    'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2.1-all.zip\n'
  );
  assert.match(result.buildGradle, /com\.android\.tools\.build:gradle:8\.13\.0/);
  assert.match(result.wrapperProperties, /gradle-8\.14\.3-all\.zip/);
});

test('Android toolchain patch refuses an unknown AGP template', () => {
  assert.throws(
    () => patchAndroidGradleSources('plugins { id "com.android.application" }', 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2.1-all.zip\n'),
    /exactly one Android Gradle Plugin classpath/
  );
});

test('Android toolchain patch refuses an unknown wrapper template', () => {
  assert.throws(
    () => patchAndroidGradleSources("classpath 'com.android.tools.build:gradle:8.2.1'", 'distributionUrl=unknown\n'),
    /exactly one Gradle wrapper distribution URL/
  );
});

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('Android emulator smoke script is valid Bash and checks launch/crash state', () => {
  const scriptPath = fileURLToPath(new URL('../scripts/android-emulator-smoke.sh', import.meta.url));
  const syntax = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const source = readFileSync(scriptPath, 'utf8');
  assert.match(source, /adb install/);
  assert.match(source, /pidof/);
  assert.match(source, /FATAL EXCEPTION/);
  assert.match(source, /Fatal app crash detected/);
});
