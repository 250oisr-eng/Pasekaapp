(function(root){
'use strict';
// Staging-only: validates non-authoritative model observations. Never grants completed or cleanup.
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH=/^[a-f0-9]{64}$/;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const fail=reason=>({ok:false,reason,reviewRequired:true,recognitionSucceeded:false,cleanupAuthorized:false});
const known=new Set(['bee','drone','wasp','hornet','dead_bee','unknown']);
const dir=new Set(['in','out','unknown']);
function validateDraft(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return fail('invalid_draft');
 const {source,model,frames,tracks}=input;
 if(!source||source.source!=='entrance_media'||typeof source.videoId!=='string'||!ID.test(source.videoId)||
    typeof source.sourceSha256!=='string'||!HASH.test(source.sourceSha256)||
    !Number.isSafeInteger(source.sourceBytes)||source.sourceBytes<=0)return fail('source_identity_missing');
 if(!model||typeof model!=='object'||!ID.test(model.id||'')||!ID.test(model.version||'')||
    typeof model.weightsSha256!=='string'||!HASH.test(model.weightsSha256)||
    model.execution!=='on_device')return fail('model_provenance_missing');
 if(!Array.isArray(frames)||frames.length<2||frames.length>4)return fail('frames_invalid');
 let last=-1;
 for(const frame of frames){
  if(!frame||!finite(frame.atSec)||frame.atSec<=last||frame.atSec<0||
     !Number.isInteger(frame.width)||frame.width<=0||frame.width>640||
     !Number.isInteger(frame.height)||frame.height<=0||frame.height>640||
     typeof frame.mimeType!=='string'||frame.mimeType!=='image/jpeg'||
     frame.dataUrl!==undefined||frame.image!==undefined||frame.blob!==undefined)return fail('frame_evidence_invalid');
  last=frame.atSec;
 }
 if(!Array.isArray(tracks)||tracks.length>300)return fail('tracks_invalid');
 const ids=new Set();
 for(const track of tracks){
  if(!track||!ID.test(track.id||'')||ids.has(track.id)||!known.has(track.className)||
     !dir.has(track.direction)||!finite(track.confidence)||track.confidence<0||track.confidence>1||
     !finite(track.startSec)||!finite(track.endSec)||track.startSec<0||
     track.endSec<track.startSec||track.endSec>last||
     (track.pollen!==undefined&&typeof track.pollen!=='boolean')||
     (track.pollenConfidence!==undefined&&(!finite(track.pollenConfidence)||track.pollenConfidence<0||track.pollenConfidence>1)))
   return fail('track_evidence_invalid');
  ids.add(track.id);
 }
 // The draft is intentionally non-authoritative. A valid shape is not an actual trained model.
 const observations={source:{source:source.source,videoId:source.videoId,
   sourceSha256:source.sourceSha256,sourceBytes:source.sourceBytes},
  model:{id:model.id,version:model.version,weightsSha256:model.weightsSha256,execution:'on_device'},
  frames:frames.map(f=>({atSec:f.atSec,width:f.width,height:f.height,mimeType:f.mimeType})),
  tracks:tracks.map(t=>({id:t.id,className:t.className,direction:t.direction,
    confidence:t.confidence,startSec:t.startSec,endSec:t.endSec,
    ...(t.pollen===undefined?{}:{pollen:t.pollen}),
    ...(t.pollenConfidence===undefined?{}:{pollenConfidence:t.pollenConfidence})}))};
 return {ok:true,observations,reviewRequired:true,recognitionSucceeded:false,
  cleanupAuthorized:false,stage:'untrusted_observation_draft'};
}
root.PasekaVideoModelEvidence=Object.freeze({validateDraft});
})(typeof window!=='undefined'?window:globalThis);
