import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../js/video-crossing-evidence.js',import.meta.url),'utf8');
const root={};new Function('window',src)(root);
const fn=root.PasekaVideoCrossingEvidence.classifyCrossing;
const line={a:{x:0,y:0.5},b:{x:1,y:0.5},insideSide:'positive',tolerance:0.01};
const points=y=>y.map((v,i)=>({x:0.5,y:v,timeSec:i+1}));
test('line orientation must be calibrated to distinguish in from out',()=>{
 const enter=fn(points([0.2,0.3,0.8]),line);
 const exit=fn(points([0.8,0.7,0.2]),line);
 assert.equal(enter.direction,'in');assert.equal(exit.direction,'out');
 assert.equal(enter.directionVerified,false);
 assert.equal(enter.recognitionSucceeded,false);
 assert.equal(enter.cleanupAuthorized,false);
 assert.equal(fn(points([0.2,0.3,0.8]),{...line,insideSide:'negative'}).direction,'out');
});
test('uncalibrated and impossible lines never invent directions',()=>{
 for(const calibration of [null,{}, {...line,insideSide:'unknown'},
  {...line,a:{x:0.5,y:0.5},b:{x:0.5,y:0.5}},
  {...line,tolerance:-1}]){const r=fn(points([0.2,0.3,0.8]),calibration);assert.equal(r.ok,false);assert.equal(r.direction,'unknown')}
});
test('lack of crossing or repeated crossing is unknown, not verified bee movement',()=>{
 const flat=fn(points([0.2,0.3,0.4]),line);
 assert.equal(flat.ok,true);assert.equal(flat.direction,'unknown');
 assert.equal(fn(points([0.2,0.8,0.2]),line).reason,'ambiguous_multiple_crossings');
 assert.equal(fn(points([0.2,0.5,0.8]),line).reason,'track_too_close_to_boundary');
});
test('gaps, duplicated times, invalid image coordinates do not become directions',()=>{
 for(const track of [points([0.2,0.8]),[{x:0.4,y:0.2,timeSec:1},{x:0.4,y:0.3,timeSec:1},{x:0.4,y:0.8,timeSec:3}],
  [{x:0.4,y:0.2,timeSec:1},{x:10,y:0.3,timeSec:2},{x:0.4,y:0.8,timeSec:3}],
  points([0.2,NaN,0.8])])assert.equal(fn(track,line).direction,'unknown');
});
test('geometry helper neither loads into UI nor sends image or frame data',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/src="\.\/js\/video-crossing-evidence\.js"/);
 assert.doesNotMatch(sw,/video-crossing-evidence\.js/);
 assert.doesNotMatch(src,/\bfetch\s*\(|\bindexedDB\b|\bXMLHttpRequest\b|\.transaction\s*\(/);
});
