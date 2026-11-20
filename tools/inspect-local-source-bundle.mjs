// Staging-only, fail-closed composition: structure first, real local bytes second.
// No inference, licensing, user media handling, training or deletion privileges.
import {inspectSourceManifest} from './inspect-source-session-manifest.mjs';
import {verifyLocalSourceRecordings} from './verify-local-source-recordings.mjs';

export async function inspectLocalSourceBundle(coco,manifest,sourceRoot,files){
 // Always validate COCO image SHA, exact coverage, split membership and recording
 // collisions before attempting to read anything from the staging filesystem.
 const structure=inspectSourceManifest(coco,manifest);
 if(structure.declaredRecordingHashes===0){
  return Object.freeze({
   ...structure, localBytesMatchDeclarations:false,
   checkedRecordings:0, checkedBytes:0,
   status:'unassigned_no_recordings',
   sourceIdentityVerified:false, independentHoldoutVerified:false,
   licenseVerified:false, trainingAuthorized:false, modelApproved:false,
   recognitionSucceeded:false, cleanupAuthorized:false
  });
 }
 const physical=await verifyLocalSourceRecordings(manifest,sourceRoot,files);
 if(!physical.localBytesMatchDeclarations||
    physical.checkedRecordings!==structure.declaredRecordingHashes)
  throw new Error('joined_source_count_mismatch');
 return Object.freeze({
  ...structure, ...physical,
  status:'structure_and_local_bytes_match_declarations',
  // Even a matching source file is not evidence of frame extraction.
  sourceIdentityVerified:false, independentHoldoutVerified:false,
  licenseVerified:false, trainingAuthorized:false, modelApproved:false,
  recognitionSucceeded:false, cleanupAuthorized:false
 });
}
