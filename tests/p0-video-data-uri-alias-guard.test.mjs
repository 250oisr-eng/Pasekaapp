import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the same internal state scanners used by the two isolated atomic
// paths, without opening a real IndexedDB or touching any user media.
const cases = [
  ['video-archive-v2-entrance-atomic.js', 'noVideo', 'V2_ENTRANCE_VIDEO_STATE_UNSAFE'],
  ['video-archive-v2-entrance-quarantine-rollback.js', 'noOriginal', 'V2_QUARANTINE_STATE_BINARY'],
];
for (const [filename, name, code] of cases) {
  test(filename + ' rejects untracked video Data URL aliases recursively', async () => {
    const src = await readFile(new URL('../js/' + filename, import.meta.url), 'utf8');
    const match = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(match, name + ' must still be present');
    const fail = value => { const e = new Error(value); e.code = value; throw e; };
    const scan = new Function('fail', 'return (' + match[0] + ');')(fail);
    for (const type of [
      'video/mp4', 'application/octet-stream', 'application/x-matroska',
      'application/ogg', 'application/x-msvideo', 'application/vnd.apple.mpegurl'
    ]) {
      assert.throws(
        () => scan({meta:{notes:['safe', {nested:'data:' + type + ';base64,AAAA'}]}}),
        e => e.code === code, type + ' must fail closed'
      );
    }
    assert.throws(() => scan({nested:['blob:local-object-url']}), e => e.code === code);
    assert.doesNotThrow(() => scan({notes:'data:image/png;base64,AAAA', list:[{value:'ordinary note'}]}));
  });
}

test('recognition ledger rejects alternative video MIME payloads in structured results', async () => {
  const source = await readFile(new URL('../js/video-archive-v2-guard.js', import.meta.url), 'utf8');
  const root = {};
  new Function('window', source)(root);
  const validate = root.PasekaVideoArchiveV2Guard.validateRecognitionLedgerForV2;
  const record = {
    source: 'entrance_media', videoId: 'test-video', resultId: 'test-result',
    recognizedAt: '2026-11-20T00:00:00Z',
    stateRevisionId: 'test-revision',
    sourceSha256: 'a'.repeat(64), sourceBytes: 4,
    sourceEvidenceVersion: 1,
    sourceHashVerifiedAt: '2026-11-20T00:00:00Z',
    cleanupState: 'blocked_archive_safety',
    result: {observation:'synthetic'}
  };
  assert.equal(validate({version:1, entries:[record]}).entryCount, 1);
  for(const type of [
    'video/mp4', 'application/octet-stream', 'application/x-matroska',
    'application/ogg', 'application/x-msvideo', 'application/vnd.apple.mpegurl'
  ]) {
    const withBinary = {...record, result:{observation:'data:' + type + ';base64,AAAA'}};
    assert.throws(() => validate({version:1, entries:[withBinary]}),
      e => e.code === 'V2_RESULT_BINARY', type + ' must not pass as text observation');
  }
  assert.doesNotThrow(() => validate({
    version:1, entries:[{...record, result:{observation:'safe plain text'}}]
  }));
});
