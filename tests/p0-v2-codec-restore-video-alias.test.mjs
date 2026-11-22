import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

// Execute the real isolated codec and restore preflight, never the live app.
const root = {};
for (const name of [
  'paseka-sha256.js',
  'video-archive-v2-guard.js',
  'video-archive-v2-metadata-codec.js',
  'video-archive-v2-restore-gate.js'
]) {
  new Function('window', await readFile(new URL('../js/' + name, import.meta.url), 'utf8'))(root);
}
const ledger = {version:1, entries:[]};
const state = () => ({meta:{schemaVersion:15,revisionId:'r1'},records:[],hives:[]});
const codec = root.PasekaVideoArchiveV2MetadataCodec;
const gate = root.PasekaVideoArchiveV2RestoreGate;
const guard = root.PasekaVideoArchiveV2Guard;
const binaryTypes = [
  'video/mp4','application/octet-stream','application/x-matroska',
  'application/ogg','application/x-msvideo','application/vnd.apple.mpegurl'
];
const video = id => ({source:'record_media',videoId:id,sourceSha256:'b'.repeat(64),sourceBytes:3});

test('PASEKA02 codec refuses embedded alternate video URLs and blob URLs before archive export', async () => {
  for (const type of binaryTypes) {
    const incoming = state();
    incoming.meta.note = 'Observation: data:' + type + ';base64,AAAA';
    await assert.rejects(
      codec.buildMetadataArchive({
        state:incoming,ledger,backupId:'alias-test',
        createdAt:'2026-11-23T00:00:00Z'
      },webcrypto,guard,root.PasekaSha256),
      e => e.code === 'V2_STATE_EMBEDDED_VIDEO',type
    );
  }
  const incoming = state();
  incoming.meta.note = 'temporary blob:local-file';
  await assert.rejects(
    codec.buildMetadataArchive({
      state:incoming,ledger,backupId:'blob-test',
      createdAt:'2026-11-23T00:00:00Z'
    },webcrypto,guard,root.PasekaSha256),
    e => e.code === 'V2_STATE_EMBEDDED_VIDEO'
  );
  const allowed = state();
  allowed.meta.note = 'data:image/png;base64,AAAA';
  const archive = await codec.buildMetadataArchive({
    state:allowed,ledger,backupId:'image-control',
    createdAt:'2026-11-23T00:00:00Z'
  },webcrypto,guard,root.PasekaSha256);
  assert.ok(archive.size > 12);
});

test('restore preflight refuses video bytes disguised as non-video journal media', () => {
  for(const type of binaryTypes) {
    const incoming = {
      state:{...state(),records:[{id:'record-1',media:[{
        kind:'image',data:'Observation: data:' + type + ';base64,AAAA'
      }]}]},
      ledger, pendingVideos:[]
    };
    assert.throws(
      () => gate.checkRestoreLedgerCandidate(ledger,incoming,guard),
      e => e.code === 'V2_RESTORE_UNCLASSIFIED_VIDEO', type
    );
  }
  const blobCandidate = {
    state:{...state(),records:[{id:'record-1',media:[{kind:'image',data:'blob:local'}]}]},
    ledger,pendingVideos:[]
  };
  assert.throws(
    () => gate.checkRestoreLedgerCandidate(ledger,blobCandidate,guard),
    e => e.code === 'V2_RESTORE_UNCLASSIFIED_VIDEO'
  );
});

test('live identity check includes alternate video aliases and refuses collision before restore', () => {
  for(const type of binaryTypes) {
    const live = {...state(),records:[{id:'record-1',media:[{
      kind:'image', videoId:'same-video',data:'data:' + type + ';base64,AAAA'
    }]}]};
    assert.throws(
      () => gate.checkLivePendingMediaIdentity(live,[],{pendingVideos:[video('same-video')]}),
      e => e.code === 'V2_RESTORE_LIVE_RECORD_ID_COLLISION',type
    );
  }
  assert.throws(
    () => gate.checkLivePendingMediaIdentity(
      {...state(),records:[{id:'record-1',media:[{kind:'image',videoId:'same-video',data:'blob:local'}]}]},
      [],{pendingVideos:[video('same-video')]}
    ),e => e.code === 'V2_RESTORE_LIVE_RECORD_ID_COLLISION'
  );
});
