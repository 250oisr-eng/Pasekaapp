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
  for(const flag of ['overexposed','blurred','high_frame_difference','entrance_out_of_frame'])assert.ok(q.flags.includes(flag));
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

test('entrance video preview releases the object URL on every dialog close path', () => {
  assert.match(html, /onclose="cleanupEntranceVideoPreview\(\)"/);
  assert.match(html, /function cleanupEntranceVideoPreview\(\)/);
  assert.match(html, /URL\.revokeObjectURL\(entrancePreviewUrl\)/);
});


test('entrance frame quality refuses to score insufficient or malformed samples', () => {
  assert.deepEqual(entrance.assessFrameQuality([]), {status:'unknown',score:null,flags:['insufficient_samples']});
  assert.equal(entrance.assessFrameQuality([{brightness:0.5,sharpness:80,motion:0.01}]).status,'unknown');
  const malformed=entrance.assessFrameQuality([
    {brightness:NaN,sharpness:80,motion:0.01},
    {brightness:0.5,sharpness:80,motion:0.01},
    {brightness:0.5,sharpness:80,motion:0.01}
  ]);
  assert.equal(malformed.status,'unknown');
  assert.ok(malformed.flags.includes('invalid_samples'));
});

test('entrance metadata accepts supported boundary values and rejects unsupported MIME types', () => {
  const boundary=entrance.assessVideoMetadata({durationSec:20,width:640,height:360,bytes:250*1024*1024,mimeType:'video/mp4'});
  assert.equal(boundary.ok,true);
  const unsupported=entrance.assessVideoMetadata({durationSec:60,width:1920,height:1080,bytes:1000,mimeType:'application/octet-stream'});
  assert.equal(unsupported.ok,false);
  assert.ok(unsupported.errors.some(x=>x.code==='unsupported_video_type'));
});

test('entrance metrics reject invalid duration and apply confidence threshold consistently', () => {
  assert.equal(entrance.computeMetrics([],0).ok,false);
  const result=entrance.computeMetrics([
    {id:'a',className:'bee',direction:'in',confidence:0.59,pollen:true,pollenConfidence:0.99},
    {id:'b',className:'bee',direction:'in',confidence:0.6,pollen:true,pollenConfidence:0.6},
    {id:'c',className:'bee',direction:'in',confidence:0.95,pollen:false,pollenConfidence:0.95}
  ],30,{confidenceThreshold:0.6});
  assert.equal(result.counts.returningBeeTracks,2);
  assert.equal(result.counts.incomingPerMinute,4);
  assert.equal(result.counts.pollenCarriers,1);
  assert.equal(result.counts.pollenNegative,1);
  assert.equal(result.counts.pollenShare,0.5);
});

test('entrance anomaly baseline never triggers with fewer than five comparable observations', () => {
  const history=Array.from({length:4},()=>({quality:{countReliable:true},metrics:{incomingPerMinute:100}}));
  const result=entrance.detectAnomalies({
    quality:{status:'good',countReliable:true},
    metrics:{incomingPerMinute:1}
  },history);
  assert.deepEqual(result.alerts,[]);
  assert.equal(result.baseline.incomingPerMinute.ready,false);
});

test('entrance archive UI does not submit local video or blobs to a remote endpoint', () => {
  const archiveSection=html.slice(html.indexOf('data-tab="entrance"'));
  assert.match(archiveSection,/local_only|waiting_for_server/);
  assert.match(archiveSection,/Сервер анализа ещё не подключён/);
  assert.doesNotMatch(archiveSection,/fetch\s*\([^)]*(?:video|blob|entrance_media)/i);
});


test('pixel measurement computes luminance, edge sharpness and temporal difference from real image data', () => {
  const width=16,height=16;
  const flat=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++){flat[i*4]=128;flat[i*4+1]=128;flat[i*4+2]=128;flat[i*4+3]=255;}
  const uniform=entrance.measureFramePixels({data:flat},width,height);
  assert.equal(uniform.ok,true);
  assert.ok(Math.abs(uniform.brightness-128/255)<0.001);
  assert.equal(uniform.sharpness,0);
  const checker=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,v=(x+y)%2?255:0;checker[i]=v;checker[i+1]=v;checker[i+2]=v;checker[i+3]=255;}
  const textured=entrance.measureFramePixels({data:checker},width,height,flat.length===width*height*4?Float32Array.from({length:width*height},()=>128):null);
  assert.ok(textured.sharpness>uniform.sharpness);
  assert.ok(textured.motion>0);
  assert.equal(entrance.measureFramePixels({data:new Uint8ClampedArray(4)},1,1).ok,false);
});

test('frame quality does not claim entrance framing was verified when no detector supplied it', () => {
  const quality=entrance.assessFrameQuality([
    {brightness:0.5,sharpness:80,motion:0.01},
    {brightness:0.51,sharpness:82,motion:0.02},
    {brightness:0.49,sharpness:78,motion:0.01}
  ]);
  assert.equal(quality.measured.entranceCoverage,null);
  assert.ok(quality.limitations.includes('entrance_framing_not_automatically_verified'));
  assert.equal(quality.score,0.75);
});

test('video sampler clearly reports unavailable browser decoding instead of fabricating samples', async () => {
  const result=await entrance.sampleVideoFrames({duration:60,currentTime:0});
  assert.equal(result.ok,false);
  assert.equal(result.reason,'video_unavailable');
  assert.deepEqual(result.samples,[]);
});
