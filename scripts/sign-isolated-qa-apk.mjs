import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseBadging, parseSigning } from './check-oneplus-upgrade.mjs';

const QA_PACKAGE = 'ru.paseka.journal.firstuseqa';
const SHA256 = /^[0-9a-f]{64}$/i;
const REQUIRED = ['PASEKA_QA_KEYSTORE_PATH', 'PASEKA_QA_KEY_ALIAS', 'PASEKA_QA_STORE_PASSWORD', 'PASEKA_QA_KEY_PASSWORD', 'PASEKA_QA_CERT_SHA256'];

export function validateSigningInputs(env, input, output) {
  if (env.PASEKA_SIGN_ISOLATED_QA !== 'YES') throw new Error('BLOCKED: explicit QA-only signing consent flag required');
  const missing = REQUIRED.filter(name => !env[name]);
  if (missing.length) throw new Error('BLOCKED: missing private signing configuration: ' + missing.join(', '));
  if (!SHA256.test(env.PASEKA_QA_CERT_SHA256)) throw new Error('BLOCKED: expected signing certificate SHA-256 is invalid');
  if (!input?.endsWith('.apk') || !output?.endsWith('.apk')) throw new Error('BLOCKED: input and output must be explicit .apk paths');
  if (resolve(input) === resolve(output)) throw new Error('BLOCKED: refusing in-place overwrite of source APK');
  if (!isAbsolute(env.PASEKA_QA_KEYSTORE_PATH)) throw new Error('BLOCKED: keystore must have an absolute external path');
  if (!existsSync(env.PASEKA_QA_KEYSTORE_PATH)) throw new Error('BLOCKED: external keystore is unavailable');
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const keyRelative = relative(repoRoot, realpathSync(env.PASEKA_QA_KEYSTORE_PATH));
  if (!keyRelative.startsWith('..') && !isAbsolute(keyRelative)) throw new Error('BLOCKED: keystore cannot be inside the Git worktree');
  if (existsSync(output)) throw new Error('BLOCKED: output already exists; will not overwrite');
  if (!existsSync(input)) throw new Error('BLOCKED: input APK is unavailable');
  if (basename(input) === basename(output)) throw new Error('BLOCKED: distinct APK filenames required');
  return {
    expectedPackage: QA_PACKAGE,
    fingerprint: env.PASEKA_QA_CERT_SHA256.toLowerCase(),
    keystore: env.PASEKA_QA_KEYSTORE_PATH,
    alias: env.PASEKA_QA_KEY_ALIAS,
    input: resolve(input), output: resolve(output)
  };
}

export function validateSignedArtifact(badging, certOutput, expectedFingerprint) {
  const apk = parseBadging(badging);
  if (apk.packageName !== QA_PACKAGE) throw new Error('BLOCKED: APK identity is not the isolated first-use QA package');
  const signers = parseSigning(certOutput);
  if (signers.length !== 1 || signers[0] !== expectedFingerprint.toLowerCase()) {
    throw new Error('BLOCKED: certificate mismatch / multiple signing identities');
  }
  return { status: 'SIGNED_QA_ARTIFACT_METADATA_VERIFIED', packageName: apk.packageName,
    versionCode: apk.versionCode, signerSha256: signers[0] };
}

// Kept separate from signing logic so missing SDK fails before touching output.
function sdkCommands(env) {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('BLOCKED: Android SDK path required');
  const dir = join(sdk, 'build-tools');
  const versions = readdirSync(dir,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
  if (!versions.length) throw new Error('BLOCKED: Android build-tools unavailable');
  const root=join(dir,versions[0]);
  const onWindows=process.platform==='win32';
  return {
    aapt: {bin:join(root, onWindows?'aapt.exe':'aapt'),prefix:[]},
    apksigner: onWindows ? {bin:'java',prefix:['-jar',join(root,'lib','apksigner.jar')]}
      : {bin:join(root,'apksigner'),prefix:[]}
  };
}

function call(command, args) {
  // Passwords are never passed as argv or written to logs; apksigner reads them by environment name.
  try {
    return execFileSync(command.bin,[...command.prefix,...args],{
      encoding:'utf8',env:process.env,stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024
    }).trim();
  } catch {
    throw new Error('BLOCKED: Android SDK signing or verification command failed (details suppressed)');
  }
}

export function signIsolatedQaApk(env, input, output) {
  const p = validateSigningInputs(env,input,output);
  const commands=sdkCommands(env);
  const before=parseBadging(call(commands.aapt,['dump','badging',p.input]));
  if(before.packageName !== QA_PACKAGE) throw new Error('BLOCKED: refusing to re-sign non-isolated Paseka APK');
  mkdirSync(dirname(p.output),{recursive:true});
  try {
    call(commands.apksigner,['sign','--ks',p.keystore,'--ks-key-alias',p.alias,
      '--ks-pass','env:PASEKA_QA_STORE_PASSWORD',
      '--key-pass','env:PASEKA_QA_KEY_PASSWORD',
      '--out',p.output,p.input]);
    const verified=call(commands.apksigner,['verify','--print-certs',p.output]);
    if (process.env.PASEKA_EPHEMERAL_CI_DIAGNOSTIC === 'YES' &&
        process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.CI === 'true') {
      console.log('EPHEMERAL_APK_PUBLIC_CERTIFICATE_OUTPUT='+JSON.stringify(verified.slice(0,1400)));
    }
    return validateSignedArtifact(call(commands.aapt,['dump','badging',p.output]),verified,p.fingerprint);
  } catch(error) {
    if(existsSync(p.output)) rmSync(p.output,{force:true});
    throw error;
  }
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result=signIsolatedQaApk(process.env,process.argv[2],process.argv[3]);
    console.log(JSON.stringify(result,null,2));
    console.log('QA APK is NOT approved for installation. Backup/restore and real device gates remain separate.');
  } catch(error) {
    console.error(error.message);
    process.exitCode=1;
  }
}
