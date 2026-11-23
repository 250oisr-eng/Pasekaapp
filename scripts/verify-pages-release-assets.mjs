import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Verify the exact browser-only static artifact prepared from a checked-out
// immutable release SHA. Do not upload tests, .git, credentials or diagnostics.
const SHELL = ['index.html', 'manifest.webmanifest', 'sw.js', 'icons/paseka.svg'];

async function walk(directory, root) {
  const stat = await lstat(directory);
  if (stat.isSymbolicLink()) throw Error('Symlink is not allowed in release artifact: ' + directory);
  if (!stat.isDirectory()) throw Error('Expected directory: ' + directory);
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const entryStat = await lstat(path);
    if (entryStat.isSymbolicLink()) throw Error('Symlink is not allowed: ' + path);
    if (entryStat.isDirectory()) files.push(...await walk(path, root));
    else if (entryStat.isFile()) files.push(relative(root, path).split(sep).join('/'));
    else throw Error('Unexpected file type in release artifact: ' + path);
  }
  return files.sort();
}

export async function verifyPagesReleaseAssets(root = process.cwd()) {
  const source = resolve(root), output = join(source, 'www');
  const expectedJs = (await walk(join(source, 'js'), join(source, 'js'))).map(p => 'js/' + p);
  if (expectedJs.length < 1) throw Error('No JavaScript assets found in source');
  const expected = [...SHELL, ...expectedJs].sort();
  const actual = await walk(output, output);
  if (expected.join('\n') !== actual.join('\n')) {
    const missing = expected.filter(p => !actual.includes(p));
    const extra = actual.filter(p => !expected.includes(p));
    throw Error('Pages artifact differs from allowlisted browser assets: missing=' + missing.join(',') + ' extra=' + extra.join(','));
  }
  for (const name of expected) {
    const [sourceBuffer, releaseBuffer] = await Promise.all([
      readFile(join(source, name)),
      readFile(join(output, name))
    ]);
    if (!sourceBuffer.equals(releaseBuffer)) throw Error('Release artifact does not match checked-out source: ' + name);
  }
  return {files: expected.length, javascriptModules: expectedJs.length};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await verifyPagesReleaseAssets();
    console.log('PASS exact static release content:', JSON.stringify(result));
  } catch (error) {
    console.error('FAIL release asset verification:', error.message);
    process.exitCode = 1;
  }
}
