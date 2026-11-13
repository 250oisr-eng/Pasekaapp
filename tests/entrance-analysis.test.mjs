import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/entrance-analysis.js', import.meta.url), 'utf8');
const api = {};
new Function('window', source)(api);
const entrance = api.PasekaEntranceAnalysis;

test('entrance video metadata rejects unusable duration, size and resolution', () => {
  const bad = entrance.assessVideoMetadata({durationSec:8,width:320,height:200,bytes:0,mimeType:'video/mp4'});
  assert.equal(bad.ok,false);
  assert.ok(bad.errors.some(x=>x.code==='duration_out_of_range'));
  assert.ok(bad.errors.some(x=>x.code==='resolution_too_low'));
  assert.ok(bad.errors.some(x=>x.code==='file_size_invalid'));
  const good = entrance.assessVideoMetadata({durationSec:60,width:1920,height:1080,bytes:12_000_000,mimeType:'video/mp4'});
  assert.equal(good.ok,true);
  assert.equal(good.stage,'metadata_only');
  assert.match(good.note,/ещё не оценены/);
});

test('entrance frame quality reports shake, blur, exposure and framing flags', () => {
  const q=entrance.assessFrameQuality([
    {brightness:0.99,sharpness:12,motion:0.4,entranceCoverage:0.6},
    {brightness:0.98,sharpness:15,motion:0.5,entranceCoverage:0.7},
    {brightness:0.99,sharpness:10,motion:0.6,entranceCoverage:0.5}
  ]);
  assert.equal(q.status,'poor');
  for(const flag of ['overexposed','blurred','camera_shake','entrance_out_of_frame'])assert.ok(q.flags.includes(flag));
});

test('entrance metrics count unique tracks, not repeated frame detections', () => {
  const tracks=[
    {id:'a',className:'bee',direction:'in',confidence:0.95,pollen:true,pollenConfidence:0.92},
    {id:'a',className:'bee',direction:'in',confidence:0.95,pollen:true,pollenConfidence:0.92},
    {id:'b',className:'bee',direction:'in',confidence:0.9,pollen:false,pollenConfidence:0.9},
    {id:'c',className:'bee',direction:'out',confidence:0.9},
    {id:'d',className:'wasp',direction:'in',confidence:0.9},
    {id:'e',className:'drone',direction:'in',confidence:0.9}
  ];
  const result=entrance.computeMetrics(tracks,60,{trackingCoverage:0.9,crowdingScore:0.1});
  assert.equal(result.ok,true);
  assert.equal(result.counts.returningBeeTracks,2);
  assert.equal(result.counts.incomingPerMinute,2);
  assert.equal(result.counts.outgoingPerMinute,1);
  assert.equal(result.counts.pollenShare,0.5);
  assert.equal(result.counts.pollenUnclassified,0);
  assert.equal(result.counts.waspLike,1);
  assert.equal(result.counts.drones,1);
  assert.equal(result.quality.countReliable,true);
});

test('entrance metrics flag crowded flow and preserve unknown pollen classifications', () => {
  const result=entrance.computeMetrics([
    {id:'a',className:'bee',direction:'in',confidence:0.9,pollen:true,pollenConfidence:0.9},
    {id:'b',className:'bee',direction:'in',confidence:0.9},
    {id:'c',className:'bee',direction:'in',confidence:0.9,pollenConfidence:0.2}
  ],60,{trackingCoverage:0.4,crowdingScore:0.8});
  assert.equal(result.counts.pollenUnclassified,2);
  assert.equal(result.counts.pollenShare,1);
  assert.equal(result.quality.countReliable,false);
  assert.ok(result.quality.flags.includes('low_tracking_coverage'));
  assert.ok(result.quality.flags.includes('crowded_flow'));
});

test('entrance baseline requires five valid observations and uses median/MAD', () => {
  const history=[1,2,3,4].map(value=>({quality:{countReliable:true},metrics:{incomingPerMinute:value}}));
  assert.equal(entrance.summarizeBaseline(history,'incomingPerMinute').ready,false);
  history.push({quality:{countReliable:true},metrics:{incomingPerMinute:100}});
  const baseline=entrance.summarizeBaseline(history,'incomingPerMinute');
  assert.equal(baseline.ready,true);
  assert.equal(baseline.median,3);
  assert.equal(baseline.mad,1);
});

test('entrance anomaly engine suppresses poor video and emits cautious recommendations', () => {
  const history=Array.from({length:6},()=>({quality:{countReliable:true},metrics:{incomingPerMinute:100,pollenShare:0.3,waspLike:1,deadBees:0,drones:2}}));
  const poor=entrance.detectAnomalies({quality:{status:'poor',countReliable:false},metrics:{incomingPerMinute:2}},history);
  assert.deepEqual(poor.alerts,[]);
  assert.ok(poor.suppressed.includes('video_quality_or_tracking_insufficient'));
  const result=entrance.detectAnomalies({quality:{status:'good',countReliable:true},metrics:{incomingPerMinute:30,pollenShare:0.1,waspLike:4,deadBees:3,drones:2}},history,{weatherComparable:false});
  assert.ok(result.alerts.some(x=>x.id==='activity_drop'));
  assert.ok(result.alerts.some(x=>x.id==='pollen_share_drop'));
  assert.ok(result.alerts.some(x=>x.id==='wasp_activity_rise'));
  assert.ok(result.alerts.every(x=>x.diagnosis===false&&x.requiresHumanCheck===true));
  assert.ok(result.alerts.some(x=>x.contextWarning));
});

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
test('entrance video archive is available offline and stores blobs separately from the main state', () => {
  assert.match(html, /data-tab="entrance"/);
  assert.match(html, /id="entranceVideoInput"[^>]*capture="environment"/);
  assert.match(html, /indexedDB\.open\(DB,3\)/);
  assert.match(html, /createObjectStore\('entrance_media',\{keyPath:'id'\}\)/);
  assert.match(html, /transaction\('entrance_media','readwrite'\)/);
  assert.match(html, /Сервер анализа ещё не подключён/);
});
