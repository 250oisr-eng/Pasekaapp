import {open,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const BLOCK=512, LIMIT=16*1024*1024*1024, MAX_ENTRIES=250000;
function allZero(b){for(const x of b)if(x!==0)return false;return true;}
function tarNumber(b){
 if(b[0]&0x80) {
  // GNU/base-256 signed 2's complement; only small positive sizes accepted.
  if(b[0]&0x40)return null;
  let n=BigInt(b[0]&0x3f);
  for(let i=1;i<b.length;i++)n=(n<<8n)+BigInt(b[i]);
  return n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;
 }
 const s=b.toString('latin1').replace(/\0.*$/s,'').trim();
 if(!/^[0-7]+$/.test(s))return null;
 const n=parseInt(s,8);
 return Number.isSafeInteger(n)?n:null;
}
export function headerCheck(header) {
 if(header.length!==BLOCK)return {valid:false,reason:'SHORT_HEADER'};
 if(allZero(header))return {valid:true,zero:true};
 const stored=tarNumber(header.subarray(148,156));
 if(stored===null)return {valid:false,reason:'INVALID_HEADER_CHECKSUM_FIELD'};
 let checksum=0;
 for(let i=0;i<BLOCK;i++)checksum+=i>=148&&i<156?32:header[i];
 if(checksum!==stored)return {valid:false,reason:'HEADER_CHECKSUM_MISMATCH'};
 const payload=tarNumber(header.subarray(124,136));
 if(payload===null)return {valid:false,reason:'INVALID_ENTRY_SIZE'};
 return {valid:true,zero:false,payload};
}
async function readBlock(handle,position){
 const b=Buffer.alloc(BLOCK);
 const {bytesRead}=await handle.read(b,0,BLOCK,position);
 return {bytesRead,buf:b};
}
// Search only nearby header positions to diagnose a byte insertion/shift.
// A valid checksum is a diagnostic hint, NOT permission to repair the archive.
async function nearbyHeaderOffsets(h,size,expected){
 const candidates=[];
 for(let delta=-511;delta<=511;delta++){
  if(delta===0)continue;
  const at=expected+delta;
  if(at<0||at+BLOCK>size)continue;
  const {bytesRead,buf}=await readBlock(h,at);
  if(bytesRead!==BLOCK)continue;
  const valid=headerCheck(buf);
  if(valid.valid && !valid.zero){
   candidates.push(delta);
   if(candidates.length>=8)break;
  }
 }
 return candidates;
}
export async function inspectPartial(path){
 const src=resolve(path),stat=await lstat(src);
 if(stat.isSymbolicLink()||!stat.isFile()||stat.size>LIMIT||!src.endsWith('.tar.partial'))throw Error('INVALID_PARTIAL_SOURCE');
 const h=await open(src,'r');
 try{
  let pos=0,entries=0,endingOffset=null,problem=null,invalidHeaderOffset=null,resyncCandidates=[];
  while(pos+BLOCK<=stat.size){
    const block=await readBlock(h,pos);
    if(block.bytesRead!==BLOCK){problem='READ_SHORT';break;}
    const v=headerCheck(block.buf);
    if(!v.valid){problem=v.reason;invalidHeaderOffset=pos;break;}
    if(v.zero){
      if(pos+BLOCK*2>stat.size){problem='MISSING_SECOND_END_BLOCK';break;}
      const next=await readBlock(h,pos+BLOCK);
      if(next.bytesRead!==BLOCK||!allZero(next.buf)){problem='MISSING_SECOND_END_BLOCK';break;}
      endingOffset=pos+BLOCK*2;
      break;
    }
    entries++;
    if(entries>MAX_ENTRIES){problem='TOO_MANY_ENTRIES';break;}
    const padded=Math.ceil(v.payload/BLOCK)*BLOCK;
    if(!Number.isSafeInteger(padded)||pos+BLOCK+padded>stat.size){
      problem='ENTRY_CONTENT_TRUNCATED';break;
    }
    pos+=BLOCK+padded;
  }
  if(endingOffset===null&&!problem)problem=pos===stat.size?'END_MARKERS_MISSING':'INCOMPLETE_LAST_BLOCK';
  let trailingNonzero=false,bytesAfterEnd=null;
  if(endingOffset!==null){
    bytesAfterEnd=stat.size-endingOffset;
    const tmp=Buffer.alloc(64*1024);
    for(let i=endingOffset;i<stat.size;i+=tmp.length){
      const size=Math.min(tmp.length,stat.size-i);
      const {bytesRead}=await h.read(tmp,0,size,i);
      if(bytesRead!==size){problem='TRAILING_READ_FAILED';break;}
      if(!allZero(tmp.subarray(0,size))){trailingNonzero=true;break;}
    }
    if(!problem&&trailingNonzero)problem='NONZERO_DATA_AFTER_TAR_END';
  }
  if(invalidHeaderOffset!==null && ['INVALID_HEADER_CHECKSUM_FIELD','HEADER_CHECKSUM_MISMATCH','INVALID_ENTRY_SIZE'].includes(problem)){
    resyncCandidates=await nearbyHeaderOffsets(h,stat.size,invalidHeaderOffset);
  }
  const exact=stat.size%BLOCK===0;
  const ok=!problem&&endingOffset!==null&&exact;
  return {schema:'paseka-partial-tar-audit-v1',
   status:ok?'TAR_STRUCTURE_CHECKED_LOCAL_ONLY':'TAR_INCOMPLETE_OR_INVALID',
   reason:problem||(!exact?'NON_512_ALIGNED_LENGTH':null),
   bytes:stat.size,remainder512:stat.size%BLOCK,
   headersVerified:entries,invalidHeaderOffset,resyncCandidateShifts:resyncCandidates,
   endMarkerFound:endingOffset!==null,
   bytesAfterEnd,trailingNonzero,originalsChanged:false,
   sourceModified:false,contentsExtracted:false,
   independentAndroidRestoreVerified:false};
 }finally{await h.close();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 Promise.resolve().then(()=>{if(process.argv.length!==3)throw Error('INVALID_ARGUMENTS');return inspectPartial(process.argv[2]);})
 .then(r=>console.log(JSON.stringify(r,null,2)),e=>{
  console.log(JSON.stringify({schema:'paseka-partial-tar-audit-v1',status:'BLOCKED',
   reason:/^[A-Z_]+$/.test(e.message)?e.message:'INVALID_PARTIAL_SOURCE',originalsChanged:false}));
  process.exitCode=1;
 });
}
