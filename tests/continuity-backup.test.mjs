import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backupScript = join(root, 'scripts', 'create-git-backup.sh');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('Git backup script has valid Bash syntax', () => {
  const result = spawnSync('bash', ['-n', backupScript], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('Git backup refuses to omit uncommitted changes', () => {
  const temp = mkdtempSync(join(tmpdir(), 'paseka-dirty-backup-'));
  try {
    git(temp, 'init', '-b', 'main');
    git(temp, 'config', 'user.email', 'test@example.invalid');
    git(temp, 'config', 'user.name', 'Paseka test');
    writeFileSync(join(temp, 'tracked.txt'), 'initial');
    git(temp, 'add', 'tracked.txt');
    git(temp, 'commit', '-m', 'initial');
    writeFileSync(join(temp, 'tracked.txt'), 'changed');
    const result = spawnSync('bash', [backupScript, join(temp, 'backups')], { cwd: temp, encoding: 'utf8' });
    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /незакоммиченные изменения/i);
    assert.deepEqual(readdirSync(join(temp, 'backups')), []);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Git backup creates a verifiable bundle that can be cloned with branch history', () => {
  const temp = mkdtempSync(join(tmpdir(), 'paseka-clean-backup-'));
  try {
    const source = join(temp, 'source');
    const backups = join(temp, 'backups');
    mkdirSync(source);
    git(source, 'init', '-b', 'main');
    git(source, 'config', 'user.email', 'test@example.invalid');
    git(source, 'config', 'user.name', 'Paseka test');
    writeFileSync(join(source, 'journal.txt'), 'sample journal');
    git(source, 'add', 'journal.txt');
    git(source, 'commit', '-m', 'initial');
    git(source, 'checkout', '-b', 'feature/test-branch');
    writeFileSync(join(source, 'feature.txt'), 'branch content');
    git(source, 'add', 'feature.txt');
    git(source, 'commit', '-m', 'feature');

    const result = spawnSync('bash', [backupScript, backups], { cwd: source, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const bundleName = readdirSync(backups).find(name => name.endsWith('.bundle'));
    assert.ok(bundleName, 'bundle file should exist');
    const bundle = join(backups, bundleName);
    assert.ok(readdirSync(backups).includes(bundleName + '.sha256'), 'SHA-256 sidecar should exist');
    execFileSync('git', ['bundle', 'verify', bundle], { cwd: source, stdio: 'pipe' });

    const restored = join(temp, 'restored');
    execFileSync('git', ['clone', bundle, restored], { stdio: 'pipe' });
    assert.equal(readFileSync(join(restored, 'journal.txt'), 'utf8'), 'sample journal');
    assert.equal(readFileSync(join(restored, 'feature.txt'), 'utf8'), 'branch content');
    assert.ok(git(restored, 'branch', '-a').includes('feature/test-branch'));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
