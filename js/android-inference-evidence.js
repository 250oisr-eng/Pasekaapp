(function(root){
'use strict';
// Staging-only untrusted physical-device report schema. Does NOT authenticate a test,
 // validate model correctness, approve licenses or authorize storage cleanup.
const SHA=/^[a-f0-9]{64}$/;
const id=s=>typeof s==='string'&&s.length>0&&s.length<=128&&!/[\x00-\x1f]/.test(s);
const blocked=(reason)=>Object.freeze({ok:false,reason,stage:'android_report_review_required',
 physicalTestVerified:false,licenseVerified:false,modelApproved:false,
 recognitionSucceeded:false,cleanupAuthorized:false});
function inspect(report){
 if(!report||typeof report!=='object'||Array.isArray(report))return blocked('invalid_report');
 if(report.kind!=='physical_android_inference'||report.synthetic===true||
   report.execution!=='on_device'||report.backend!=='wasm_cpu')
  return blocked('not_physical_wasm_report');
 if(!id(report.deviceModel)||!id(report.androidVersion)||!id(report.webViewVersion)||
    !id(report.modelId)||!id(report.modelVersion)||!SHA.test(report.modelSha256||'')||
    !id(report.testDatasetId)||!SHA.test(report.testDatasetSha256||''))
  return blocked('test_provenance_missing');
 if(report.networkDisconnected!==true||report.offlineReloadConfirmed!==true)
  return blocked('offline_unverified');
 if(!Array.isArray(report.samplesMs)||report.samplesMs.length<3||report.samplesMs.length>100||
    report.samplesMs.some(ms=>typeof ms!=='number'||!Number.isFinite(ms)||ms<0||ms>600000))
  return blocked('timings_invalid');
 if(typeof report.coldStartMs!=='number'||!Number.isFinite(report.coldStartMs)||
    report.coldStartMs<0||report.coldStartMs>600000)
  return blocked('cold_start_invalid');
 if(!Number.isSafeInteger(report.labeledImages)||report.labeledImages<=0||
    !Number.isSafeInteger(report.groundTruthObjects)||report.groundTruthObjects<=0||
    !Number.isSafeInteger(report.truePositives)||report.truePositives<0||
    !Number.isSafeInteger(report.falsePositives)||report.falsePositives<0||
    !Number.isSafeInteger(report.falseNegatives)||report.falseNegatives<0||
    report.truePositives+report.falseNegatives!==report.groundTruthObjects)
  return blocked('quality_counts_invalid');
 // Do not accept asserted detection without a label-matching audit.
 const samples=report.samplesMs.slice().sort((a,b)=>a-b);
 const precision=report.truePositives+report.falsePositives===0?0:
  report.truePositives/(report.truePositives+report.falsePositives);
 const recall=report.truePositives/report.groundTruthObjects;
 return Object.freeze({ok:true,stage:'android_report_review_required',
  reportSummary:Object.freeze({deviceModel:report.deviceModel,androidVersion:report.androidVersion,
   webViewVersion:report.webViewVersion,modelId:report.modelId,modelVersion:report.modelVersion,
   modelSha256:report.modelSha256,testDatasetId:report.testDatasetId,
   testDatasetSha256:report.testDatasetSha256,measurements:samples.length,
   minMs:samples[0],p95Ms:samples[Math.ceil(.95*samples.length)-1],
   maxMs:samples[samples.length-1],coldStartMs:report.coldStartMs,precision,recall}),
  physicalTestVerified:false,licenseVerified:false,modelApproved:false,
  recognitionSucceeded:false,cleanupAuthorized:false});
}
root.PasekaAndroidInferenceEvidence=Object.freeze({inspect});
})(typeof window!=='undefined'?window:globalThis);
