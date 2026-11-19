import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('reverted archive sessions display their original backup ID', () => {
  assert.match(
    html,
    /description\.textContent\s*=\s*'Архив '\s*\+\s*\(session\.backupId\s*\|\|\s*session\.sourceBackupId\s*\|\|\s*'идентификатор не сохранён'\)/,
    'history renderer must use sourceBackupId after rollback removes backupId'
  );
});
