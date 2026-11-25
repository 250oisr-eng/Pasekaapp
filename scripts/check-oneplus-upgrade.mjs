import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EXPECTED_PACKAGE = 'ru.paseka.journal';

export function parseBadging(output) {
  const match = String(output).match(/^package:\s+name='([^']+)'\s+versionCode='(\d+)'/m);
  if (!match) throw new Error('BLOCKED: cannot parse APK package name and versionCode');
  const versionCode = Number(match[2]);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw new Error('BLOCKED: invalid versionCode');
  return { packageName: match[1], versionCode };
}

export function parseSigning(output) {
  const matches = [...String(output).matchAll(/^(?:Signer\s+#\d+|V\d+(?:\.\d+)?\s+Signer(?:\s+#\d+)?:)\s+certificate\s+SHA-256\s+digest:\s*([0-9a-f:]+)\s*$/gmi)];
  if (!matches.length) throw new Error('BLOCKED: cannot establish certificate SHA-256 fingerprint');
  const fingerprints = matches.map(m => m[1].replace(/:/g, '').toLowerCase());
  if (fingerprints.some(value => !/^[a-f0-9]{64}$/.test(value))) {
    throw new Error('BLOCKED: invalid certificate SHA-256 fingerprint');
  }
  return [...new Set(fingerprints)].sort();
}

export function evaluateUpgrade(installed, candidate) {
  if (installed.packageName !== EXPECTED_PACKAGE || candidate.packageName !== EXPECTED_PACKAGE) {
    throw new Error('BLOCKED: Android package IDs differ from the installed Paseka package');
  }
  if (!Array.isArray(installed.signers) || !Array.isArray(candidate.signers) ||
      installed.signers.length === 0 || candidate.signers.length === 0 ||
      installed.signers.join(',') !== candidate.signers.join(',')) {
    throw new Error('BLOCKED: signing certificate fingerprints differ or are unknown');
  }
  if (!Number.isSafeInteger(installed.versionCode) || !Number.isSafeInteger(candidate.versionCode) ||
      candidate.versionCode < installed.versionCode) {
    throw new Error('BLOCKED: candidate Android versionCode is older or unknown');
  }
  return { status: 'COMPATIBLE_METADATA_ONLY', packageName: EXPECTED_PACKAGE,
    installedVersionCode: installed.versionCode, candidateVersionCode: candidate.versionCode,
    certificateSha256: installed.signers };
}

function run(binary, args) {
  const command = typeof binary === 'string' ? binary : binary.command;
  const argv = typeof binary === 'string' ? args : [...binary.prefix, ...args];
  return execFileSync(command, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 }).trim();
}

function sdkTool(name) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) return name;
  const base = join(sdk, 'build-tools');
  const versions = readdirSync(base, { withFileTypes: true }).filter(x => x.isDirectory()).map(x => x.name).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }));
  if (!versions.length) throw new Error('BLOCKED: no Android SDK build tools');
  if (name === 'apksigner' && process.platform === 'win32') {
    return { command: 'java', prefix: ['-jar', join(base, versions[0], 'lib', 'apksigner.jar')] };
  }
  return join(base, versions[0], name + (process.platform === 'win32' ? '.exe' : ''));
}

export function connectedDevice(lines) {
  const entries = String(lines).split(/\r?\n/).slice(1).filter(x => x.trim());
  const online = entries.filter(x => /^\S+\s+device(?:\s|$)/.test(x));
  if (entries.length !== 1 || online.length !== 1) throw new Error('BLOCKED: require exactly one authorized online ADB device');
  return online[0].split(/\s+/)[0];
}

export function parseBaseApkPath(output) {
  const paths = String(output).split(/\r?\n/).filter(x => x.startsWith('package:'));
  const bases = paths.map(x => x.slice(8).trim()).filter(x => x.endsWith('/base.apk'));
  if (bases.length !== 1 || !bases[0].startsWith('/')) throw new Error('BLOCKED: exactly one installed base APK path required');
  return bases[0];
}

function inspect(path, aapt, apksigner, command=run) {
  return { ...parseBadging(command(aapt, ['dump', 'badging', path])),
    signers: parseSigning(command(apksigner, ['verify', '--print-certs', path])) };
}

// B04: read the actual installed APK, without requiring any candidate APK or
// performing an installation. Dependencies are injectable for isolated tests;
// production uses only ADB devices/pm path/pull and SDK metadata readers.
export function auditInstalledPackage({command=run,tool=sdkTool}={}) {
  const adb = 'adb', aapt = tool('aapt'), apksigner = tool('apksigner');
  const serial = connectedDevice(command(adb, ['devices', '-l']));
  const remote = parseBaseApkPath(command(adb, ['-s', serial, 'shell', 'pm', 'path', EXPECTED_PACKAGE]));
  const temporary = mkdtempSync(join(tmpdir(), 'paseka-installed-signing-readonly-'));
  try {
    const installedPath = join(temporary, 'installed-base.apk');
    command(adb, ['-s', serial, 'pull', remote, installedPath]);
    const installed = inspect(installedPath, aapt, apksigner, command);
    if(installed.packageName !== EXPECTED_PACKAGE || installed.signers.length !== 1)
      throw new Error('BLOCKED: installed package or signer identity is unsupported');
    return {status:'INSTALLED_APK_METADATA_READONLY',packageName:installed.packageName,
      versionCode:installed.versionCode,signers:installed.signers,
      installationAuthorized:false,upgradeCompatible:null};
  } finally {
    rmSync(temporary, {force:true,recursive:true});
  }
}

export function runPreflight(candidatePath) {
  if (!candidatePath || !candidatePath.endsWith('.apk')) throw new Error('Usage: node scripts/check-oneplus-upgrade.mjs /path/to/new.apk');
  const candidate = resolve(candidatePath);
  const current = auditInstalledPackage();
  const next = inspect(candidate, sdkTool('aapt'), sdkTool('apksigner'));
  return evaluateUpgrade({packageName:current.packageName,versionCode:current.versionCode,
    signers:current.signers}, next);
}

export function runArtifactPairPreflight(referencePath, candidatePath) {
  if (!referencePath?.endsWith('.apk') || !candidatePath?.endsWith('.apk')) {
    throw new Error('BLOCKED: require original and candidate .apk files; never compare ZIP artifacts as APKs');
  }
  const aapt = sdkTool('aapt');
  const apksigner = sdkTool('apksigner');
  return evaluateUpgrade(inspect(resolve(referencePath), aapt, apksigner), inspect(resolve(candidatePath), aapt, apksigner));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const artifactMode = process.argv[2] === '--compare-files';
    const installedOnly = process.argv[2] === '--installed-only';
    const result = installedOnly ? auditInstalledPackage()
      : artifactMode ? runArtifactPairPreflight(process.argv[3], process.argv[4]) : runPreflight(process.argv[2]);
    console.log(JSON.stringify(result, null, 2));
    console.log(artifactMode ? 'ARTIFACTS ONLY: this does not establish the certificate of the APK actually installed on OnePlus.' : installedOnly
      ? 'READ-ONLY DEVICE PROOF: no APK installation, backup, clearing, or device modification attempted.'
      : 'DEVICE APP METADATA ONLY: this does not authorize installation.');
    console.log('NOT AN INSTALLATION OR BACKUP TEST. Check backups and storage migration separately.');
  } catch (error) {
    console.error(error.message || String(error));
    process.exitCode = 1;
  }
}
