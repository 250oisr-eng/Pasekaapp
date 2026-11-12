import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AGP_VERSION = '8.6.1';
const GRADLE_VERSION = '8.7';

export function patchAndroidGradleSources(buildGradle, wrapperProperties) {
  const agpPattern = /(classpath\s+['"]com\.android\.tools\.build:gradle:)[^'"]+(['"])/g;
  const agpMatches = [...buildGradle.matchAll(agpPattern)];
  if (agpMatches.length !== 1) {
    throw new Error('Expected exactly one Android Gradle Plugin classpath declaration; found ' + agpMatches.length + '. Refusing to guess the generated project format.');
  }
  const patchedBuildGradle = buildGradle.replace(agpPattern, '$1' + AGP_VERSION + '$2');

  const wrapperPattern = /^distributionUrl=.*gradle-[^/\s]+-(?:all|bin)\.zip.*$/gm;
  const wrapperMatches = [...wrapperProperties.matchAll(wrapperPattern)];
  if (wrapperMatches.length !== 1) {
    throw new Error('Expected exactly one Gradle wrapper distribution URL; found ' + wrapperMatches.length + '. Refusing to guess the generated project format.');
  }
  const patchedWrapper = wrapperProperties.replace(
    wrapperPattern,
    'distributionUrl=https\\://services.gradle.org/distributions/gradle-' + GRADLE_VERSION + '-all.zip'
  );

  if (!patchedBuildGradle.includes('com.android.tools.build:gradle:' + AGP_VERSION) ||
      !patchedWrapper.includes('gradle-' + GRADLE_VERSION + '-all.zip')) {
    throw new Error('Android Gradle toolchain verification failed.');
  }
  return { buildGradle: patchedBuildGradle, wrapperProperties: patchedWrapper };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const buildPath = path.join(root, 'android', 'build.gradle');
  const wrapperPath = path.join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
  const [buildGradle, wrapperProperties] = await Promise.all([
    fs.readFile(buildPath, 'utf8'),
    fs.readFile(wrapperPath, 'utf8')
  ]);
  const patched = patchAndroidGradleSources(buildGradle, wrapperProperties);
  await Promise.all([
    fs.writeFile(buildPath, patched.buildGradle),
    fs.writeFile(wrapperPath, patched.wrapperProperties)
  ]);
  console.log('Android Gradle Plugin ' + AGP_VERSION + '; Gradle ' + GRADLE_VERSION + '; target API 35 compatibility toolchain configured.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
