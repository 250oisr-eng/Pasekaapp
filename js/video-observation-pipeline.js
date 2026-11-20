(function(root){
'use strict';
// Inactive local-only staging. Neither completion nor deletion is possible here.
const fail=reason=>({ok:false,reason,recognitionSucceeded:false,cleanupAuthorized:false,reviewRequired:true});
async function runObservationDraft(record,adapter,options={}){
 const preparation=options.preparation||root.PasekaEntranceFramePreparation;
 const evidence=options.evidence||root.PasekaVideoModelEvidence;
 const hasher=options.hasher||root.PasekaSha256;
 const signal=options.signal;
 if(!record||!record.blob||!record.id||!Number.isSafeInteger(record.bytes)||
    !/^[a-f0-9]{64}$/.test(record.blobSha256||''))
  return fail('invalid_source');
 if(!preparation||typeof preparation.extractTransientFrames!=='function'||
    !evidence||typeof evidence.validateDraft!=='function'||
    !hasher||typeof hasher.hashBlobHex!=='function')
  return fail('pipeline_dependency_missing');
 if(!adapter||typeof adapter.infer!=='function'||adapter.mode!=='on_device')
  return fail('offline_model_adapter_unavailable');
 if(signal?.aborted)return fail('aborted');
 let sample;
 try{
  sample=await preparation.extractTransientFrames(record,{count:options.count||3,signal,hasher});
  if(!sample?.ok)return fail(sample?.reason||'frame_preparation_failed');
  if(signal?.aborted)return fail('aborted');
  if(sample.source?.source!=='entrance_media'||sample.source.videoId!==record.id||
     sample.source.sourceSha256!==record.blobSha256||
     sample.source.sourceBytes!==record.bytes)
   return fail('source_evidence_mismatch');
  const frames=sample.frames;
  if(!Array.isArray(frames)||frames.length<2||frames.length>4)return fail('frames_missing');
  // Adapter is injected in tests; no network or model is selected/loaded by the application.
  const observed=await adapter.infer(Object.freeze({source:Object.freeze({...sample.source}),
    frames:frames.map(f=>Object.freeze({...f}))}),{signal});
  if(signal?.aborted)return fail('aborted');
  // Evidence is checked *again* after asynchronous inference to detect an updated source.
  const currentHash=await hasher.hashBlobHex(record.blob);
  if(currentHash!==sample.source.sourceSha256||
     record.id!==sample.source.videoId||
     record.bytes!==sample.source.sourceBytes||
     record.blob?.size!==sample.source.sourceBytes||
     record.blobSha256!==sample.source.sourceSha256)
   return fail('source_changed_after_inference');
  if(!observed||typeof observed!=='object'||Array.isArray(observed))
   return fail('invalid_model_response');
  if(observed.source!==undefined){
   const claimed=observed.source;
   if(!claimed||claimed.source!==sample.source.source||
     claimed.videoId!==sample.source.videoId||
     claimed.sourceSha256!==sample.source.sourceSha256||
     claimed.sourceBytes!==sample.source.sourceBytes)
    return fail('model_source_disagreement');
  }
  const draft=evidence.validateDraft({source:sample.source,model:observed.model,
    frames:frames.map(f=>({atSec:f.atSec,width:f.width,height:f.height,mimeType:f.mimeType})),
    tracks:observed.tracks});
  if(!draft?.ok)return fail(draft?.reason||'model_evidence_rejected');
  return {ok:true,stage:'untrusted_observation_draft',
    observations:draft.observations,reviewRequired:true,recognitionSucceeded:false,
    cleanupAuthorized:false};
 }catch(error){
  return fail(signal?.aborted?'aborted':'model_inference_failed');
 }finally{
  // Release our own references; the caller-supplied adapter is responsible for not
  // retaining any copies of transient JPEG inputs after its inference call.
  if(sample&&Array.isArray(sample.frames))sample.frames.length=0;
 }
}
root.PasekaVideoObservationPipeline=Object.freeze({runObservationDraft});
})(typeof window!=='undefined'?window:globalThis);
