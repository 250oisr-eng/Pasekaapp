(function(root){
'use strict';
// Local-only staging. Does not perform AI inference, IndexedDB writes, upload, or deletion.
const MAX_FRAMES=4;
const MAX_JPEG_CHARS=350000;
const fail=reason=>({ok:false,reason,frames:[],sourceEvidenceVerified:false,recognitionSucceeded:false,cleanupAuthorized:false});
const digestOk=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const integer=x=>Number.isSafeInteger(x)&&x>0;
const cancelled=signal=>signal&&signal.aborted===true;
function sampleTimes(duration,count){
 if(!Number.isFinite(duration)||duration<1||!Number.isInteger(count)||count<2||count>MAX_FRAMES)return null;
 return Array.from({length:count},(_,i)=>Math.min(duration-0.01,duration*(i+1)/(count+1)));
}
function eventOnce(target,name,errorName,signal,timeout){
 return new Promise((resolve,reject)=>{
  let finished=false;
  const clear=()=>{target.removeEventListener(name,success);target.removeEventListener(errorName,error);if(signal)signal.removeEventListener('abort',abort);clearTimeout(timer)};
  const settle=(fn,value)=>{if(finished)return;finished=true;clear();fn(value)};
  const success=()=>settle(resolve);
  const error=()=>settle(reject,new Error('decode_failed'));
  const abort=()=>settle(reject,new Error('aborted'));
  const timer=setTimeout(()=>settle(reject,new Error('decode_timeout')),timeout);
  target.addEventListener(name,success,{once:true});
  target.addEventListener(errorName,error,{once:true});
  if(signal)signal.addEventListener('abort',abort,{once:true});
  if(cancelled(signal))abort();
 });
}
async function extractTransientFrames(record,options={}){
 const count=options.count===undefined?3:options.count;
 const signal=options.signal;
 const documentRef=options.document||root.document;
 const urlRef=options.URL||root.URL;
 const hasher=options.hasher||root.PasekaSha256;
 if(!record||typeof record.id!=='string'||!record.id||
    !record.blob||typeof record.blob.slice!=='function'||
    !integer(record.bytes)||record.blob.size!==record.bytes||
    record.bytes>250*1024*1024||
    !digestOk(record.blobSha256)||
    !/^video\//.test(record.blob.type||record.mimeType||'')||
    !Number.isInteger(count)||count<2||count>MAX_FRAMES)
  return fail('invalid_source_evidence');
 if(!hasher||typeof hasher.hashBlobHex!=='function')return fail('hash_module_unavailable');
 if(!documentRef||typeof documentRef.createElement!=='function'||
    !urlRef||typeof urlRef.createObjectURL!=='function'||typeof urlRef.revokeObjectURL!=='function')
  return fail('browser_decoder_unavailable');
 if(cancelled(signal))return fail('aborted');
 let digest;
 try{digest=await hasher.hashBlobHex(record.blob)}catch{return fail('source_hash_unavailable')}
 if(digest!==record.blobSha256)return fail('source_sha_mismatch');
 let video,canvas,url;const frames=[];
 try{
  video=documentRef.createElement('video');
  canvas=documentRef.createElement('canvas');
  if(!video||!canvas||typeof canvas.getContext!=='function')return fail('browser_decoder_unavailable');
  video.muted=true;video.preload='auto';video.playsInline=true;
  url=urlRef.createObjectURL(record.blob);
  const load=eventOnce(video,'loadedmetadata','error',signal,10000);
  video.src=url;
  if(typeof video.load==='function')video.load();
  await load;
  if(cancelled(signal))return fail('aborted');
  const width=video.videoWidth,height=video.videoHeight,duration=video.duration;
  if(!integer(width)||!integer(height)||!Number.isFinite(duration)||duration<=0)return fail('invalid_video_metadata');
  const scale=Math.min(1,640/Math.max(width,height));
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx||typeof ctx.drawImage!=='function'||typeof canvas.toDataURL!=='function')return fail('canvas_unavailable');
  const times=sampleTimes(duration,count);
  if(!times)return fail('invalid_video_metadata');
  for(const second of times){
   if(cancelled(signal))return fail('aborted');
   const seek=eventOnce(video,'seeked','error',signal,10000);
   video.currentTime=second;
   await seek;
   ctx.drawImage(video,0,0,canvas.width,canvas.height);
   const image=canvas.toDataURL('image/jpeg',0.7);
   if(typeof image!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)||
      image.length>MAX_JPEG_CHARS)return fail('encoded_frame_invalid');
   frames.push({atSec:second,mimeType:'image/jpeg',dataUrl:image,width:canvas.width,height:canvas.height});
  }
  // Blob bytes are independently verified; frames are ephemeral inference inputs, not recognition.
  if(cancelled(signal))return fail('aborted');
  return {ok:true,frames:frames.slice(),source:{source:'entrance_media',videoId:record.id,sourceSha256:digest,sourceBytes:record.bytes},
    sourceEvidenceVerified:true,recognitionSucceeded:false,cleanupAuthorized:false};
 }catch(error){
  return fail(error&&error.message==='aborted'?'aborted':'frame_decode_failed');
 }finally{
  frames.length=0;
  try{video?.pause?.();video?.removeAttribute?.('src');video?.load?.()}catch{}
  try{if(canvas){const ctx=canvas.getContext('2d');ctx?.clearRect?.(0,0,canvas.width,canvas.height);canvas.width=0;canvas.height=0}}catch{}
  if(url)try{urlRef.revokeObjectURL(url)}catch{}
 }
}
root.PasekaEntranceFramePreparation=Object.freeze({MAX_FRAMES,sampleTimes,extractTransientFrames});
})(typeof window!=='undefined'?window:globalThis);
