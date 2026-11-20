import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../js/video-temporal-coverage.js',import.meta.url),'utf8');
const root={};new Function('window',code)(root);
const audit=root.PasekaVideoTemporalCoverage.auditTemporalCoverage;
const observations=[0,0.1,0.2,0.3].map(timeSec=>({trackId:'bee1',timeSec,x:0.5,y:0.5,confidence:0.9}));
const policy={maxGapSec:0.2,minObservations:3};
test('continuous synthetic observations are an unverified candidate, never proof of bee identity',()=>{
 const r=audit(observations,policy);
 assert.equal(r.ok,true);assert.equal(r.stage,'unverified_temporal_coverage');
 assert.ok(Math.abs(r.maxObservedGapSec-0.1)<1e-9);
 assert.equal(r.identityVerified,false);assert.equal(r.cleanupAuthorized,false);
 assert.equal(r.recognitionSucceeded,false);
});
test('no arbitrary default sampling gap is inferred from slow 2-4 JPEG screenshots',()=>{
 assert.equal(audit(observations).reason,'temporal_policy_required');
 const spaced=[0,15,30].map(timeSec=>({trackId:'bee1',timeSec,x:0.5,y:0.5,confidence:0.9}));
 assert.equal(audit(spaced,policy).reason,'temporal_gaps_too_large');
});
test('ID switches, duplicated timestamps and missing frames all fail closed',()=>{
 assert.equal(audit([{...observations[0]},{...observations[1],trackId:'another'},...observations.slice(2)],policy).reason,'track_identity_changed');
 assert.equal(audit([observations[0],{...observations[1],timeSec:0},...observations.slice(2)],policy).reason,'time_not_monotonic');
 assert.equal(audit(observations.slice(0,2),policy).reason,'insufficient_observations');
});
test('untrusted shapes and invalid policy cannot authorize tracking',()=>{
 assert.equal(audit([{...observations[0],x:NaN},...observations.slice(1)],policy).ok,false);
 assert.equal(audit(observations,{...policy,maxGapSec:0}).reason,'temporal_policy_required');
 assert.equal(audit(observations,{...policy,minObservations:1}).reason,'temporal_policy_required');
});
test('temporal helper is offline test-only, unconnected to production',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/src="\.\/js\/video-temporal-coverage\.js"/);
 assert.doesNotMatch(sw,/video-temporal-coverage\.js/);
 assert.doesNotMatch(code,/\bfetch\s*\(|\bXMLHttpRequest\b|\bindexedDB\b|\.transaction\s*\(/);
});
