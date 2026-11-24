/* G0: redacted, READ-ONLY inventory of the currently open IndexedDB. No byte reads, exports or deletion. */
(function(root){
'use strict';
const KNOWN=['main','full_backup','entrance_media'];
function ensure(ok,message){if(!ok)throw Error(message);}
function totals(){return {nodes:0,blobCount:0,blobBytes:0,fileCount:0,videoDataUrls:0,imageDataUrls:0,otherDataUrls:0,approxDataUrlBytes:0,opaqueMedia:0,limitReached:false};}
function dataUrlInfo(value){
 if(typeof value!=='string'||!value.startsWith('data:'))return null;
 const comma=value.indexOf(',');
 if(comma<0||comma>200||!/^data:[^,]*;base64$/i.test(value.slice(0,comma)))return {kind:'opaque',bytes:null};
 const kind=(value.slice(5,comma).split(/[;/]/)[0]||'').toLowerCase();
 const size=value.length-comma-1;
 const padding=(value.endsWith('==')?2:value.endsWith('=')?1:0);
 if(size%4!==0||size<0)return {kind:'opaque',bytes:null};
 return {kind:kind.startsWith('video')?'video':kind.startsWith('image')?'image':'other',bytes:(size/4)*3-padding};
}
function scan(value,stats,depth=0,seen=new WeakSet()){
 stats.nodes++;
 if(stats.nodes>250000||depth>65){stats.limitReached=true;return;}
 if(value===null||value===undefined)return;
 if(typeof value==='string'){
  const info=dataUrlInfo(value);
  if(info){
   if(info.kind==='video')stats.videoDataUrls++;
   else if(info.kind==='image')stats.imageDataUrls++;
   else if(info.kind==='other')stats.otherDataUrls++;
   else stats.opaqueMedia++;
   if(info.bytes!==null)stats.approxDataUrlBytes+=info.bytes;
  }
  return;
 }
 if(typeof value!=='object')return;
 if(value instanceof Blob){
  stats.blobCount++;stats.blobBytes+=value.size;
  if(typeof File!=='undefined'&&value instanceof File)stats.fileCount++;
  return;
 }
 if(value instanceof ArrayBuffer||ArrayBuffer.isView(value)||value instanceof Date)return;
 if(seen.has(value)){stats.limitReached=true;return;}
 seen.add(value);
 if(Array.isArray(value)){for(const item of value)scan(item,stats,depth+1,seen);}
 else {
  if(value.kind==='video'&&typeof value.data!=='string'&&!(value.blob instanceof Blob))stats.opaqueMedia++;
  for(const k of Object.keys(value))scan(value[k],stats,depth+1,seen);
 }
 seen.delete(value);
}
function summarizeMain(state){
 const stat=totals();
 if(state&&typeof state==='object')scan(state,stat);
 return {present:!!state,records:Array.isArray(state?.records)?state.records.length:null,journalMediaItems:Array.isArray(state?.records)?state.records.reduce((n,r)=>n+(Array.isArray(r?.media)?r.media.length:0),0):null,stats:stat};
}
function readOnlyInventory(db){
 ensure(db&&typeof db.transaction==='function','An opened IndexedDB connection is required');
 const names=Array.from(db.objectStoreNames);
 const report={
  schema:'paseka-g0-readonly-v1',status:'PARTIAL_READONLY',scope:'CURRENT_INDEXEDDB_ONLY',
  database:db.name,version:db.version,stores:[],main:null,fullBackup:{entries:0,stats:totals()},entranceMedia:{entries:0,withBlob:0,blobBytes:0,missingBlob:0,declaredSizeMismatch:0},
  issues:[],osMediaStore:'NOT_ACCESSED',externalFiles:'NOT_ACCESSED',otherOrigins:'UNKNOWN',
  originalByteHashesVerified:false,backupVerified:false,restoreVerified:false,cleanupAuthorized:false
 };
 if(db.name!=='paseka-v1')report.issues.push('UNEXPECTED_DATABASE_NAME');
 for(const name of KNOWN)if(!names.includes(name))report.issues.push('MISSING_REQUIRED_STORE_'+name);
 for(const name of names)if(!KNOWN.includes(name))report.issues.push('UNINSPECTED_STORE_'+name);
 if(!names.length){report.issues.push('EMPTY_DATABASE_SCHEMA');return Promise.resolve(report);}
 return new Promise((resolve,reject)=>{
  let tx,done=false;
  function fail(error){if(done)return;done=true;reject(error||Error('G0 readonly transaction aborted'));}
  try{
   tx=db.transaction(names,'readonly');
   for(const name of names){
    const store=tx.objectStore(name),info={name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,count:null,valuesInspected:KNOWN.includes(name)};
    report.stores.push(info);
    const count=store.count();
    count.onsuccess=()=>{info.count=count.result;};
    count.onerror=()=>fail(count.error);
    if(name==='main'){
     const req=store.get('state');
     req.onsuccess=()=>{try{report.main=summarizeMain(req.result);}catch(e){try{tx.abort();}catch(_){}fail(e);}};
     req.onerror=()=>fail(req.error);
    }else if(name==='full_backup'||name==='entrance_media'){
     const cursor=store.openCursor();
     cursor.onsuccess=()=>{
      try{
       const c=cursor.result;if(!c)return;
       if(name==='full_backup'){
        report.fullBackup.entries++;
        scan(c.value,report.fullBackup.stats);
       }else{
        report.entranceMedia.entries++;
        const val=c.value,blob=val?.blob;
        if(blob instanceof Blob){
         report.entranceMedia.withBlob++;
         report.entranceMedia.blobBytes+=blob.size;
         if(val?.bytes!==undefined&&val.bytes!==blob.size)report.entranceMedia.declaredSizeMismatch++;
        }else report.entranceMedia.missingBlob++;
       }
       c.continue();
      }catch(e){try{tx.abort();}catch(_){}fail(e);}
     };
     cursor.onerror=()=>fail(cursor.error);
    }
   }
   tx.oncomplete=()=>{
    if(done)return;
    done=true;
    if(!report.main?.present)report.issues.push('MAIN_STATE_MISSING');
    if(report.main?.stats.limitReached||report.fullBackup.stats.limitReached)report.issues.push('SCAN_LIMIT_REACHED');
    if(report.entranceMedia.missingBlob)report.issues.push('ENTRANCE_ORIGINAL_BLOB_MISSING');
    if(report.entranceMedia.declaredSizeMismatch)report.issues.push('ENTRANCE_BLOB_SIZE_MISMATCH');
    if(report.main?.stats.opaqueMedia||report.fullBackup.stats.opaqueMedia)report.issues.push('OPAQUE_EMBEDDED_MEDIA');
    resolve(report);
   };
   tx.onerror=()=>fail(tx.error);
   tx.onabort=()=>fail(tx.error||Error('G0 readonly transaction aborted'));
  }catch(e){try{tx?.abort();}catch(_){}fail(e);}
 });
}
root.PasekaP0SourceInventory=Object.freeze({readOnlyInventory});
})(typeof window!=='undefined'?window:globalThis);
