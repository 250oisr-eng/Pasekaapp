import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const nativeBuild = readFileSync(new URL('../scripts/prepare-android-fileproof335-isolated-apk.mjs', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('./fixtures/android-fileproof335-start.js', import.meta.url), 'utf8');
const v10 = readFileSync(new URL('../tools/android-restore335-fixed-file-predicates-v10.ps1', import.meta.url), 'utf8');

function mockWebView(inputBridge) {
  let listener = null;
  const reports = [];
  const view = { textContent: '' };
  const root = {
    document: { getElementById: () => view },
    console: { info() {} },
    addEventListener(name, handler) {
      assert.equal(name, 'DOMContentLoaded');
      listener = handler;
    },
    PasekaRestore335Report: { report(value) { reports.push(JSON.parse(value)); } },
  };
  if (inputBridge) root.PasekaRestore335Input = inputBridge;
  vm.runInNewContext(bootstrap, {window: root}, {filename: 'android-fileproof335-start.js', timeout: 1000});
  assert.equal(typeof listener, 'function');
  return {start: listener, reports, view};
}

test('native build defines DISTINCT test archive input and potentially generated report', () => {
  assert.match(nativeBuild, /const INPUT='fileproof335-input\.paseka'/);
  assert.match(nativeBuild, /File destination=new File\(context\.getFilesDir\(\),"restore335-report\.json"\)/);
  assert.match(nativeBuild, /if\(destination\.exists\(\)\)return;/);
  assert.match(nativeBuild, /FileOutputStream stream=new FileOutputStream\(destination,false\)/);
  assert.match(nativeBuild, /readPinnedArchiveBase64\(\)/);
  assert.notEqual('restore335-report.json', 'fileproof335-input.paseka');
});

test('missing test archive can trigger a BLOCKED report without successful restore', async () => {
  const app = mockWebView({readPinnedArchiveBase64: () => 'BLOCKED:PRIVATE_FILE_MISSING_OR_SIZE'});
  await app.start();
  assert.equal(app.reports.length, 1);
  assert.equal(app.reports[0].status, 'BLOCKED');
  assert.equal(app.reports[0].code, 'BLOCKED:PRIVATE_FILE_MISSING_OR_SIZE');
  assert.equal(app.reports[0].recognitionSucceeded, false);
  assert.equal(app.reports[0].cleanupAuthorized, false);
});

test('missing native input bridge also triggers a BLOCKED report, not restored files', async () => {
  const app = mockWebView(null);
  await app.start();
  assert.equal(app.reports.length, 1);
  assert.equal(app.reports[0].status, 'BLOCKED');
  assert.equal(app.reports[0].code, 'ISOLATED_NATIVE_INPUT_REQUIRED');
  assert.equal(app.reports[0].recognitionSucceeded, false);
  assert.equal(app.reports[0].cleanupAuthorized, false);
});

test('V10 count-only and mismatched source name do not read contents or infer restore provenance', () => {
  assert.match(v10, /SOURCE_FIXED_NAME_NOT_MATCHED_PRESERVE/);
  assert.match(v10, /\$report\.sourceNamedEntry = 'NOT_MATCHED_PRESERVE'/);
  assert.match(v10, /privateInput = 'UNKNOWN_PRESERVE'/);
  assert.match(v10, /cleanup = 'NOT_AUTHORIZED'/);
  assert.doesNotMatch(v10, /Call-Adb[^\r\n]*'(?:cat|pull|dd|rm|clear|restore)'/i);
});
