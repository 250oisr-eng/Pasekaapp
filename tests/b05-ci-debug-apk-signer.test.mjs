import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDebugApk,inspectDebugArtifact,INSTALLED_ONEPLUS_SHA256} from '../scripts/audit-ci-debug-apk-signer.mjs';

const badge="package: name='ru.paseka.journal' versionCode='1' versionName='test'";
const sign=hash=>'Signer #1 certificate SHA-256 digest: '+hash;
test('matching CI signing certificate is metadata only and never authorizes upgrade',()=>{
 const res=evaluateDebugApk({badging:badge,verifiedSigners:sign(INSTALLED_ONEPLUS_SHA256)});
 assert.equal(res.status,'CI_DEBUG_CERT_MATCHES_INSTALLED_METADATA_ONLY');
 assert.equal(res.matchesInstalledCertificate,true);
 assert.equal(res.privateKeyCustodyVerified,false);
 assert.equal(res.deviceUpgradeAuthorized,false);
 assert.equal(res.signedReleaseCandidateVerified,false);
});
test('different debug signing certificate is honestly reported as different, not deployment',()=>{
 const res=evaluateDebugApk({badging:badge,verifiedSigners:sign('a'.repeat(64))});
 assert.equal(res.status,'CI_DEBUG_CERT_DIFFERS_FROM_INSTALLED');
 assert.equal(res.matchesInstalledCertificate,false);
 assert.equal(res.deviceInstalled,false);
});
test('unknown package, malformed output and multiple signers fail closed',()=>{
 assert.throws(()=>evaluateDebugApk({badging:"package: name='ru.other' versionCode='1'",verifiedSigners:sign('a'.repeat(64))}),/BLOCKED/);
 assert.throws(()=>evaluateDebugApk({badging:badge,verifiedSigners:'bad signer'}),/BLOCKED/);
 assert.throws(()=>evaluateDebugApk({badging:badge,verifiedSigners:sign('a'.repeat(64))+'\nSigner #2 certificate SHA-256 digest: '+'b'.repeat(64)}),/BLOCKED/);
});
test('official AAPT/apksigner are invoked read-only with no signing or installation',()=>{
 const called=[];
 const command=(program,args)=>{
  called.push([program,args]);
  if(program.endsWith('/apksigner'))return sign(INSTALLED_ONEPLUS_SHA256);
  if(program.endsWith('/aapt'))return badge;
  throw Error('unknown tool');
 };
 const value=inspectDebugArtifact({androidHome:'/sdk',apk:'/tmp/debug.apk',
   exists:()=>true,command});
 assert.equal(value.matchesInstalledCertificate,true);
 assert.deepEqual(called.map(x=>x[1].slice(0,2)),[['verify','--print-certs'],['dump','badging']]);
 assert.equal(JSON.stringify(called).includes('install'),false);
 assert.equal(JSON.stringify(called).includes('keystore'),false);
});
test('missing SDK or APK is blocked before invoking external programs',()=>{
 assert.throws(()=>inspectDebugArtifact({androidHome:'',exists:()=>true}),/BLOCKED/);
 assert.throws(()=>inspectDebugArtifact({androidHome:'/sdk',exists:()=>false}),/BLOCKED/);
});
