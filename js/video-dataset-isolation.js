(function(root){
'use strict';
// Staging-only dataset partition hygiene. A manifest is self-reported, not independently verified.
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const fail=(reason)=>Object.freeze({ok:false,reason,stage:'unverified_dataset_manifest',
 independentEvaluationVerified:false,modelValidated:false,recognitionSucceeded:false,cleanupAuthorized:false});
function inspect(manifest){
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
   !ID.test(manifest.datasetId||'')||!ID.test(manifest.datasetVersion||'')||
   !Array.isArray(manifest.items)||manifest.items.length===0||manifest.items.length>10000)
  return fail('manifest_invalid');
 const ids=new Set(),hashes=new Map(),sourceVideos=new Map();
 const counts={train:0,validation:0,test:0};
 for(const item of manifest.items){
  if(!item||typeof item!=='object'||Array.isArray(item)||!ID.test(item.id||'')||
    !HASH.test(item.imageSha256||'')||!HASH.test(item.annotationSha256||'')||
    !ID.test(item.sourceVideoId||'')||
    !Object.hasOwn(counts,item.split))return fail('item_invalid');
  if(ids.has(item.id))return fail('duplicate_image_id');
  ids.add(item.id);counts[item.split]++;
  const videoPartition=sourceVideos.get(item.sourceVideoId);
  if(videoPartition&&videoPartition!==item.split)return fail('cross_split_source_video_leakage');
  sourceVideos.set(item.sourceVideoId,item.split);
  const previous=hashes.get(item.imageSha256);
  if(previous&&previous.split!==item.split)return fail('cross_split_image_leakage');
  if(previous)return fail('duplicate_image_content');
  hashes.set(item.imageSha256,{split:item.split});
 }
 if(counts.train===0||counts.validation===0||counts.test===0)
  return fail('split_missing');
 // Distinct bytes do not rule out near-duplicates or same-source adjacent frames.
 return Object.freeze({ok:true,stage:'unverified_dataset_manifest',
  counts:Object.freeze(counts),uniqueImages:ids.size,
  independentEvaluationVerified:false,nearDuplicateReviewRequired:true,
  sourceVideoLeakageReviewRequired:true,sourceVideoGroups:sourceVideos.size,modelValidated:false,
  recognitionSucceeded:false,cleanupAuthorized:false});
}
root.PasekaVideoDatasetIsolation=Object.freeze({inspect});
})(typeof window!=='undefined'?window:globalThis);
