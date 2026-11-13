(function(root){
'use strict';
const VERSION='bee-detector-contract-v1';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const DEFAULT_LIMITS=Object.freeze({maxDetectionsPerFrame:300,minConfidence:0.35,maxFrameWidth:1280,maxFrameHeight:1280});
function validateModelManifest(manifest){
 const errors=[];
 if(!manifest||typeof manifest!=='object')return {ok:false,errors:['manifest_missing']};
 if(typeof manifest.id!=='string'||!manifest.id.trim())errors.push('model_id_missing');
 if(typeof manifest.version!=='string'||!manifest.version.trim())errors.push('model_version_missing');
 if(manifest.task!=='bee_detection')errors.push('model_task_unsupported');
 if(!['tflite','lite_rt'].includes(manifest.format))errors.push('model_format_unsupported');
 if(typeof manifest.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(manifest.sha256))errors.push('model_checksum_missing_or_invalid');
 if(typeof manifest.license!=='string'||!manifest.license.trim())errors.push('model_license_missing');
 if(typeof manifest.labels!=='object'||!Array.isArray(manifest.labels)||!manifest.labels.includes('bee'))errors.push('bee_label_missing');
 if(manifest.validatedOnHiveVideo!==true)errors.push('hive_video_validation_missing');
 return {ok:errors.length===0,errors};
}
function normalizeDetections(input,options={}){
 const limits={...DEFAULT_LIMITS,...options};
 if(!Array.isArray(input))return {ok:false,errors:['detections_not_array'],detections:[]};
 const detections=[],errors=[];
 if(input.length>limits.maxDetectionsPerFrame)errors.push('detection_limit_exceeded');
 for(const item of input.slice(0,limits.maxDetectionsPerFrame)){
  if(!item||typeof item!=='object')continue;
  const confidence=Number(item.confidence),box=item.box||item.boundingBox;
  if(!finite(confidence)||confidence<limits.minConfidence||confidence>1)continue;
  if(!box||!['x','y','width','height'].every(k=>finite(Number(box[k]))))continue;
  const x=Number(box.x),y=Number(box.y),width=Number(box.width),height=Number(box.height);
  if(width<=0||height<=0||x<0||y<0||x+width>1||y+height>1)continue;
  const className=String(item.className||item.label||'').toLowerCase();
  if(!['bee','wasp','drone','unknown'].includes(className))continue;
  detections.push({className,confidence:clamp(confidence,0,1),box:{x,y,width,height}});
 }
 return {ok:errors.length===0,errors,detections};
}
function createCapacitorRuntime(plugin){
 if(!plugin||typeof plugin.detectFrame!=='function')return null;
 return Object.freeze({async detect(frame){
  if(!frame||typeof frame.path!=='string'||!frame.path.trim())throw new Error('A local frame path is required');
  const result=await plugin.detectFrame({framePath:frame.path});
  if(result&&result.status==='unavailable')return {status:'unavailable',reason:result.reason||'native_runtime_unavailable'};
  return result&&Array.isArray(result.detections)?result.detections:[];
 }});
}
function createBeeDetectorAdapter(config={}){
 const manifest=validateModelManifest(config.manifest);
 const runtime=config.runtime;
 const available=manifest.ok&&runtime&&typeof runtime.detect==='function';
 return Object.freeze({
  version:VERSION,
  status:available?'ready':'unavailable',
  reason:available?null:(!manifest.ok?'model_not_validated_or_manifest_invalid':'inference_runtime_unavailable'),
  manifest:manifest.ok?{id:config.manifest.id,version:config.manifest.version,format:config.manifest.format}:null,
  async detectFrame(frame){
   if(!available)return {ok:false,status:'unavailable',reason:!manifest.ok?'model_not_validated_or_manifest_invalid':'inference_runtime_unavailable',detections:[]};
   if(!frame||typeof frame!=='object')return {ok:false,status:'invalid_input',reason:'frame_missing',detections:[]};
   try{
    const raw=await runtime.detect(frame);
    if(raw&&raw.status==='unavailable')return {ok:false,status:'unavailable',reason:raw.reason||'native_runtime_unavailable',detections:[]};
    const normalized=normalizeDetections(raw,config.limits||{});
    return {...normalized,status:normalized.ok?'ok':'partial',modelId:config.manifest.id,modelVersion:config.manifest.version};
   }catch(error){
    return {ok:false,status:'inference_error',reason:'runtime_failure',message:String(error&&error.message||error).slice(0,240),detections:[]};
   }
  }
 });
}
root.PasekaBeeDetector=Object.freeze({VERSION,validateModelManifest,normalizeDetections,createCapacitorRuntime,createBeeDetectorAdapter});
})(typeof window!=='undefined'?window:globalThis);
