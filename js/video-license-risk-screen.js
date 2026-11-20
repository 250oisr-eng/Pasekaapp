(function(root){
'use strict';
// Safety-only license-risk screen. Cannot confirm ownership, license compatibility or execution.
const result=(reason,risks=[])=>Object.freeze({ok:false,reason,risks:Object.freeze(risks),
 stage:'human_license_review_required',licenseVerified:false,modelApproved:false,
 canRunInference:false,recognitionSucceeded:false,cleanupAuthorized:false});
function inspect(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return result('invalid_license_record');
 const provenance=root.PasekaVideoModelProvenanceGate;
 if(!provenance||typeof provenance.inspect!=='function')return result('provenance_gate_missing');
 const p=provenance.inspect(input);
 if(!p.ok)return result('provenance_incomplete',p.missing||[]);
 const labels=[input.weightsLicenseSpdx,input.baseWeightsLicenseSpdx,input.trainingDatasetLicenseSpdx];
 const risks=[];
 // Matching strings do not prove permissions for any particular checkpoint.
 if(labels.some(x=>/^(?:AGPL|GPL|LGPL|SSPL|BUSL|CC-BY-NC|CC-BY-ND|CC-BY-NC-ND)/i.test(x)))
  risks.push('license_obligations_require_review');
 if(labels.some(x=>/^(?:LicenseRef-|NOASSERTION|NONE|UNKNOWN|PROPRIETARY)/i.test(x)))
  risks.push('license_not_resolved');
 if(input.baseModelFamily==='ultralytics-yolov5'||input.baseModelFamily==='ultralytics-yolov8')
  risks.push('ultralytics_upstream_rights_review');
 if(input.baseModelFamily===undefined)risks.push('base_model_family_unknown');
 if(input.exportMethod===undefined)risks.push('export_method_unknown');
 // Even apparently permissive labels do not establish an approved model.
 if(!risks.length)risks.push('rights_not_independently_verified');
 return result('independent_license_review_required',risks);
}
root.PasekaVideoModelLicenseRisk=Object.freeze({inspect});
})(typeof window!=='undefined'?window:globalThis);
