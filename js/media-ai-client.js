(function(root){
'use strict';

const MAX_IMAGE_BYTES=340*1024;
const MAX_VIDEO_FRAME_BYTES=200*1024;
const VIDEO_FRAME_COUNT=5;

function finite(value){return Number.isFinite(value);}
function dimensions(source){
 const width=Number(source?.naturalWidth||source?.videoWidth||source?.width||0);
 const height=Number(source?.naturalHeight||source?.videoHeight||source?.height||0);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2)throw new Error('Не удалось определить размеры изображения/кадра');
 return {width,height};
}
function canvasBlob(canvas,quality){
 return new Promise((resolve,reject)=>{
  if(typeof canvas.toBlob!=='function')return reject(new Error('Браузер не поддерживает подготовку JPEG-кадров'));
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось подготовить JPEG-кадр')),'image/jpeg',quality);
 });
}
function blobDataUrl(blob){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('Не удалось прочитать подготовленный кадр'));
  reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('Некорректный формат кадра'));
  reader.readAsDataURL(blob);
 });
}
async function encodeSource(source,maxBytes){
 const size=dimensions(source),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 if(!ctx)throw new Error('Браузер не поддерживает обработку изображения');
 const limits=[1600,1400,1200,1024,896,768,640];
 const qualities=[0.82,0.74,0.66,0.58];
 for(const limit of limits){
  const scale=Math.min(1,limit/Math.max(size.width,size.height));
  const width=Math.max(2,Math.round(size.width*scale)),height=Math.max(2,Math.round(size.height*scale));
  canvas.width=width;canvas.height=height;
  ctx.drawImage(source,0,0,width,height);
  for(const quality of qualities){
   const blob=await canvasBlob(canvas,quality);
   if(blob.size<=maxBytes){
    const dataUrl=await blobDataUrl(blob);
    return {dataUrl,bytes:blob.size,width,height,mimeType:'image/jpeg'};
   }
  }
 }
 throw new Error('Не удалось уменьшить кадр до безопасного размера. Исходный файл сохранён без изменений.');
}
function waitFor(target,eventName,errorName,timeoutMs){
 return new Promise((resolve,reject)=>{
  let timer;
  const cleanup=()=>{clearTimeout(timer);target.removeEventListener(eventName,done);if(errorName)target.removeEventListener(errorName,fail)};
  const done=()=>{cleanup();resolve()};
  const fail=()=>{cleanup();reject(new Error('Не удалось декодировать видео для анализа'))};
  target.addEventListener(eventName,done,{once:true});
  if(errorName)target.addEventListener(errorName,fail,{once:true});
  timer=setTimeout(()=>{cleanup();reject(new Error('Истекло время подготовки видео-кадров'))},timeoutMs);
 });
}
function sampleTimes(duration,count=VIDEO_FRAME_COUNT){
 if(!finite(duration)||duration<=0||!Number.isInteger(count)||count<3||count>5)throw new TypeError('Некорректные параметры выборки кадров');
 return Array.from({length:count},(_,index)=>duration*(index+1)/(count+1));
}
async function prepareImage(blob){
 if(!blob||!finite(blob.size)||blob.size<=0)throw new TypeError('Файл фотографии пуст');
 if(!/^image\/(jpeg|png|webp)$/i.test(String(blob.type||'')))throw new Error('Для анализа поддерживаются JPEG, PNG и WebP. Оригинал сохранён локально.');
 if(typeof createImageBitmap!=='function')throw new Error('Браузер не поддерживает декодирование фотографии для анализа');
 let bitmap;
 try{
  bitmap=await createImageBitmap(blob);
  const frame=await encodeSource(bitmap,MAX_IMAGE_BYTES);
  return {kind:'image',frames:[{timeSec:null,...frame}],sourceBytes:blob.size,sourceMimeType:blob.type};
 }finally{try{bitmap?.close?.()}catch{}}
}
async function prepareVideo(blob,options={}){
 if(!blob||!finite(blob.size)||blob.size<=0)throw new TypeError('Файл видео пуст');
 if(typeof document==='undefined'||typeof URL==='undefined'||typeof URL.createObjectURL!=='function')throw new Error('Браузер не поддерживает подготовку кадров видео');
 const count=Number.isInteger(options.count)?Math.max(3,Math.min(5,options.count)):VIDEO_FRAME_COUNT;
 const objectUrl=URL.createObjectURL(blob),video=document.createElement('video');
 video.preload='metadata';video.muted=true;video.playsInline=true;
 try{
  const metadataReady=waitFor(video,'loadedmetadata','error',20000);video.src=objectUrl;await metadataReady;
  if(!finite(video.duration)||video.duration<20||video.duration>90)throw new Error('Длительность видео должна быть от 20 до 90 секунд');
  const sourceSize=dimensions(video),times=sampleTimes(video.duration,count),frames=[];
  for(const timeSec of times){
   const seeked=waitFor(video,'seeked','error',15000);
   video.currentTime=Math.min(timeSec,Math.max(0,video.duration-0.05));
   await seeked;
   const frame=await encodeSource(video,MAX_VIDEO_FRAME_BYTES);
   frames.push({timeSec:Number(timeSec.toFixed(2)),...frame});
  }
  if(frames.length<3)throw new Error('Получено недостаточно кадров для анализа видео');
  return {kind:'video',frames,sourceBytes:blob.size,sourceMimeType:blob.type,durationSec:video.duration,sourceWidth:sourceSize.width,sourceHeight:sourceSize.height};
 }finally{
  try{video.pause()}catch{}
  try{video.removeAttribute('src');video.load()}catch{}
  URL.revokeObjectURL(objectUrl);
 }
}

root.PasekaMediaAIClient=Object.freeze({
 prepareImage,
 prepareVideo,
 sampleTimes,
 limits:Object.freeze({maxImageBytes:MAX_IMAGE_BYTES,maxVideoFrameBytes:MAX_VIDEO_FRAME_BYTES,videoFrameCount:VIDEO_FRAME_COUNT})
});
})(typeof window!=='undefined'?window:globalThis);
