import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../js/video-private-camera.js',import.meta.url),'utf8');
const root={};new Function('window',src)(root);const start=root.PasekaPrivateCameraCapture.startPrivateCapture;
function fake({deny=false,supported=true,empty=false}={}){
 let stopped=0,requested=0,stream;
 stream={getTracks(){return [{stop(){stopped++}}]}};
 class Recorder{
  static isTypeSupported(){return supported}
  constructor(){this.state='inactive';this.mimeType='video/webm'}
  start(){this.state='recording'}
  stop(){
   this.state='inactive';
   queueMicrotask(()=>{
    this.ondataavailable?.({data:empty?new Blob([]):new Blob(['sample'])});
    this.onstop?.();
   });
  }
 }
 const mediaDevices={async getUserMedia(constraints){
  requested++;assert.equal(constraints.audio,false);
  if(deny)throw Error('permission');
  return stream;
 }};
 return {mediaDevices,MediaRecorder:Recorder,stats:()=>({stopped,requested})};
}
test('opt-in in-memory camera capture closes tracks, returns Blob, never grants cleanup',async()=>{
 const f=fake();const session=await start(f);
 assert.equal(session.ok,true);assert.equal(session.stage,'recording_in_memory');
 const done=await session.stop();assert.equal(done.ok,true);
 assert.equal(done.video.size,6);assert.equal(done.captureSource,'in_app_media_recorder');
 assert.equal(done.externalCopiesVerified,false);assert.equal(done.recognitionSucceeded,false);
 assert.equal(done.cleanupAuthorized,false);
 assert.equal(f.stats().stopped,1);
});
test('permission denied and unsupported MIME cannot leak active camera tracks',async()=>{
 const denied=fake({deny:true});assert.equal((await start(denied)).reason,'camera_start_failed');
 const noMIME=fake({supported:false});assert.equal((await start(noMIME)).reason,'recorder_format_unavailable');
 assert.equal(noMIME.stats().stopped,1);
});
test('empty capture does not save or claim recognition',async()=>{
 const f=fake({empty:true}),s=await start(f),res=await s.stop();
 assert.equal(res.ok,false);assert.equal(res.reason,'empty_recording');
 assert.equal(res.video,null);assert.equal(f.stats().stopped,1);
});
test('no camera API or model remains a strict refusal',async()=>{
 const x=await start({mediaDevices:{},MediaRecorder:class {}});
 assert.equal(x.ok,false);assert.equal(x.reason,'camera_unavailable');
 assert.equal(x.cleanupAuthorized,false);
});
test('private capture is not wired to UI and contains no file/MediaStore/network/DB access',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/src="\.\/js\/video-private-camera\.js"/);
 assert.doesNotMatch(sw,/video-private-camera\.js/);
 assert.doesNotMatch(src,/\bfetch\s*\(|\bXMLHttpRequest\b|\bindexedDB\b|\.transaction\s*\(|\bMediaStore\b/);
});
