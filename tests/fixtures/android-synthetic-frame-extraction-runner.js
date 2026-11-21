// One-shot Android WebView test, synthetic MP4 only. No user files, persistence, network or inference.
import {SYNTHETIC_MP4_BASE64,SYNTHETIC_MP4_SHA256} from './android-synthetic-mp4.js';
const PKG='ru.paseka.journal.diagnostic.frametest';
let attempted=false;
const NO=(reason)=>({status:'BLOCKED',reason,packageId:PKG,frameExtraction:'BLOCKED',
  recognition:'NOT_TESTED',cleanup:'NOT_TESTED',actualVideos:'NOT_ACCESSED'});
async function hashBlob(blob,env){
  const result=await env.crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  return Array.from(new Uint8Array(result),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function run(env=globalThis){
 if(attempted)return NO('ONE_SHOT_ALREADY_ATTEMPTED');
 attempted=true;
 let frameData=null;
 try{
   const decoder=env.PasekaEntranceFramePreparation;
   if(!decoder||typeof decoder.extractTransientFrames!=='function')return NO('EXTRACTOR_UNAVAILABLE');
   const bytes=Uint8Array.from(env.atob(SYNTHETIC_MP4_BASE64),c=>c.charCodeAt(0));
   if(bytes.length!==1720)return NO('SOURCE_LENGTH_MISMATCH');
   const blob=new env.Blob([bytes],{type:'video/mp4'});
   const expected=SYNTHETIC_MP4_SHA256;
   if(await hashBlob(blob,env)!==expected)return NO('SOURCE_SHA_MISMATCH');
   const record={id:'synthetic-black-h264-64x64-v1',blob,bytes:bytes.length,blobSha256:expected,mimeType:'video/mp4'};
   const out=await decoder.extractTransientFrames(record,{
     count:3,
     hasher:{hashBlobHex:file=>hashBlob(file,env)},
     document:env.document,
     URL:env.URL
   });
   if(!out?.ok)return NO('EXTRACTION_'+String(out?.reason||'UNKNOWN'));
   frameData=out.frames;
   if(!out.sourceEvidenceVerified||out.recognitionSucceeded!==false||out.cleanupAuthorized!==false||
      out.source?.sourceSha256!==expected||out.source?.sourceBytes!==1720||
      !Array.isArray(frameData)||frameData.length!==3)return NO('EXTRACTION_EVIDENCE_INVALID');
   let previous=-1;
   for(const frame of frameData){
     if(frame.width!==64||frame.height!==64||frame.mimeType!=='image/jpeg'||
        !(frame.atSec>previous)||frame.atSec>=1.6||
        typeof frame.dataUrl!=='string'||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame.dataUrl)||
        frame.dataUrl.length<150)return NO('FRAME_INVALID');
     previous=frame.atSec;
   }
   if(await hashBlob(blob,env)!==expected)return NO('SOURCE_CHANGED');
   return {status:'PASS',code:'SYNTHETIC_MP4_THREE_FRAMES_EXTRACTED',
     packageId:PKG,fixtureSha256:expected,frameExtraction:'PASS',
     frames:3,width:64,height:64,recognition:'NOT_TESTED',
     cleanup:'NOT_TESTED',actualVideos:'NOT_ACCESSED'};
 }catch(error){return NO('EXTRACTION_ERROR_'+String(error?.message||'UNKNOWN').slice(0,65));}
 finally{
   if(Array.isArray(frameData))frameData.length=0;
 }
}
export function attach(doc=globalThis.document,env=globalThis){
 const button=doc.getElementById('run-frame-diagnostic');
 const result=doc.getElementById('diagnostic-result');
 if(!button||!result)throw Error('DIAGNOSTIC_UI_MISSING');
 button.addEventListener('click',async()=>{
   button.disabled=true;result.textContent='Проверка извлечения кадров…';
   result.textContent=JSON.stringify(await run(env),null,2);
 },{once:true});
}
if(globalThis.document)globalThis.document.addEventListener('DOMContentLoaded',()=>attach());
