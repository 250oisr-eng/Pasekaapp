(function(root){
'use strict';
// Prepare NEW journal video attachments with stable identity and verified
// source evidence. Legacy records are never rewritten or auto-deleted.
const MAX_BYTES=50*1024*1024;
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=200&&!/\s/.test(x);
const validMime=x=>typeof x==='string'&&/^(?:video\/[a-z0-9.+-]+|application\/octet-stream)$/i.test(x);
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function fail(code){const e=new Error(code);e.code=code;throw e;}
async function prepareVideo(file,deps){
 if(!file||typeof file.slice!=='function'||!Number.isSafeInteger(file.size)||
    file.size<=0||file.size>MAX_BYTES)fail('JOURNAL_VIDEO_INVALID_FILE');
 if(typeof deps?.hashBlobHex!=='function'||
    typeof deps?.hashVideoDataUrlHex!=='function'||
    typeof deps?.readDataUrl!=='function'||
    typeof deps?.newId!=='function'||
    typeof deps?.videoMime!=='function')
  fail('JOURNAL_VIDEO_DEPS_MISSING');
 const type=deps.videoMime(file);
 if(!validMime(type))fail('JOURNAL_VIDEO_MIME_INVALID');
 const videoId=deps.newId();
 if(!validId(videoId))fail('JOURNAL_VIDEO_ID_INVALID');
 const sourceSha256=await deps.hashBlobHex(file);
 if(!validHash(sourceSha256))fail('JOURNAL_VIDEO_SOURCE_HASH_INVALID');
 const raw=await deps.readDataUrl(file);
 // FileReader can emit data:;base64, for video files with no MIME. Replace
 // only the header: original encoded bytes remain intact and are rehashed.
 const match=typeof raw==='string'&&
  /^data:([a-z0-9.+/-]*);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(raw);
 if(!match||!match[2]||match[2].length%4!==0)
  fail('JOURNAL_VIDEO_DATA_URL_INVALID');
 const data='data:'+type.toLowerCase()+';base64,'+match[2];
 const evidence=await deps.hashVideoDataUrlHex(data);
 if(evidence?.sha256!==sourceSha256||evidence?.bytes!==file.size)
  fail('JOURNAL_VIDEO_EVIDENCE_MISMATCH');
 return {kind:'video',name:String(file.name||'Видео осмотра.mp4').slice(0,120),
  type:type.toLowerCase(),videoId,sourceSha256,sourceBytes:file.size,
  sourceEvidenceVersion:1,data};
}
root.PasekaJournalVideoSource=Object.freeze({prepareVideo});
})(typeof window!=='undefined'?window:globalThis);
