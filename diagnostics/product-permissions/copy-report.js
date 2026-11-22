(function(root){'use strict';
const PKG='ru.paseka.journal.diagnostic.productpermsv1';
function check(text){
 if(typeof text!=='string'||!text||text.length>32768)throw Error('COPY_SIZE_INVALID');
 let data;try{data=JSON.parse(text)}catch(_){throw Error('COPY_JSON_INVALID')}
 if(!data||!['PASS','BLOCKED'].includes(data.status)||data.packageId!==PKG||
 data.cleanupAuthorized!==false||data.restoreAuthorized!==false||data.archiveSafe!==false)
  throw Error('COPY_REPORT_INVALID');
 return text;
}
async function write(text,clipboard){
 const string=check(text);
 if(!clipboard||typeof clipboard.write!=='function')throw Error('CLIPBOARD_UNAVAILABLE');
 await clipboard.write({string});
 return {copied:true,pasted:false};
}
root.PasekaDiagnosticCopy=Object.freeze({check,write});
})(typeof window!=='undefined'?window:globalThis);