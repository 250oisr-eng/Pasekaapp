(function(root){
'use strict';
// Staging-only weight-file integrity preflight. Does not approve licenses, load models or run AI.
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const NO=(reason)=>({ok:false,reason,artifactMatches:false,licenseVerified:false,
  modelApproved:false,canRunInference:false,cleanupAuthorized:false});
async function verifyModelArtifact(file,manifest,hasher=root.PasekaSha256){
 if(!file||typeof file.slice!=='function'||!Number.isSafeInteger(file.size)||file.size<=0||
    !manifest||typeof manifest!=='object'||Array.isArray(manifest)||
    !ID.test(manifest.id||'')||!ID.test(manifest.version||'')||
    typeof manifest.sha256!=='string'||!HEX.test(manifest.sha256)||
    !Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||
    manifest.bytes!==file.size||manifest.bytes>100*1024*1024)
  return NO('invalid_model_manifest');
 if(!hasher||typeof hasher.hashBlobHex!=='function')return NO('sha256_unavailable');
 let actual;
 try{actual=await hasher.hashBlobHex(file)}catch{return NO('model_hash_failed')}
 if(actual!==manifest.sha256)return NO('model_digest_mismatch');
 // Untrusted manifest fields such as "approved=true" are not authoritative.
 // A valid hash proves *identity only*. License and Android accuracy need independent review.
 return {ok:true,stage:'artifact_identity_only',
  model:{id:manifest.id,version:manifest.version,sha256:actual,bytes:file.size},
  artifactMatches:true,licenseVerified:false,modelApproved:false,canRunInference:false,
  cleanupAuthorized:false,reviewRequired:true};
}
root.PasekaVideoModelArtifact=Object.freeze({verifyModelArtifact});
})(typeof window!=='undefined'?window:globalThis);
