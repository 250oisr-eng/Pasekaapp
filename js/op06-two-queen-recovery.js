(function(root){
'use strict';
// OP-06 two-queen recovery is a read-only plan. It cannot move frames,
// change metal plugs, or mark a physical operation DONE.
const arr=x=>Array.isArray(x)?x:[];
const validId=x=>typeof x==='string'&&x.trim().length>0;
function plan(input){
 const errors=[];
 const bad=x=>errors.push(x);
 if(!input||typeof input!=='object')return {ok:false,errors:['recovery_input_required']};
 const sections=arr(input.sections);
 if(sections.length!==3||new Set(sections.map(x=>x?.id)).size!==3||
    sections.some(x=>!validId(x?.id)||!['LEFT','CENTER','RIGHT'].includes(x.position))||
    new Set(sections.map(x=>x.position)).size!==3)bad('three_physical_positions_required');
 const missing=sections.find(x=>x?.id===input.queenlessSectionId);
 if(!missing)bad('queenless_section_not_identified');
 if(sections.filter(x=>x.queenState==='QUEENLESS').length!==1||
    missing?.queenState!=='QUEENLESS'||
    sections.filter(x=>x.queenState==='QUEENRIGHT').length!==2)
   bad('two_queenright_and_one_queenless_observations_required');
 const transfers=arr(input.transfers);
 if(transfers.length!==2)bad('exactly_two_brood_frames_required');
 if(transfers.some(t=>!validId(t?.frameId)||!validId(t?.fromSectionId)||
   t.toSectionId!==input.queenlessSectionId||t.broodObserved!==true||
   t.queenAbsentOnTransferredFrameConfirmed!==true))bad('actual_brood_and_queen_safety_required');
 if(new Set(transfers.map(t=>t.frameId)).size!==transfers.length)bad('duplicate_frame');
 if(transfers.some(t=>!sections.some(s=>s.id===t.fromSectionId&&s.queenState==='QUEENRIGHT')))
   bad('donor_must_be_queenright');
 if(input.userConfirmed!==true)bad('beekeeper_confirmation_required');
 if(errors.length)return {ok:false,errors};
 return {
   ok:true,readOnly:true,operationCompleted:false,
   queenlessSectionId:missing.id,
   transfers:transfers.map(t=>({frameId:t.frameId,fromSectionId:t.fromSectionId,toSectionId:t.toSectionId})),
   meshRule:missing.position==='CENTER'?'KEEP_EXISTING_MESH':
     'REAPPLY_INITIAL_ISOLATION_RULE_AT_CENTER_EDGE',
   meshBoundary:missing.position==='CENTER'?null:
     {betweenPositions:[missing.position,'CENTER']},
   meshTiming:'REQUIRES_ACTUAL_OBSERVATION_AND_CONFIRMATION',
   queenRearingOutcome:'UNKNOWN',
   releaseAllowed:false
 };
}
root.PasekaOP06TwoQueenRecovery=Object.freeze({plan});
})(typeof window!=='undefined'?window:globalThis);
