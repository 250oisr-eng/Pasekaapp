(function(root) {
'use strict';
// Isolated diagnostic: explicit clipboard write only after a user press.
// Never uploads data, reads user media, modifies archives or authorizes cleanup.
const PACKAGE='ru.paseka.journal.diagnostic.archivepreflight';
function checkedReport(value) {
 if(typeof value!=='string' || value.length===0 || value.length>32768)
  throw Error('COPY_REPORT_SIZE_INVALID');
 let parsed;
 try { parsed=JSON.parse(value); }
 catch (_) { throw Error('COPY_REPORT_JSON_INVALID'); }
 if(!parsed || typeof parsed!=='object' ||
    !['PASS','BLOCKED'].includes(parsed.status) || parsed.packageId!==PACKAGE ||
    parsed.cleanupAuthorized!==false || parsed.restoreAuthorized!==false ||
    parsed.archiveSafe!==false) throw Error('COPY_REPORT_SAFETY_INVALID');
 return value;
}
async function copyReport(value, clipboard) {
 const text=checkedReport(value);
 if(!clipboard || typeof clipboard.write!=='function')
   throw Error('NATIVE_CLIPBOARD_UNAVAILABLE');
 await clipboard.write({string:text});
 // API resolution proves write was reported successful, not that paste was performed.
 return {copied:true,pasted:false};
}
root.PasekaDiagnosticCopy=Object.freeze({checkedReport,copyReport});
})(typeof window!=='undefined'?window:globalThis);
