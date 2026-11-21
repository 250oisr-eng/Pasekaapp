// Test-only, in-memory MP4 decoder probe. No external storage, network, IndexedDB or deletion.
import {SYNTHETIC_MP4_BASE64,SYNTHETIC_MP4_SHA256} from './android-synthetic-mp4.js';
const PACKAGE='ru.paseka.journal.diagnostic.mediatest';
let attempted=false;
function report(status,code,extra={}){
  return {status,code,packageId:PACKAGE,fixtureSha256:SYNTHETIC_MP4_SHA256,
    videoDecode:status==='PASS'?'PASS':'BLOCKED',recognition:'NOT_TESTED',
    cleanup:'NOT_TESTED',actualVideos:'NOT_ACCESSED',...extra};
}
export async function run(video,environment=globalThis){
  if(attempted)return report('BLOCKED','ONE_SHOT_ALREADY_ATTEMPTED');
  attempted=true;
  let objectUrl;
  try{
    const bytes=Uint8Array.from(environment.atob(SYNTHETIC_MP4_BASE64),c=>c.charCodeAt(0));
    if(bytes.length!==1721)throw Error('FIXTURE_LENGTH_MISMATCH');
    const blob=new environment.Blob([bytes],{type:'video/mp4'});
    objectUrl=environment.URL.createObjectURL(blob);
    video.muted=true;
    video.playsInline=true;
    video.preload='auto';
    video.src=objectUrl;
    const outcome=await new Promise((resolve,reject)=>{
      let settled=false;let timer;
      let playing=false;let progress=false;let metadata=false;
      function settle(error){
        if(settled)return;
        settled=true;environment.clearTimeout(timer);
        video.removeEventListener('loadedmetadata',onMeta);
        video.removeEventListener('playing',onPlaying);
        video.removeEventListener('timeupdate',onTime);
        video.removeEventListener('error',onError);
        if(error)reject(error);else resolve({width:video.videoWidth,height:video.videoHeight,currentTime:video.currentTime});
      }
      function check(){if(metadata&&playing&&progress)settle();}
      function onMeta(){metadata=video.videoWidth===64&&video.videoHeight===64&&video.duration>1;check();}
      function onPlaying(){playing=true;check();}
      function onTime(){progress=video.currentTime>0.05;check();}
      function onError(){settle(Error('MEDIA_ERROR_'+String(video.error?.code||'UNKNOWN')));}
      video.addEventListener('loadedmetadata',onMeta);
      video.addEventListener('playing',onPlaying);
      video.addEventListener('timeupdate',onTime);
      video.addEventListener('error',onError);
      timer=environment.setTimeout(()=>settle(Error('DECODER_TIMEOUT')),12000);
      // No autoplay: playback begins only after the user presses the diagnostic button.
      try{const playResult=video.play();if(playResult?.catch)playResult.catch(e=>settle(Error('PLAY_REJECTED_'+String(e?.name||'UNKNOWN'))));}
      catch(e){settle(Error('PLAY_THROWN_'+String(e?.name||'UNKNOWN')));}
    });
    const digest=new Uint8Array(await environment.crypto.subtle.digest('SHA-256',bytes));
    const hex=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
    if(hex!==SYNTHETIC_MP4_SHA256)throw Error('FIXTURE_SHA_MISMATCH');
    return report('PASS','SYNTHETIC_H264_METADATA_PLAYBACK_PROGRESS',outcome);
  }catch(e){return report('BLOCKED',String(e?.message||'UNEXPECTED').slice(0,90));}
  finally{try{video.pause();video.removeAttribute('src');video.load();}catch(_){}
    if(objectUrl)environment.URL.revokeObjectURL(objectUrl);}
}
export function attach(document,environment=globalThis){
  const button=document.getElementById('run-media-diagnostic');
  const output=document.getElementById('diagnostic-result');
  const video=document.getElementById('synthetic-player');
  if(!button||!output||!video)throw Error('DIAGNOSTIC_UI_MISSING');
  button.addEventListener('click',async()=>{
    button.disabled=true;output.textContent='Проверка синтетического MP4…';
    output.textContent=JSON.stringify(await run(video,environment),null,2);
  },{once:true});
}
if(globalThis.document)globalThis.document.addEventListener('DOMContentLoaded',()=>attach(globalThis.document));
