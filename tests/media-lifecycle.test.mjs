import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../js/media-lifecycle.js',import.meta.url),'utf8');
const scope={};
new Function('window',source)(scope);
const Media=scope.PasekaMediaLifecycle;
const base=()=>({id:'job-1',kind:'image',hiveId:'hive-1',originalRef:'blob:job-1',status:'queued',retryCount:0,retainOriginal:false,createdAt:'2026-11-18T10:00:00.000Z'});

test('media lifecycle exports a closed set of states and queue eligibility',()=>{
 assert.equal(Media.MEDIA_JOB_STATES.length,9);
 assert.equal(Media.canStartMediaAnalysis(base()),true);
 assert.equal(Media.canDeleteMediaOriginal(base()),false);
});

test('queued media can enter analysis and records attempt time',()=>{
 const result=Media.transitionMediaJob(base(),'analyzing',{},'2026-11-18T10:01:00.000Z');
 assert.equal(result.ok,true);
 assert.equal(result.job.lastAttemptAt,'2026-11-18T10:01:00.000Z');
 assert.equal(Media.canStartMediaAnalysis(result.job),false);
});

test('analysis failure retains original and allows explicit retry',()=>{
 const started=Media.transitionMediaJob(base(),'analyzing',{},'2026-11-18T10:01:00.000Z').job;
 const failed=Media.transitionMediaJob(started,'failed_retryable',{lastError:'offline'},'2026-11-18T10:02:00.000Z');
 assert.equal(failed.ok,true);
 assert.equal(failed.job.retryCount,1);
 assert.equal(Media.canDeleteMediaOriginal(failed.job),false);
 assert.equal(Media.canStartMediaAnalysis(failed.job),true);
 const retried=Media.transitionMediaJob(failed.job,'analyzing',{},'2026-11-18T10:03:00.000Z');
 assert.equal(retried.ok,true);
});

test('permanent failure cannot delete the original and requires explicit requeue',()=>{
 const started=Media.transitionMediaJob(base(),'analyzing',{},'2026-11-18T10:01:00.000Z').job;
 const failed=Media.transitionMediaJob(started,'failed_permanent',{lastError:'unsupported'},'2026-11-18T10:02:00.000Z').job;
 assert.equal(Media.canDeleteMediaOriginal(failed),false);
 assert.equal(Media.canStartMediaAnalysis(failed),false);
 assert.equal(Media.transitionMediaJob(failed,'queued',{},'2026-11-18T10:03:00.000Z').ok,true);
});

test('an AI response alone is not a persisted result and cannot authorize deletion',()=>{
 const started=Media.transitionMediaJob(base(),'analyzing',{},'2026-11-18T10:01:00.000Z').job;
 const received=Media.transitionMediaJob(started,'result_received',{result:{observations:[]}},'2026-11-18T10:02:00.000Z');
 assert.equal(received.ok,true);
 assert.equal(Media.canDeleteMediaOriginal(received.job),false);
 assert.equal(Media.transitionMediaJob(received.job,'cleanup_pending',{},'2026-11-18T10:03:00.000Z').ok,false);
});

test('result_persisted requires a result ID, timestamp and original reference',()=>{
 const received=Media.transitionMediaJob(
  Media.transitionMediaJob(base(),'analyzing',{},'2026-11-18T10:01:00.000Z').job,
  'result_received',{},'2026-11-18T10:02:00.000Z'
 ).job;
 assert.deepEqual(
  Media.transitionMediaJob(received,'result_persisted',{resultId:'result-1'},'2026-11-18T10:03:00.000Z'),
  {ok:false,reason:'persisted_result_required'}
 );
 const withoutRef={...received,originalRef:null};
 assert.deepEqual(
  Media.transitionMediaJob(withoutRef,'result_persisted',{resultValidated:true,resultId:'result-1',resultPersistedAt:'2026-11-18T10:03:00.000Z'},'2026-11-18T10:03:00.000Z'),
  {ok:false,reason:'original_reference_required'}
 );
});

test('only a validated persisted result can authorize cleanup',()=>{
 const received=Media.transitionMediaJob(
  Media.transitionMediaJob(base(),'analyzing',{},'2026-11-18T10:01:00.000Z').job,
  'result_received',{},'2026-11-18T10:02:00.000Z'
 ).job;
 const persisted=Media.transitionMediaJob(received,'result_persisted',{
  resultValidated:true,resultId:'result-1',resultPersistedAt:'2026-11-18T10:03:00.000Z'
 },'2026-11-18T10:03:00.000Z');
 assert.equal(persisted.ok,true);
 assert.equal(Media.canDeleteMediaOriginal(persisted.job),false,'deletion is not authorized until cleanup is explicitly scheduled');
 const cleanup=Media.transitionMediaJob(persisted.job,'cleanup_pending',{},'2026-11-18T10:04:00.000Z');
 assert.equal(cleanup.ok,true);
 assert.equal(Media.canDeleteMediaOriginal(cleanup.job),true,'the idempotent cleanup worker may resume after restart');
});

test('user choice to retain original blocks cleanup',()=>{
 const received=Media.transitionMediaJob(
  Media.transitionMediaJob(base(),'analyzing',{},'2026-11-18T10:01:00.000Z').job,
  'result_received',{},'2026-11-18T10:02:00.000Z'
 ).job;
 const persisted=Media.transitionMediaJob(received,'result_persisted',{
  resultId:'result-1',resultPersistedAt:'2026-11-18T10:03:00.000Z'
 },'2026-11-18T10:03:00.000Z').job;
 const retained=Media.transitionMediaJob(persisted,'completed_retained',{retainOriginal:true},'2026-11-18T10:04:00.000Z');
 assert.equal(retained.ok,true);
 assert.equal(Media.canDeleteMediaOriginal(retained.job),false);
});

test('cleanup completion requires an explicit confirmed deletion timestamp',()=>{
 const received=Media.transitionMediaJob(
  Media.transitionMediaJob(base(),'analyzing',{},'2026-11-18T10:01:00.000Z').job,
  'result_received',{},'2026-11-18T10:02:00.000Z'
 ).job;
 const persisted=Media.transitionMediaJob(received,'result_persisted',{
  resultId:'result-1',resultPersistedAt:'2026-11-18T10:03:00.000Z'
 },'2026-11-18T10:03:00.000Z').job;
 const cleanup=Media.transitionMediaJob(persisted,'cleanup_pending',{},'2026-11-18T10:04:00.000Z').job;
 assert.equal(Media.transitionMediaJob(cleanup,'completed_deleted',{},'2026-11-18T10:05:00.000Z').ok,false);
 const deleted=Media.transitionMediaJob(cleanup,'completed_deleted',{
  originalDeleted:true,originalDeletedAt:'2026-11-18T10:05:00.000Z'
 },'2026-11-18T10:05:00.000Z');
 assert.equal(deleted.ok,true);
 assert.equal(deleted.job.status,'completed_deleted');
});

test('illegal transitions, invalid dates and missing states fail closed',()=>{
 assert.equal(Media.transitionMediaJob(base(),'completed_deleted',{},'2026-11-18T10:01:00.000Z').reason,'transition_not_allowed');
 assert.equal(Media.transitionMediaJob(base(),'analyzing',{},'not-a-date').reason,'invalid_transition_details');
 assert.equal(Media.transitionMediaJob(null,'analyzing').reason,'invalid_state');
});
