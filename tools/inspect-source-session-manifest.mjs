// Offline staging-only inspection of externally asserted image-to-session mapping.
// NEVER grants data rights, training approval, inference or media deletion.
const HEX=/^[a-f0-9]{64}$/;
const GROUP=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const SPLITS=new Set(['unassigned','train','validation','test']);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export class SourceManifestRejected extends Error {
 constructor(reason){super(reason);this.name='SourceManifestRejected';}
}
function requireObject(o,reason){
 if(!o||typeof o!=='object'||Array.isArray(o))throw new SourceManifestRejected(reason);
}
function failIf(condition,reason){if(condition)throw new SourceManifestRejected(reason);}
export function inspectSourceManifest(coco,manifest){
 requireObject(coco,'coco_object_required');
 requireObject(coco.info,'coco_info_required');
 failIf(coco.info.split!=='unassigned'||coco.info.trainingAuthorized!==false,'coco_must_remain_unassigned');
 failIf(!Array.isArray(coco.images)||!coco.images.length||coco.images.length>10000,'coco_images_invalid');
 requireObject(manifest,'manifest_object_required');
 failIf(manifest.schemaVersion!==1||!Array.isArray(manifest.records)||manifest.records.length!==coco.images.length,'manifest_record_count_or_schema');
 const images=new Map(), ids=new Set();
 for(const im of coco.images){
  requireObject(im,'image_invalid');
  failIf(!Number.isSafeInteger(im.id)||im.id<1||ids.has(im.id),'image_id_invalid');
  ids.add(im.id);
  failIf(typeof im.sha256!=='string'||!HEX.test(im.sha256)||images.has(im.sha256),'image_sha_invalid_or_duplicate');
  images.set(im.sha256,im);
 }
 const seen=new Set(), assignedGroups=new Map(), seenSplit=new Set();
 let unassigned=0, groupCount=0;
 for(const record of manifest.records){
  requireObject(record,'record_invalid');
  failIf(typeof record.imageSha256!=='string'||!HEX.test(record.imageSha256)||!images.has(record.imageSha256)||seen.has(record.imageSha256),'record_sha_unknown_or_duplicate');
  seen.add(record.imageSha256);
  failIf(typeof record.split!=='string'||!SPLITS.has(record.split),'record_split_invalid');
  const group=record.sourceSessionId;
  const evidence=record.evidence;
  if(record.split==='unassigned'){
   failIf(group!==null||evidence!==null,'unassigned_must_not_assert_group');
   unassigned++;continue;
  }
  failIf(typeof group!=='string'||!GROUP.test(group),'source_session_id_invalid');
  requireObject(evidence,'source_evidence_required');
  failIf(typeof evidence.uri!=='string'||evidence.uri.length>2048||!/^https:\/\//.test(evidence.uri),'source_evidence_https_required');
  failIf(typeof evidence.description!=='string'||!evidence.description.trim()||evidence.description.length>500,'source_evidence_description_required');
  // Refuse self-attested pseudo-evidence: not proof, even if syntactically valid.
  failIf(evidence.uri.includes('#')&&evidence.uri.endsWith('#filename'),'filename_is_not_source_evidence');
  if(assignedGroups.has(group)){
   failIf(assignedGroups.get(group)!==record.split,'same_session_across_splits');
  }else {assignedGroups.set(group,record.split);groupCount++;}
  seenSplit.add(record.split);
 }
 failIf(seen.size!==images.size,'manifest_incomplete');
 // No invented ready state: neither declarations nor internally consistent splits prove original recording membership.
 return Object.freeze({
  structurallyValid:true, totalImages:images.size, unassignedImages:unassigned,
  declaredSourceSessions:groupCount, declaredSplits:[...seenSplit].sort(),
  sourceIdentityVerified:false, independentHoldoutVerified:false,
  licenseVerified:false, trainingAuthorized:false, modelApproved:false,
  recognitionSucceeded:false, cleanupAuthorized:false
 });
}
