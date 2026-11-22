(function(root){'use strict';
const PACKAGE='ru.paseka.journal.diagnostic.archivea08v1';
function checkedReport(value){
 if(typeof value!=='string'||value.length===0||value.length>32768)throw Error('COPY_SIZE_INVALID');
 let v;try{v=JSON.parse(value)}catch(_){throw Error('COPY_JSON_INVALID')}
 if(!v||!['PASS','BLOCKED'].includes(v.status)||v.packageId!==PACKAGE||v.cleanupAuthorized!==false||v.restoreAuthorized!==false||v.archiveSafe!==false)throw Error('COPY_SAFETY_INVALID');
 return value;
}
async function copyReport(value,clipboard){
 const string=checkedReport(value);
 if(!clipboard||typeof clipboard.write!=='function')throw Error('NATIVE_CLIPBOARD_UNAVAILABLE');
 await clipboard.write({string});
 return {copied:true,pasted:false};
}
root.PasekaDiagnosticCopy=Object.freeze({checkedReport,copyReport});
})(typeof window!=='undefined'?window:globalThis);
