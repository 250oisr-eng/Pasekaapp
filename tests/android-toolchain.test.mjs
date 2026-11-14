import test from 'node:test';
import assert from 'node:assert/strict';
import { patchAndroidGradleSources } from '../scripts/patch-android-gradle.mjs';

test('Android toolchain patch upgrades AGP and Gradle wrapper for API 36', () => {
  const result = patchAndroidGradleSources(
    "buildscript { dependencies { classpath 'com.android.tools.build:gradle:8.2.1' } }",
    'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2.1-all.zip\n'
  );
  assert.match(result.buildGradle, /com\.android\.tools\.build:gradle:8\.6\.1/);
  assert.match(result.wrapperProperties, /gradle-8\.7-all\.zip/);
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
