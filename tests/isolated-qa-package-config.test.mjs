import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareIsolatedConfig } from '../scripts/prepare-oneplus-first-use-config.mjs';

const expected = {appId:'ru.paseka.journal',appName:'Пасека',webDir:'www',android:{allowMixedContent:false}};
const ref='refs/heads/fix/p0-first-launch-startup-write-gate-2026-11-24';
test('isolated QA app identity requires explicit opt-in and exact source branch',()=>{
 const qa=prepareIsolatedConfig(expected,{PASEKA_ISOLATED_FIRST_USE:'YES',GITHUB_REF:ref});
 assert.equal(qa.appId,'ru.paseka.journal.firstuseqa');
 assert.match(qa.appName,/тест/);
 assert.equal(expected.appId,'ru.paseka.journal','the source config must not mutate in memory');
 const pullRequestEnv={PASEKA_ISOLATED_FIRST_USE:'YES',GITHUB_REF:'refs/pull/469/merge',GITHUB_EVENT_NAME:'pull_request',GITHUB_HEAD_REF:'fix/p0-first-launch-startup-write-gate-2026-11-24'};
 assert.equal(prepareIsolatedConfig(expected,pullRequestEnv).appId,'ru.paseka.journal.firstuseqa');
 assert.throws(()=>prepareIsolatedConfig(expected,{...pullRequestEnv,GITHUB_HEAD_REF:'main'}),/ISOLATED_BUILD_GUARD/);
 assert.throws(()=>prepareIsolatedConfig(expected,{...pullRequestEnv,GITHUB_EVENT_NAME:'push'}),/ISOLATED_BUILD_GUARD/);
 assert.throws(()=>prepareIsolatedConfig(expected,{PASEKA_ISOLATED_FIRST_USE:'YES',GITHUB_REF:'refs/heads/main'}),/ISOLATED_BUILD_GUARD/);
 assert.throws(()=>prepareIsolatedConfig(expected,{PASEKA_ISOLATED_FIRST_USE:'NO',GITHUB_REF:ref}),/ISOLATED_BUILD_GUARD/);
 assert.throws(()=>prepareIsolatedConfig({...expected,appId:'ru.paseka.journal.firstuseqa'},{PASEKA_ISOLATED_FIRST_USE:'YES',GITHUB_REF:ref}),/ISOLATED_BUILD_GUARD/);
 assert.throws(()=>prepareIsolatedConfig({...expected,webDir:'dist'},{PASEKA_ISOLATED_FIRST_USE:'YES',GITHUB_REF:ref}),/ISOLATED_BUILD_GUARD/);
});
