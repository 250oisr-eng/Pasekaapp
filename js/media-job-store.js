(function(root){
'use strict';

const STORE_NAME='media_jobs';
const STATES=['queued','analyzing','failed_retryable','failed_permanent','result_received','result_persisted','cleanup_pending','completed_retained','completed_deleted'];
const text=value=>typeof value==='string'&&value.trim().length>0;
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);

function ensureStore(database){
 if(!database||!database.objectStoreNames||typeof database.createObjectStore!=='function')
  throw new TypeError('Требуется IndexedDB database в upgrade transaction');
 if(database.objectStoreNames.contains(STORE_NAME))return null;
 const store=database.createObjectStore(STORE_NAME,{keyPath:'id'});
 store.createIndex('status','status',{unique:false});
 store.createIndex('hiveId','hiveId',{unique:false});
 store.createIndex('capturedAt','capturedAt',{unique:false});
 store.createIndex('recordId','recordId',{unique:false});
 return store;
}

function createMediaJobStore({db,lifecycle=root.PasekaMediaLifecycle,now=()=>new Date().toISOString()}={}){
 if(!db||typeof db.transaction!=='function')throw new TypeError('Не передана открытая IndexedDB база');
 if(!lifecycle||typeof lifecycle.transitionMediaJob!=='function')throw new TypeError('Не подключён media lifecycle contract');

 function requestValue(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Ошибка IndexedDB request'))})}
 function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve(true);tx.onabort=()=>reject(tx.error||new Error('Транзакция IndexedDB прервана'));tx.onerror=()=>reject(tx.error||new Error('Ошибка транзакции IndexedDB'))})}

 async function enqueue(input={}){
  const at=now(),id=input.id;
  if(!text(id)||!['image','video'].includes(input.kind)||!input.blob||!Number.isFinite(input.blob.size)||input.blob.size<=0||typeof input.blob.arrayBuffer!=='function')
   throw new TypeError('Некорректный исходный файл для media job');
  if(!timestamp(at)||!timestamp(input.capturedAt||at))throw new TypeError('Некорректная дата исходного файла');
  if(input.hiveId!=null&&!text(input.hiveId))throw new TypeError('Некорректная связь с ульем');
  if(input.familyId!=null&&!text(input.familyId))throw new TypeError('Некорректная связь с семьёй');
  if(input.recordId!=null&&!text(input.recordId))throw new TypeError('Некорректная связь с записью журнала');
  const job={
   id,kind:input.kind,blob:input.blob,name:String(input.name||'').slice(0,160),
   mimeType:String(input.mimeType||input.blob.type||'').slice(0,120),bytes:input.blob.size,
   hiveId:input.hiveId||null,familyId:input.familyId||null,recordId:input.recordId||null,
   capturedAt:input.capturedAt||at,createdAt:at,updatedAt:at,
   originalRef:'media-job:'+id,status:'queued',retryCount:0,
   retainOriginal:input.retainOriginal===true,lastError:null,
   result:null,resultId:null,resultValidated:false,resultPersistedAt:null
  };
  const tx=db.transaction(STORE_NAME,'readwrite'),done=transactionDone(tx),store=tx.objectStore(STORE_NAME);
  try{store.add(job)}catch(error){try{tx.abort()}catch{}throw error}
  await done;
  return {...job};
 }

 async function get(id){
  const tx=db.transaction(STORE_NAME,'readonly'),done=transactionDone(tx);
  const request=tx.objectStore(STORE_NAME).get(id);
  const value=await requestValue(request);await done;return value||null;
 }

 async function list({status=null,hiveId=null,recordId=null}={}){
  const tx=db.transaction(STORE_NAME,'readonly'),done=transactionDone(tx),store=tx.objectStore(STORE_NAME);
  let rows;
  if(status)rows=await requestValue(store.index('status').getAll(status));
  else if(hiveId)rows=await requestValue(store.index('hiveId').getAll(hiveId));
  else if(recordId)rows=await requestValue(store.index('recordId').getAll(recordId));
  else rows=await requestValue(store.getAll());
  await done;
  return (rows||[]).filter(row=>(!status||row.status===status)&&(!hiveId||row.hiveId===hiveId)&&(!recordId||row.recordId===recordId))
   .sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)));
 }

 async function transitionInternal(id,next,details={}){
  const tx=db.transaction(STORE_NAME,'readwrite'),done=transactionDone(tx),store=tx.objectStore(STORE_NAME);
  const request=store.get(id);
  request.onsuccess=()=>{
   const current=request.result;
   if(!current){try{tx.abort()}catch{}return}
   const changed=lifecycle.transitionMediaJob(current,next,details,now());
   if(!changed.ok){try{tx.abort()}catch{}return}
   try{store.put(changed.job)}catch(error){try{tx.abort()}catch{}}
  };
  await done;
  return get(id);
 }

 async function transition(id,next,details={}){
  if(!object(details))throw new TypeError('Некорректные параметры перехода');
  const safeDetails={};
  if(typeof details.lastError==='string')safeDetails.lastError=details.lastError;
  if(timestamp(details.nextAttemptAt))safeDetails.nextAttemptAt=details.nextAttemptAt;
  if(details.retainOriginal===true)safeDetails.retainOriginal=true;
  return transitionInternal(id,next,safeDetails);
 }

 async function receiveResult(id,result){
  if(!object(result))throw new TypeError('Результат анализа должен быть объектом');
  return transitionInternal(id,'result_received',{result});
 }

 async function persistResult(id,{resultId,validateResult}={}){
  if(!text(resultId)||typeof validateResult!=='function')
   throw new TypeError('Для сохранения результата требуется функция локальной проверки');
  const tx=db.transaction(STORE_NAME,'readwrite'),done=transactionDone(tx),store=tx.objectStore(STORE_NAME);
  const request=store.get(id);
  request.onsuccess=()=>{
   const current=request.result;
   if(!current){try{tx.abort()}catch{}return}
   let valid=false;
   try{valid=validateResult(current.result)===true}catch{valid=false}
   if(!valid){try{tx.abort()}catch{}return}
   const at=now(),changed=lifecycle.transitionMediaJob(current,'result_persisted',{
    resultId,resultValidated:true,resultPersistedAt:at
   },at);
   if(!changed.ok){try{tx.abort()}catch{}return}
   try{store.put(changed.job)}catch(error){try{tx.abort()}catch{}}
  };
  await done;
  return get(id);
 }

 async function confirmResultBackup(id,{backupRevisionId,verifyBackup}={}){
  if(!text(id)||!text(backupRevisionId)||typeof verifyBackup!=='function')
   throw new TypeError('Для подтверждения резервной копии требуются её ревизия и функция проверки');
  const current=await get(id);
  if(!current||current.status!=='result_persisted'||current.resultValidated!==true||
     !text(current.resultId)||!timestamp(current.resultPersistedAt)||!text(current.originalRef))
   throw new Error('Сначала необходимо сохранить и проверить результат анализа');
  const verificationResult=await verifyBackup({
   jobId:current.id,resultId:current.resultId,result:current.result,
   originalRef:current.originalRef,backupRevisionId
  });
  if(verificationResult!==true)
   throw new Error('Результат анализа не подтверждён в резервной копии; оригинал сохранён');
  const tx=db.transaction(STORE_NAME,'readwrite'),done=transactionDone(tx),store=tx.objectStore(STORE_NAME);
  const request=store.get(id);
  request.onsuccess=()=>{
   const latest=request.result;
   if(!latest||latest.status!=='result_persisted'||latest.resultId!==current.resultId||
      latest.resultPersistedAt!==current.resultPersistedAt||latest.updatedAt!==current.updatedAt){
    try{tx.abort()}catch{}
    return;
   }
   const at=now(),updated={...latest,resultBackupRevisionId, resultBackupVerifiedAt:at,updatedAt:at};
   try{store.put(updated)}catch(error){try{tx.abort()}catch{}}
  };
  await done;
  return get(id);
 }

 async function scheduleCleanup(id){
  return transitionInternal(id,'cleanup_pending',{});
 }

 async function cleanup(id){
  const tx=db.transaction(STORE_NAME,'readwrite'),done=transactionDone(tx),store=tx.objectStore(STORE_NAME);
  const request=store.get(id);
  request.onsuccess=()=>{
   const current=request.result;
   if(!current){try{tx.abort()}catch{}return}
   if(current.status==='completed_deleted')return;
   if(!lifecycle.canDeleteMediaOriginal(current)){try{tx.abort()}catch{}return}
   const at=now(),changed=lifecycle.transitionMediaJob(current,'completed_deleted',{
    originalDeleted:true,originalDeletedAt:at,blob:null
   },at);
   if(!changed.ok){try{tx.abort()}catch{}return}
   delete changed.job.blob;
   try{store.put(changed.job)}catch(error){try{tx.abort()}catch{}}
  };
  await done;
  return get(id);
 }

 async function resumeCleanup(){
  const pending=await list({status:'cleanup_pending'}),results=[];
  for(const job of pending){try{results.push(await cleanup(job.id))}catch(error){results.push({id:job.id,error:String(error?.message||error)})}}
  return results;
 }

 return Object.freeze({enqueue,get,list,transition,receiveResult,persistResult,confirmResultBackup,scheduleCleanup,cleanup,resumeCleanup});
}

root.PasekaMediaJobStore=Object.freeze({STORE_NAME,ensureStore,createMediaJobStore});
})(typeof window!=='undefined'?window:globalThis);
