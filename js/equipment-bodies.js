(()=>{function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value))}
function framesAt(layout,key,honeyKeys){return honeyKeys.includes(key)?layout.honeyFrames?.[honeyKeys.indexOf(key)]:layout.boxes?.[key]?.frames}
function compatible(state,fromHive,toHive,fromKey,toKey,fromHoney,toHoney){
 if(fromHoney!==toHoney)return false;
 const hiveA=state.hives.find(h=>h.id===fromHive),hiveB=state.hives.find(h=>h.id===toHive);
 const a=hiveA?.profile,b=hiveB?.profile;
 // A shared identifier is not physical proof when one persisted profile is missing.
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)||Array.isArray(b))return false;
 const role=fromHoney?'honey':'brood',ap=a[role]||{},bp=b[role]||{},af=a.frame||{},bf=b.frame||{};
 if(!Number.isSafeInteger(ap.framesPerBox)||ap.framesPerBox<=0||ap.framesPerBox!==bp.framesPerBox)return false;
 if(!Number.isFinite(af.heightMm)||af.heightMm<=0||af.heightMm!==bf.heightMm)return false;
 for(const key of ['widthMm','topBarMm','bottomBarMm'])if((af[key]??null)!==(bf[key]??null))return false;
 const boxHeightA=ap.boxHeightMm??null,boxHeightB=bp.boxHeightMm??null;
 if(boxHeightA!==boxHeightB)return false;
 if(boxHeightA!=null&&(!Number.isFinite(boxHeightA)||boxHeightA<=0))return false;
 if(role==='brood'&&boxHeightA==null)return false;
 const familyA=typeof a.family==='string'?a.family.trim():'',familyB=typeof b.family==='string'?b.family.trim():'';
 if((familyA||familyB)&&familyA!==familyB)return false;
 const idA=a.id||hiveA?.profileId,idB=b.id||hiveB?.profileId;
 if(idA&&idA===idB)return true;
 // Different catalog IDs cannot be equated using unknown dimensions or family.
 if(!familyA||!familyB||boxHeightA==null)return false;
 return ['widthMm','topBarMm','bottomBarMm'].every(key=>af[key]!=null&&bf[key]!=null);
}

function frameHistoryIsValid(frames){return Array.isArray(frames)&&frames.every(frame=>frame&&typeof frame==='object'&&!Array.isArray(frame)&&(frame.history==null||(Array.isArray(frame.history)&&frame.history.every(event=>event&&typeof event==='object'&&!Array.isArray(event)))))}
function swap(state,request,date){const fail=code=>({ok:false,error:{code}});if(!state||!Array.isArray(state.hives)||!request)return fail('invalid_request');const {fromHiveId,toHiveId}=request,fromKey=String(request.fromBoxKey??''),toKey=String(request.toBoxKey??'');if(!fromHiveId||!toHiveId||!fromKey||!toKey)return fail('location_required');if(fromHiveId===toHiveId&&fromKey===toKey)return fail('same_location');if(!state.hives.some(h=>h?.id===fromHiveId)||!state.hives.some(h=>h?.id===toHiveId))return fail('hive_missing');const from=state.layouts?.[fromHiveId],to=state.layouts?.[toHiveId];if(!from||!to||!from.corpusIds||!to.corpusIds)return fail('layout_missing');const fromId=from.corpusIds[fromKey],toId=to.corpusIds[toKey];if(!fromId||!toId)return fail('corpus_missing');if(fromId===toId)return fail('duplicate_corpus_id');const seen=new Set();for(const layout of Object.values(state.layouts||{})){for(const id of Object.values(layout?.corpusIds||{})){if(!id||seen.has(id))return fail('duplicate_corpus_mapping');seen.add(id)}}const profile=id=>state.hives.find(h=>h.id===id)?.profile||{},fromHoney=profile(fromHiveId).honey?.boxKeys?.map(String)||['H1','H2'],toHoney=profile(toHiveId).honey?.boxKeys?.map(String)||['H1','H2'],fromIsHoney=fromHoney.includes(fromKey),toIsHoney=toHoney.includes(toKey),fromBox=fromIsHoney?null:from.boxes?.[fromKey],toBox=toIsHoney?null:to.boxes?.[toKey];if((!fromIsHoney&&!fromBox)||(!toIsHoney&&!toBox))return fail('box_missing');if(!compatible(state,fromHiveId,toHiveId,fromKey,toKey,fromIsHoney,toIsHoney))return fail('incompatible_corpus');if(fromBox?.family||toBox?.family)return fail('family_present');const fromFrames=framesAt(from,fromKey,fromHoney),toFrames=framesAt(to,toKey,toHoney);if(!Array.isArray(fromFrames)||!Array.isArray(toFrames))return fail('frames_missing');if(!frameHistoryIsValid(fromFrames)||!frameHistoryIsValid(toFrames))return fail('invalid_frame_history');let draft;try{draft=clone(state)}catch{return fail('clone_failed')}const a=draft.layouts[fromHiveId],b=draft.layouts[toHiveId],aFrames=framesAt(a,fromKey,fromHoney),bFrames=framesAt(b,toKey,toHoney);a.corpusIds[fromKey]=toId;b.corpusIds[toKey]=fromId;if(fromIsHoney)a.honeyFrames[fromHoney.indexOf(fromKey)]=bFrames;else a.boxes[fromKey].frames=bFrames;if(toIsHoney)b.honeyFrames[toHoney.indexOf(toKey)]=aFrames;else b.boxes[toKey].frames=aFrames;const record=(list,oldHive,oldBox,newHive,newBox)=>{for(const frame of list){if(!frame||typeof frame!=='object')continue;frame.location=newBox;frame.history=Array.isArray(frame.history)?frame.history:[];window.PasekaLabels.appendFrameEvent(frame,'corpus_transfer',{from:{hiveId:oldHive,box:oldBox},to:{hiveId:newHive,box:newBox}},date)}};record(aFrames,fromHiveId,fromKey,toHiveId,toKey);record(bFrames,toHiveId,toKey,fromHiveId,fromKey);return {ok:true,state:draft,moved:{from:{hiveId:fromHiveId,box:fromKey,corpusId:fromId},to:{hiveId:toHiveId,box:toKey,corpusId:fromId},swappedCorpusId:toId,fromLabel:state.equipmentLabels?.bodies?.[fromId]||null,toLabel:state.equipmentLabels?.bodies?.[toId]||null}}}
window.PasekaBodies={swapLocations:swap}})();