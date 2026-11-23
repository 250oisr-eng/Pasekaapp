(function(root){
'use strict';
// Optional commit adapter for fully witnessed OP-08/09/10 only.
// The public wizard remains preview-only. No external archive proof => no write.
// A caller may supply a real SECOND_DEVICE_VERIFIED restore capability; never
// derive permission from a check box, localStorage key or filename.
const O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const A=x=>Array.isArray(x)?x:[];
const S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const writable=new Set(['OP-08','OP-09','OP-10']);
async function commitWitnessed(draft,expectedRevision,deps={}){
 if(!O(draft)||!writable.has(draft.operationId)||draft.userConfirmed!==true||
    !S(draft.hiveId)||!S(draft.occurredAt)||!S(expectedRevision))
  return fail('browser_witnessed_operation_or_revision_missing');
 const required=['readMain','writeMainIfUnchanged','verifyFullArchiveAndReplay',
   'validateState','makeRevisionId','preparePersistentSnapshot','makeId'];
 if(required.some(key=>typeof deps[key]!=='function')||!S(deps.now)||
   !O(deps.runtime)||typeof deps.runtime.commit!=='function'||!O(deps.wizard)||
   typeof deps.wizard.validate!=='function'||!O(deps.transaction)||
   !O(deps.evidence)||!O(deps.ledger)||!O(deps.dualRead)||!O(deps.rules))
  return fail('browser_verified_storage_capabilities_missing');
 if(draft.operationId==='OP-08'&&typeof deps.extraction?.stage!=='function'||
    draft.operationId==='OP-09'&&typeof deps.entrances?.record!=='function'||
    draft.operationId==='OP-10'&&(typeof deps.honeyRemoval?.stage!=='function'||
      typeof deps.equipmentItems?.place!=='function'||typeof deps.provenance?.validate!=='function'))
  return fail('browser_physical_executor_missing');
 let latest;
 try{latest=await deps.readMain()}catch{return fail('browser_current_state_unavailable')}
 if(!O(latest)||latest.meta?.revisionId!==expectedRevision)
  return fail('browser_stale_revision_refuse_to_write');
 const matching=A(latest.sectionalSeasonCycles).filter(c=>c?.hiveId===draft.hiveId&&
   c.status==='ACTIVE');
 if(matching.length!==1)return fail('browser_active_cycle_not_unique');
 let normalizedAt;
 try{normalizedAt=new Date(draft.occurredAt).toISOString()}
 catch{return fail('browser_invalid_actual_time')}
 if(!Number.isFinite(Date.parse(normalizedAt))||
   Date.parse(normalizedAt)>Date.parse(deps.now))
  return fail('browser_actual_time_in_future');
 const wizardErrors=deps.wizard.validate(latest,draft);
 if(!Array.isArray(wizardErrors)||wizardErrors.length)
  return fail('browser_wizard_preflight_rejected',wizardErrors);
 const v=draft.values||{},eventId=deps.makeId(),txId=deps.makeId();
 if(!S(eventId)||!S(txId)||eventId===txId)return fail('browser_unique_event_id_required');
 const request={operationId:draft.operationId,hiveId:draft.hiveId,cycleId:matching[0].id,
  eventId,transactionId:txId,occurredAt:normalizedAt,userConfirmed:true,confirmedBy:'beekeeper'};
 if(draft.operationId==='OP-08'){
  request.sealedFrameIds=A(v.sealedFrameIds);
  request.sealingObserved=v.sealingObserved===true;
 }
 if(draft.operationId==='OP-09'){
  request.seasonPhase=v.phase;
  request.entrancesPersonallyObserved=v.allSectionsObserved===true;
 }
 if(draft.operationId==='OP-10'){
  request.honeyBodiesStoredConfirmed=v.actualHoneyStored===true;
  request.excludersStoredConfirmed=v.actualExcludersStored===true;
 }
 const executor=async(state,req)=>{
  // The persisted state is reread under CAS. Re-check physical facts again,
  // otherwise a stale form may be replayed against a changed inventory.
  if(state.meta?.revisionId!==expectedRevision||
     deps.wizard.validate(state,draft).length)return fail('browser_stale_form_or_inventory');
  if(req.operationId==='OP-08'){
   const extractionId=deps.makeId();
   if(!S(extractionId))return fail('browser_extraction_id_missing');
   return deps.extraction.stage(state,{hiveId:req.hiveId,operationId:'OP-08',
    extractionId,occurredAt:req.occurredAt,userConfirmed:true,
    honeySealedPersonallyObserved:v.sealingObserved,
    honeyExtractionActuallyDone:v.actualExtraction,
    honeyBodiesActuallyReturned:v.actualHoneyBodyReturn,
    frameIds:A(v.sealedFrameIds)},{
     makeId:deps.makeId,now:deps.now
    });
  }
  if(req.operationId==='OP-09'){
   const result=deps.entrances.record(state,{hiveId:req.hiveId,phase:v.phase,
    occurredAt:req.occurredAt,userConfirmed:true,
    sections:A(v.sectionEntrances).map(s=>({sectionId:s.sectionId,
     roundEntrances:s.roundEntrances,flatEntrance:s.flatEntrance})),notes:''
   },deps.makeId,deps.now);
   if(!result?.ok)return result;
   const candidate=structuredClone(state);
   candidate.sectionalSeasonalEntranceObservations=result.stagedHistory;
   return {ok:true,draft:candidate};
  }
  const bodyIds=A(v.honeyBodyIds),excludeIds=A(v.excluderIds),label=v.storageLabel;
  return deps.honeyRemoval.stage(state,{
   operationId:'OP-10',hiveId:req.hiveId,occurredAt:req.occurredAt,
   userConfirmed:true,honeyBodiesStoredConfirmed:v.actualHoneyStored,
   excludersStoredConfirmed:v.actualExcludersStored,
   coversActuallyReinstalled:v.coversReinstalled,
   bodyStorageLocations:Object.fromEntries(bodyIds.map(id=>[id,label])),
   excluderStorageLocations:Object.fromEntries(excludeIds.map(id=>[id,label])),
   stackAccessories:structuredClone(v.stackAccessories)
  },{makeId:deps.makeId,now:deps.now,PasekaEquipmentItems:deps.equipmentItems});
 };
 // Do not expose any write API until every real capability is supplied.
 let readCount=0;
 const guardedRead=async()=>{
  const state=await deps.readMain();readCount++;
  if(readCount===1&&state?.meta?.revisionId!==expectedRevision)
   throw Error('stale before runtime transaction');
  return state;
 };
 return deps.runtime.commit(request,{
  readMain:guardedRead,writeMainIfUnchanged:deps.writeMainIfUnchanged,
  verifyFullArchiveAndReplay:deps.verifyFullArchiveAndReplay,
  validateState:deps.validateState,makeRevisionId:deps.makeRevisionId,
  preparePersistentSnapshot:deps.preparePersistentSnapshot,
  transaction:deps.transaction,evidence:deps.evidence,ledger:deps.ledger,
  dualRead:deps.dualRead,rules:deps.rules,provenance:deps.provenance,
  executors:{[draft.operationId]:executor}
 });
}
root.PasekaSectionalSeasonBrowserCommitV2=Object.freeze({commitWitnessed,writableOperations:[...writable]});
})(typeof window!=='undefined'?window:globalThis);
