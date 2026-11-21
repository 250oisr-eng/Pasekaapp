import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const FUNCTION_START = 'async function renderArchiveImportHistory() {';
const FUNCTION_END = '\n\nfunction validateBackupState(';

function makeNode(tagName) {
  return {
    tagName,
    className: '',
    type: '',
    textContent: '',
    hidden: false,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = children;
    },
    addEventListener(event, handler) {
      if (!this.listeners) this.listeners = {};
      this.listeners[event] = handler;
    }
  };
}

function collect(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of node.children || []) collect(child, predicate, found);
  return found;
}

function historyRenderer({ sessions = [], history = [] } = {}) {
  const start = html.indexOf(FUNCTION_START);
  const end = html.indexOf(FUNCTION_END, start);
  assert.ok(start >= 0 && end > start, 'actual history renderer must be extracted from index.html');

  const container = makeNode('section');
  const api = {
    listArchiveRestoreSessions: async () => sessions,
    listArchiveImportHistory: async () => history
  };
  const noAction = () => {
    throw new Error('Rendering the history must not perform a user action.');
  };
  const factory = new Function(
    '$', 'db', 'window', 'document', 'PasekaArchiveRestore',
    'finalizeFullArchiveStaging', 'resumeFullArchiveRestore',
    'rollbackFullArchiveImport', 'discardFullArchiveRollbackSnapshot',
    'setFullArchiveRestoreStatus', 'confirm',
    html.slice(start, end) + '\nreturn renderArchiveImportHistory;'
  );
  const render = factory(
    id => id === 'archiveImportHistory' ? container : null,
    { testDatabase: true },
    { PasekaArchiveRestore: api },
    { createElement: makeNode },
    api,
    noAction, noAction, noAction, noAction, noAction, noAction
  );
  return { render, container };
}

test('reverted archive session shows its preserved sourceBackupId rather than undefined', async () => {
  const fixture = historyRenderer({
    sessions: [{
      sessionId: 'session-1',
      kind: 'session',
      sourceBackupId: 'original-backup-42',
      status: 'reverted',
      stagedCount: 2,
      totalEntries: 2
    }]
  });
  await fixture.render();
  const descriptions = collect(fixture.container, node => node.tagName === 'p')
    .map(node => node.textContent);
  assert.ok(descriptions.some(text => text.includes('Архив original-backup-42 · reverted')));
  assert.ok(descriptions.every(text => !text.includes('undefined')));
});

test('archive history falls back to explicit wording for legacy sessions without either backup ID', async () => {
  const fixture = historyRenderer({
    sessions: [{
      sessionId: 'legacy-1',
      kind: 'session',
      status: 'failed',
      errorCode: 'UNKNOWN',
      stagedCount: 0,
      totalEntries: 1
    }]
  });
  await fixture.render();
  const paragraphs = collect(fixture.container, node => node.tagName === 'p')
    .map(node => node.textContent);
  assert.ok(paragraphs.some(text => text.includes('Архив идентификатор не сохранён')));
  assert.ok(paragraphs.every(text => !text.includes('undefined')));
});

test('committed import provides rollback action but reverted import does not', async () => {
  const record = {
    backupId: 'archive-7',
    importedAt: '2026-11-19T10:00:00.000Z',
    videoCount: 3
  };
  const committed = historyRenderer({
    history: [{ ...record, status: 'committed', rollbackSessionId: 'snapshot-7' }]
  });
  await committed.render();
  const buttonsBefore = collect(committed.container, node => node.tagName === 'button')
    .map(node => node.textContent);
  assert.ok(buttonsBefore.includes('Отменить восстановление'));
  assert.ok(buttonsBefore.includes('Удалить точку отката'));

  const reverted = historyRenderer({
    history: [{ ...record, status: 'reverted', rollbackSessionId: null }]
  });
  await reverted.render();
  const buttonsAfter = collect(reverted.container, node => node.tagName === 'button')
    .map(node => node.textContent);
  assert.ok(!buttonsAfter.includes('Отменить восстановление'));
  assert.ok(!buttonsAfter.includes('Удалить точку отката'));
  const textAfter = collect(reverted.container, node => node.tagName === 'p')
    .map(node => node.textContent);
  assert.ok(textAfter.some(text => text.includes('Архив archive-7 · восстановление отменено')));
});

test('empty archive history displays an explicit empty state', async () => {
  const fixture = historyRenderer();
  await fixture.render();
  const paragraphs = collect(fixture.container, node => node.tagName === 'p')
    .map(node => node.textContent);
  assert.deepEqual(paragraphs, ['Подготовленных архивов и истории восстановления пока нет.']);
});

test('source-backed regression guard preserves both ID fallback branches', () => {
  assert.ok(
    html.includes("description.textContent = 'Архив ' + (session.backupId || session.sourceBackupId || 'идентификатор не сохранён')"),
    'history renderer must use sourceBackupId after rollback removes backupId'
  );
});
