import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectKeytoolList,INSTALLED_CERT_SHA256} from '../scripts/check-b05-keytool-certificate.mjs';
const hex = INSTALLED_CERT_SHA256.toUpperCase().match(/../g).join(':');
const report=(type,cert)=>'Alias name: private-sensitive-name\nEntry type: '+type+'\nCertificate fingerprints:\n SHA256: '+cert+'\n';
test('matching PrivateKeyEntry is metadata only; cannot authorize signing or upgrade',()=>{
  const result=inspectKeytoolList(report('PrivateKeyEntry',hex));
  assert.equal(result.status,'MATCHING_PRIVATE_KEY_ENTRY_METADATA_ONLY');
  assert.equal(result.certificateMatches,true);
  assert.equal(result.hasPrivateKeyEntry,true);
  assert.equal(result.canSignApk,false);
  assert.equal(result.backupVerified,false);
  assert.equal(result.installationAuthorized,false);
  assert.doesNotMatch(JSON.stringify(result),/private-sensitive-name/);
});
test('trust store certificate with matching fingerprint is not a private signing key',()=>{
  const result=inspectKeytoolList(report('trustedCertEntry',hex));
  assert.equal(result.status,'MATCHING_CERTIFICATE_WITHOUT_PRIVATE_KEY');
  assert.equal(result.hasPrivateKeyEntry,false);
  assert.equal(result.canSignApk,false);
});
test('different signing certificate fails closed',()=>{
  const result=inspectKeytoolList(report('PrivateKeyEntry','ab'.repeat(32)));
  assert.equal(result.status,'DIFFERENT_CERTIFICATE_BLOCKED');
});
test('ambiguous multiple entries, missing private key type and missing SHA fail closed',()=>{
  const valid=report('PrivateKeyEntry',hex);
  for(const input of [valid+valid,valid+' SHA256: '+hex+'\n',
    'Alias name: X\n SHA256: '+hex+'\n','Entry type: PrivateKeyEntry\n',
    'Entry type: PrivateKeyEntry\nSHA256: '+hex.slice(0,-3)+'\n']){
    const outcome=inspectKeytoolList(input);
    assert.match(outcome.status,/^BLOCKED_/);
  }
});
test('no supplied keytool bytes and invalid reference never imply key custody',()=>{
  assert.match(inspectKeytoolList('').status,/^BLOCKED_/);
  assert.throws(()=>inspectKeytoolList('x'.repeat(1024*1024+1)),/BLOCKED/);
  assert.throws(()=>inspectKeytoolList('hi','garbage'),/BLOCKED/);
});
