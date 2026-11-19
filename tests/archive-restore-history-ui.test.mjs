import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('reverted archive sessions display their original backup ID', () => {
  assert.ok(
    html.includes("description.textContent = 'Архив ' + (session.backupId || session.sourceBackupId || 'идентификатор не сохранён')"),
    'history renderer must use sourceBackupId after rollback removes backupId'
  );
});
