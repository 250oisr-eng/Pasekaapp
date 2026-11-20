(function(root){
'use strict';
// Deliberately not loaded by the live UI. Browser MediaRecorder, no Gallery/file-picker or persistence.
const MAX_BYTES=250*1024*1024;
const failure=reason=>({ok:false,reason,video:null,externalCopiesVerified:false,
  recognitionSucceeded:false,cleanupAuthorized:false});
function release(stream){
 try{for(const track of stream?.getTracks?.()||[])track.stop()}catch{}
}
async function startPrivateCapture(options={}){
 const md=options.mediaDevices||root.navigator?.mediaDevices;
 const Recorder=options.MediaRecorder||root.MediaRecorder;
 if(!md||typeof md.getUserMedia!=='function'||typeof Recorder!=='function')
  return failure('camera_unavailable');
 let stream,recorder,timeout;const chunks=[];let bytes=0,reason=null,settled=false,resolveDone;
 const completed=new Promise(resolve=>{resolveDone=resolve});
 const finish=result=>{
  if(settled)return;settled=true;
  if(timeout)clearTimeout(timeout);
  release(stream);
  chunks.length=0;
  resolveDone(result);
 };
 try{
  // Must be called from a future explicit click handler, never during startup.
  stream=await md.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
  if(!stream||!stream.getTracks?.().length){release(stream);return failure('camera_stream_invalid')}
  const supported=['video/webm;codecs=vp8','video/webm','video/mp4'].find(type=>Recorder.isTypeSupported?.(type));
  if(!supported){release(stream);return failure('recorder_format_unavailable')}
  recorder=new Recorder(stream,{mimeType:supported});
  recorder.ondataavailable=event=>{
   if(settled||!event?.data||!Number.isSafeInteger(event.data.size)||event.data.size<0){
    reason='recorded_chunk_invalid';try{recorder.stop()}catch{};return;
   }
   bytes+=event.data.size;
   if(bytes>MAX_BYTES){reason='recording_size_limit';try{recorder.stop()}catch{};return}
   if(event.data.size>0)chunks.push(event.data);
  };
  recorder.onerror=()=>{reason='recorder_failed';try{recorder.stop()}catch{finish(failure(reason))}};
  recorder.onstop=()=>{
   if(reason)return finish(failure(reason));
   if(bytes<=0)return finish(failure('empty_recording'));
   const video=new Blob(chunks,{type:recorder.mimeType||supported});
   if(video.size!==bytes)return finish(failure('size_inconsistent'));
   finish({ok:true,video,bytes,mimeType:video.type,
    captureSource:'in_app_media_recorder',externalCopiesVerified:false,
    recognitionSucceeded:false,cleanupAuthorized:false});
  };
  recorder.start(1000);
  timeout=setTimeout(()=>{if(!settled){reason='capture_timeout';try{recorder.stop()}catch{finish(failure(reason))}}},90000);
  const stop=()=>{
   if(!settled&&recorder.state!=='inactive')try{recorder.stop()}catch{finish(failure('stop_failed'))}
   return completed;
  };
  return {ok:true,stage:'recording_in_memory',stop,completed,captureSource:'in_app_media_recorder',
    externalCopiesVerified:false,recognitionSucceeded:false,cleanupAuthorized:false};
 }catch{
  try{recorder?.stop()}catch{}
  release(stream);
  if(timeout)clearTimeout(timeout);
  return failure('camera_start_failed');
 }
}
root.PasekaPrivateCameraCapture=Object.freeze({startPrivateCapture,MAX_BYTES});
})(typeof window!=='undefined'?window:globalThis);
