(function(root){
'use strict';
// Staging-only provenance completeness check. Documentation is not a legal approval.
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA=/^[a-f0-9]{64}$/;
const LICENSE=/^[A-Za-z0-9][A-Za-z0-9.+-]{0,127}$/;
const url=value=>{
 if(typeof value!=='string'||value.length>2048)return false;
 try{const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password}
 catch{return false}
};
const no=(reason,missing=[])=>Object.freeze({ok:false,reason,missing:Object.freeze(missing),
 stage:'provenance_review_required',licenseVerified:false,modelApproved:false,
 canRunInference:false,recognitionSucceeded:false,cleanupAuthorized:false});
function inspect(candidate){
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return no('invalid_candidate');
 const missing=[];
 if(!ID.test(candidate.id||''))missing.push('id');
 if(!ID.test(candidate.version||''))missing.push('version');
 if(!SHA.test(candidate.weightsSha256||''))missing.push('weightsSha256');
 if(!Number.isSafeInteger(candidate.weightsBytes)||candidate.weightsBytes<=0||candidate.weightsBytes>100*1024*1024)missing.push('weightsBytes');
 if(!url(candidate.weightsSourceUrl))missing.push('weightsSourceUrl');
 if(!LICENSE.test(candidate.weightsLicenseSpdx||''))missing.push('weightsLicenseSpdx');
 if(!url(candidate.weightsLicenseEvidenceUrl))missing.push('weightsLicenseEvidenceUrl');
 if(!url(candidate.baseWeightsSourceUrl))missing.push('baseWeightsSourceUrl');
 if(!LICENSE.test(candidate.baseWeightsLicenseSpdx||''))missing.push('baseWeightsLicenseSpdx');
 if(!url(candidate.baseWeightsLicenseEvidenceUrl))missing.push('baseWeightsLicenseEvidenceUrl');
 if(!url(candidate.trainingDatasetSourceUrl))missing.push('trainingDatasetSourceUrl');
 if(!LICENSE.test(candidate.trainingDatasetLicenseSpdx||''))missing.push('trainingDatasetLicenseSpdx');
 if(!url(candidate.trainingDatasetLicenseEvidenceUrl))missing.push('trainingDatasetLicenseEvidenceUrl');
 if(candidate.task!=='honeybee_object_detection')missing.push('task');
 if(candidate.format!=='onnx')missing.push('format');
 if(missing.length)return no('incomplete_provenance',missing);
 const evidence=Object.freeze({id:candidate.id,version:candidate.version,
 weightsSha256:candidate.weightsSha256,weightsBytes:candidate.weightsBytes,
 weightsSourceUrl:candidate.weightsSourceUrl,weightsLicenseSpdx:candidate.weightsLicenseSpdx,
 weightsLicenseEvidenceUrl:candidate.weightsLicenseEvidenceUrl,
 baseWeightsSourceUrl:candidate.baseWeightsSourceUrl,baseWeightsLicenseSpdx:candidate.baseWeightsLicenseSpdx,
 baseWeightsLicenseEvidenceUrl:candidate.baseWeightsLicenseEvidenceUrl,
 trainingDatasetSourceUrl:candidate.trainingDatasetSourceUrl,
 trainingDatasetLicenseSpdx:candidate.trainingDatasetLicenseSpdx,
 trainingDatasetLicenseEvidenceUrl:candidate.trainingDatasetLicenseEvidenceUrl,
 task:'honeybee_object_detection',format:'onnx'});
 return Object.freeze({ok:true,stage:'provenance_review_required',evidence,
   licenseVerified:false,modelApproved:false,canRunInference:false,
   recognitionSucceeded:false,cleanupAuthorized:false});
}
root.PasekaVideoModelProvenanceGate=Object.freeze({inspect});
})(typeof window!=='undefined'?window:globalThis);
