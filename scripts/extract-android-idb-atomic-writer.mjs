// Build-only source extraction: package the actual production writer function
// into a separate synthetic diagnostic app without shipping the main app.
export function extractAtomicWriterForDiagnostic(html) {
  if(typeof html!=='string')throw Error('P1_WRITER_SOURCE_INVALID');
  const marker='function writeMainWithBackup(';
  const begin=html.indexOf(marker);
  const end=html.indexOf('function writeAutoBackup(',begin);
  if(begin<0||end<=begin||html.indexOf(marker,begin+marker.length)!==-1)
    throw Error('P1_WRITER_SOURCE_ANCHOR_INVALID');
  const writer=html.slice(begin,end).trim();
  for(const required of [
    "db.transaction([STORE,BACKUP_STORE],'readwrite')",
    "mainStore.put(state,'state')",
    "backupStore.put({at:new Date().toISOString(),state:previous},'previous')",
    'assertBackupNotFromNewerSchema(previousBackup)',
    'tx.abort()',
    'expectedRevision',
    'tx.onabort'
  ])if(!writer.includes(required))throw Error('P1_WRITER_CONTRACT_CHANGED');
  if(writer.length<1200||writer.length>6500)throw Error('P1_WRITER_SIZE_UNEXPECTED');
  return `// Test-only generated copy of the production writeMainWithBackup from index.html.
// The diagnostic binds it solely to its own namespaced, synthetic IndexedDB.
(function(root) {
'use strict';
root.PasekaDiagnosticAtomicWriter=Object.freeze({
  create:function({db,STORE,BACKUP_STORE,assertBackupNotFromNewerSchema}) {
${writer}
    return writeMainWithBackup;
  }
});
})(typeof window!=='undefined'?window:globalThis);
`;
}
