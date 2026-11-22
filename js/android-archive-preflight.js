(function(root) {
'use strict';
// Pure, metadata-only preflight. No data stores, media or archive writes.
// This diagnostic does not prove actual archive durability or restore safety.
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validSize = value => Number.isSafeInteger(value) && value > 0;
function inspect(records) {
 const errors=[];
 const keys=new Set(),results=new Set(),sources=new Map();
 if(!Array.isArray(records)) {
  return Object.freeze({ok:false,issues:['RECORD_SET_INVALID'],requiresManualReview:true,
   cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false,
   physicalRestoreVerified:false,byteIntegrityVerified:false});
 }
 if(records.length > 100000)errors.push('RECORD_SET_TOO_LARGE');
 for(const record of records.slice(0,100001)) {
  if(!record || typeof record !== 'object' || Array.isArray(record) ||
   !['entrance_media','record_media'].includes(record.source) ||
   typeof record.videoId !== 'string' || !record.videoId.trim() ||
   record.videoId.length>200 || !sha(record.sourceSha256) ||
   !validSize(record.sourceBytes)) {
   errors.push('SOURCE_EVIDENCE_INVALID');
   continue;
  }
  const key=record.source+':'+record.videoId;
  if(keys.has(key)) errors.push('SOURCE_IDENTITY_DUPLICATE');
  keys.add(key);
  const earlier=sources.get(key);
  if(earlier && (earlier.sha!==record.sourceSha256 || earlier.bytes!==record.sourceBytes))
   errors.push('SOURCE_COPY_CONFLICT');
  sources.set(key,{sha:record.sourceSha256,bytes:record.sourceBytes});
  if(record.resultId!==undefined) {
   if(typeof record.resultId!=='string' || !record.resultId.trim() || record.resultId.length>200)
    errors.push('RESULT_ID_INVALID');
   else if(results.has(record.resultId))errors.push('RESULT_ID_DUPLICATE');
   else results.add(record.resultId);
   if(record.sourceEvidenceVersion!==1 ||
    typeof record.recognizedAt!=='string' ||
    !Number.isFinite(Date.parse(record.recognizedAt)) ||
    !record.result || typeof record.result!=='object' ||
    Array.isArray(record.result)) errors.push('RECOGNITION_EVIDENCE_INVALID');
  }
 }
 return Object.freeze({ok:errors.length===0,issues:Object.freeze([...new Set(errors)]),
  sourceCount:keys.size,requiresManualReview:errors.length>0,
  cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false,
  physicalRestoreVerified:false,byteIntegrityVerified:false});
}
root.PasekaAndroidArchivePreflight = Object.freeze({inspect});
})(typeof window !== 'undefined' ? window : globalThis);
