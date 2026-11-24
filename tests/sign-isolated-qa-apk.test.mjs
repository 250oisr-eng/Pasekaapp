import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateSigningInputs,validateSignedArtifact} from '../scripts/sign-isolated-qa-apk.mjs';

const certificate='a'.repeat(64);
const temp=mkdtempSync(join(tmpdir(),'paseka-qa-signing-tests-'));
const keystore=join(temp,'private-external-test.keystore');
const input=join(temp,'qa-unsigned.apk');
const output=join(temp,'qa-signed.apk');
writeFileSync(keystore,'synthetic-not-a-real-key');
writeFileSync(input,'synthetic-not-a-real-apk');
const env={
 PASEKA_SIGN_ISOLATED_QA:'YES',
 PASEKA_QA_KEYSTORE_PATH:keystore,
 PASEKA_QA_KEY_ALIAS:'qa',
 PASEKA_QA_STORE_PASSWORD:'REDACTED_TEST',
 PASEKA_QA_KEY_PASSWORD:'REDACTED_TEST',
 PASEKA_QA_CERT_SHA256:certificate
};
test('signing requires external key + explicit user-controlled flag + nonoverwriting output',()=>{
 const p=validateSigningInputs(env,input,output);
 assert.equal(p.expectedPackage,'ru.paseka.journal.firstuseqa');
 assert.equal(p.fingerprint,certificate);
 assert.throws(()=>validateSigningInputs({...env,PASEKA_SIGN_ISOLATED_QA:''},input,output),/BLOCKED/);
 assert.throws(()=>validateSigningInputs({...env,PASEKA_QA_STORE_PASSWORD:''},input,output),/BLOCKED/);
 assert.throws(()=>validateSigningInputs({...env,PASEKA_QA_CERT_SHA256:'badsignature'},input,output),/BLOCKED/);
 assert.throws(()=>validateSigningInputs(env,input,input),/BLOCKED/);
 assert.throws(()=>validateSigningInputs(env,'baseline.zip',output),/BLOCKED/);
 assert.throws(()=>validateSigningInputs({...env,PASEKA_QA_KEYSTORE_PATH:new URL('../package.json',import.meta.url).pathname},input,output),/Git worktree/);
 writeFileSync(output,'existing bytes');
 assert.throws(()=>validateSigningInputs(env,input,output),/BLOCKED/);
});
test('signer and package pin reject standard Paseka, mismatching cert, and multiple signers',()=>{
 const qa="package: name='ru.paseka.journal.firstuseqa' versionCode='2' versionName='test'";
 const regular="package: name='ru.paseka.journal' versionCode='2' versionName='test'";
 const good='Signer #1 certificate SHA-256 digest: '+certificate;
 assert.equal(validateSignedArtifact(qa,good,certificate).status,'SIGNED_QA_ARTIFACT_METADATA_VERIFIED');
 assert.throws(()=>validateSignedArtifact(regular,good,certificate),/BLOCKED/);
 assert.throws(()=>validateSignedArtifact(qa,'Signer #1 certificate SHA-256 digest: '+'b'.repeat(64),certificate),/BLOCKED/);
 assert.throws(()=>validateSignedArtifact(qa,good+'\nSigner #2 certificate SHA-256 digest: '+'b'.repeat(64),certificate),/BLOCKED/);
});
test('no signing credentials are embedded as literal secrets or CLI password arguments',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../scripts/sign-isolated-qa-apk.mjs',import.meta.url),'utf8');
 assert.match(source,/env:PASEKA_QA_STORE_PASSWORD/);
 assert.match(source,/env:PASEKA_QA_KEY_PASSWORD/);
 assert.doesNotMatch(source,/--ks-pass','pass:/);
});
test.after(()=>rmSync(temp,{recursive:true,force:true}));
