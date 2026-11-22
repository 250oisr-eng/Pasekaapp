(function(root){
'use strict';
// Staging-only admission review for third-party bee model candidates.
// Evidence from a model card, a name, or a hash is NEVER an authorization to run inference.
const HEX=/^[0-9a-f]{64}$/;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const reason=(code)=>({ok:false,reason:code,candidateReviewOnly:true,weightsApproved:false,
  canDownloadWeights:false,canRunInference:false,recognitionSucceeded:false,cleanupAuthorized:false});
function evaluateCandidate(candidate){
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||
    !ID.test(candidate.id||'')||!ID.test(candidate.version||''))
  return reason('INVALID_CANDIDATE');
 if(candidate.task!=='hive_entrance_bee_detection')
  return reason('TASK_MISMATCH');
 if(candidate.weightsLicenseVerified!==true||
    candidate.baseWeightsLicenseVerified!==true||
    candidate.datasetLicenseVerified!==true||
    candidate.runtimeLicenseVerified!==true||
    candidate.redistributionAllowed!==true)
  return reason('LICENSE_CHAIN_UNVERIFIED');
 if(!HEX.test(candidate.weightsSha256||'')||
    !Number.isSafeInteger(candidate.weightsBytes)||
    candidate.weightsBytes<1||candidate.weightsBytes>100*1024*1024||
    candidate.artifactHashIndependentlyVerified!==true)
  return reason('WEIGHTS_IDENTITY_UNVERIFIED');
 if(candidate.androidOfflineExecutionVerified!==true)
  return reason('ANDROID_OFFLINE_UNVERIFIED');
 if(candidate.independentEntranceBenchmarkVerified!==true||
    candidate.trackingDirectionVerified!==true)
  return reason('FIELD_ACCURACY_UNVERIFIED');
 // Even full declarative metadata cannot authorize running a third-party model.
 // Independent review must separately bind verified claims to actual artifacts/tests.
 return {ok:true,stage:'evidence_submission_ready_only',candidateId:candidate.id,
   candidateReviewOnly:true,weightsApproved:false,canDownloadWeights:false,
   canRunInference:false,recognitionSucceeded:false,cleanupAuthorized:false};
}
root.PasekaVideoDetectorCandidateGate=Object.freeze({evaluateCandidate});
})(typeof window!=='undefined'?window:globalThis);
