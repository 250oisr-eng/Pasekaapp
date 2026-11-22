(function(root) {
'use strict';
// Android's explicit system share sheet only. Never sends a report on its own.
const PACKAGE='ru.paseka.journal.diagnostic.archivepreflight';
function checkedReport(value) {
 if(typeof value!=='string' || value.length>32768) throw Error('SHARE_REPORT_SIZE_INVALID');
 let parsed;
 try { parsed=JSON.parse(value); } catch(_) { throw Error('SHARE_REPORT_JSON_INVALID'); }
 if(!parsed || !['PASS','BLOCKED'].includes(parsed.status) ||
    parsed.packageId!==PACKAGE || parsed.cleanupAuthorized!==false ||
    parsed.restoreAuthorized!==false || parsed.archiveSafe!==false)
   throw Error('SHARE_REPORT_SAFETY_INVALID');
 return value;
}
async function shareReport(value,share) {
 const text=checkedReport(value);
 if(!share || typeof share.share!=='function')throw Error('NATIVE_SHARE_UNAVAILABLE');
 // This only displays the chooser. A delivery/receipt is NOT established by resolve.
 await share.share({title:'Пасека: результат диагностики архива',
  text,dialogTitle:'Выберите приложение для отправки отчёта'});
 return {chooserInvoked:true,deliveryConfirmed:false};
}
root.PasekaDiagnosticShare=Object.freeze({checkedReport,shareReport});
})(typeof window!=='undefined'?window:globalThis);
