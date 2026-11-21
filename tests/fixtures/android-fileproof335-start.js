// Test-only WebView bootstrap. Not included in production www.
(function(root){
'use strict';
async function start(){
  const element=root.document?.getElementById('result');
  const write=value=>{
    const line=JSON.stringify(value);
    if(element)element.textContent=line;
    root.console?.info?.('PASEKA_RESTORE335 '+line);
    try{root.PasekaRestore335Report?.report(line);}catch(_){}
  };
  try {
    const bridge=root.PasekaRestore335Input;
    if(!bridge || typeof bridge.readPinnedArchiveBase64!=='function'){
      throw new Error('ISOLATED_NATIVE_INPUT_REQUIRED');
    }
    const answer=String(bridge.readPinnedArchiveBase64());
    if(!answer.startsWith('PASS:'))throw new Error(answer.startsWith('BLOCKED:')?answer:'NATIVE_INPUT_REJECTED');
    const raw=answer.slice(5);
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw new Error('INVALID_PRIVATE_INPUT_BASE64');
    const bytes=Uint8Array.from(root.atob(raw),c=>c.charCodeAt(0));
    if(bytes.byteLength!==3158)throw new Error('INVALID_PRIVATE_INPUT_LENGTH');
    const result=await root.PasekaIsolatedRestore335.run(bytes);
    // The result itself is also duplicated to a PRIVATE test-only report.
    write({status:'PASS',phase:'ISOLATED_RESTORE335_SHA_PASS',packageId:'ru.paseka.journal.archive.restoreproof335',
      archiveSha256:result.archiveSha256,videoCount:result.videoCount,
      sourcePreserved:true,mp4Decoder:'NOT_TESTED',recognitionSucceeded:false,cleanupAuthorized:false});
  }catch(err){
    write({status:'BLOCKED',phase:'ISOLATED_RESTORE335',
      code:String(err?.code||err?.message||'UNSPECIFIED'),
      recognitionSucceeded:false,cleanupAuthorized:false});
  }
}
if(root.document&&root.addEventListener)root.addEventListener('DOMContentLoaded',start);
root.PasekaRestore335Start=Object.freeze({start});
})(typeof window!=='undefined'?window:globalThis);
