(function(root){
'use strict';
// Staging only: a sampled time series cannot prove it follows the same bee.
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const invalid=reason=>({ok:false,reason,identityVerified:false,recognitionSucceeded:false,
  cleanupAuthorized:false});
function auditTemporalCoverage(observations,policy){
 if(!policy||!finite(policy.maxGapSec)||policy.maxGapSec<=0||policy.maxGapSec>10||
    !Number.isInteger(policy.minObservations)||policy.minObservations<3||policy.minObservations>100)
  return invalid('temporal_policy_required');
 if(!Array.isArray(observations)||observations.length<policy.minObservations||
    observations.length>500)return invalid('insufficient_observations');
 let first=null,previous=null,maxGap=0;
 for(const item of observations){
  if(!item||typeof item.trackId!=='string'||item.trackId.length<1||item.trackId.length>128||
    !finite(item.timeSec)||item.timeSec<0||
    !finite(item.x)||item.x<0||item.x>1||!finite(item.y)||item.y<0||item.y>1||
    !finite(item.confidence)||item.confidence<0||item.confidence>1)
   return invalid('invalid_observation');
  if(first===null)first=item.trackId;
  if(item.trackId!==first)return invalid('track_identity_changed');
  if(previous){
   const gap=item.timeSec-previous.timeSec;
   if(gap<=0)return invalid('time_not_monotonic');
   maxGap=Math.max(maxGap,gap);
  }
  previous=item;
 }
 if(maxGap>policy.maxGapSec)return invalid('temporal_gaps_too_large');
 return {ok:true,stage:'unverified_temporal_coverage',observationCount:observations.length,
  firstTimeSec:observations[0].timeSec,lastTimeSec:observations[observations.length-1].timeSec,
  maxObservedGapSec:maxGap,identityVerified:false,recognitionSucceeded:false,
  cleanupAuthorized:false,reviewRequired:true};
}
root.PasekaVideoTemporalCoverage=Object.freeze({auditTemporalCoverage});
})(typeof window!=='undefined'?window:globalThis);
