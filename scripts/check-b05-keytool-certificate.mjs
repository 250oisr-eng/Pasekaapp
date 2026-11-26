import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// B05: a certificate match in a keystore is NOT proof of the ability to sign
// a candidate APK, the availability of the key password, or key backup.
export const INSTALLED_CERT_SHA256 = '9b10baf04e1e09bfe2d58e72b1c1eecf04b48f532940b5e91a3083bd73ddb0aa';

export function inspectKeytoolList(text, expected = INSTALLED_CERT_SHA256) {
  if(typeof text !== 'string' || text.length > 1024*1024)
    throw Error('BLOCKED: invalid or oversized local keytool report');
  const fingerprint = String(expected).toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(fingerprint)) throw Error('BLOCKED: invalid reference certificate');
  // keytool -list -v -alias XXX -keystore FILE prints one entry:
  // "Entry type: PrivateKeyEntry" and "SHA256: AA:BB..."
  // Never accept aggregate multi-alias text: a cert in another entry might match.
  const entryTypes = [...text.matchAll(/^\s*Entry type:\s*([^\r\n]+)\s*$/gmi)]
    .map(m=>m[1].trim());
  // Reject combined reports even when only one entry type is reported:
  // multiple aliases can represent several independent keystores entries.
  const aliases = [...text.matchAll(/^\\s*Alias name:\\s*([^\\r\\n]+)\\s*$/gmi)];
  const shaMatches = [...text.matchAll(/^\s*SHA256:\s*([0-9a-fA-F:]+)\s*$/gm)]
    .map(m=>m[1].replaceAll(':','').toLowerCase());
  if(aliases.length!==1 || entryTypes.length!==1 || shaMatches.length!==1)
    return {status:'BLOCKED_AMBIGUOUS_KEYSTORE_REPORT',certificateMatches:false,
      hasPrivateKeyEntry:false,canSignApk:false,backupVerified:false,installationAuthorized:false};
  const digest = shaMatches[0], privateKey = entryTypes[0]==='PrivateKeyEntry';
  if(!/^[0-9a-f]{64}$/.test(digest))
    return {status:'BLOCKED_INVALID_KEYSTORE_CERT',certificateMatches:false,
      hasPrivateKeyEntry:privateKey,canSignApk:false,backupVerified:false,installationAuthorized:false};
  const matches = digest===fingerprint;
  return {
    status: matches && privateKey ? 'MATCHING_PRIVATE_KEY_ENTRY_METADATA_ONLY' :
      matches ? 'MATCHING_CERTIFICATE_WITHOUT_PRIVATE_KEY' : 'DIFFERENT_CERTIFICATE_BLOCKED',
    certificateMatches:matches, hasPrivateKeyEntry:privateKey,
    canSignApk:false, backupVerified:false,installationAuthorized:false
  };
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    // Accept a pipe only; don't accept a keystore path or secret on the CLI.
    // Password prompts must be handled locally by keytool, not this checker.
    if(process.argv.length!==2 || process.stdin.isTTY)
      throw Error('BLOCKED: pipe single-alias keytool -list -v output on stdin');
    let report='';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      report+=chunk;
      if(report.length>1024*1024) throw Error('BLOCKED: keytool report too large');
    }
    const verdict=inspectKeytoolList(report);
    process.stdout.write(JSON.stringify(verdict)+'\n');
    if(verdict.status!=='MATCHING_PRIVATE_KEY_ENTRY_METADATA_ONLY')process.exitCode=1;
  }catch(_){
    // No keytool input, keystore aliases, paths or passwords echoed.
    process.stderr.write(JSON.stringify({status:'BLOCKED_KEY_CUSTODY_NOT_PROVEN'})+'\n');
    process.exitCode=1;
  }
}
