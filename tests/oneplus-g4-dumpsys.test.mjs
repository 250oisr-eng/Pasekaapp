import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectG4} from '../scripts/oneplus-g4-dumpsys.mjs';
const fixture=`     Last successful run: 2026-11-27 10:35:48
    JOB #u0a622/1346458437: e945f59 ru.paseka.journal.qa.daily/.PasekaDailyArchiveJob
      JobInfo:
        Service: ru.paseka.journal.qa.daily/.PasekaDailyArchiveJob
        PERIODIC: interval=+6h0m0s0ms flex=+1h0m0s0ms
        PERSISTED
        Unsatisfied constraints: TIMING_DELAY DEADLINE [0xc0000000]
     JobStatus{e945f59 #u0a622/1346458437 ru.paseka.journal.qa.daily/.PasekaDailyArchiveJob u=0 s=10622 TIME=+4h47m24s390ms:+5h47m24s390ms STORENOTLOW PERIODIC PERSISTED satisfied:0x3600008}
    JOB #u0a123/456: otherpkg/.OtherJob
      Last successful run: 2026-11-28 11:15:00`;
test('does not attribute neighboring job last-success to QA',()=>{
 const r=inspectG4(fixture);
 assert.equal(r.jobRegistered,true);assert.equal(r.jobSchedulerLastSuccessfulRun,null);
 assert.equal(r.backgroundExecution,'NOT_VERIFIED');
 assert.equal(r.periodicInterval,'+6h0m0s0ms');assert.equal(r.persisted,true);
 assert.equal(r.nextTimingWindow.earliest,'+4h47m24s390ms');
});
test('absent job remains NOT_VERIFIED',()=>{
 const r=inspectG4('JOB #x other/.Service');assert.equal(r.jobRegistered,false);
 assert.equal(r.backgroundExecution,'NOT_VERIFIED');
});
test('empty diagnostic blocks',()=>assert.throws(()=>inspectG4(''),/G4_BLOCKED/));
test('attributed scheduler last-success is still not verified archive proof',()=>{
 const r=inspectG4(fixture.replace('        PERSISTED\n','        PERSISTED\n        Last successful run: 2026-11-27 10:35:48\n'));
 assert.equal(r.jobSchedulerLastSuccessfulRun,'2026-11-27 10:35:48');
 assert.equal(r.backgroundExecution,'NOT_VERIFIED');
});
