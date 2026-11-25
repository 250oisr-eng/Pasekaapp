// One-click B01 local-only source selection and recovery report.
// Only source files created by the full IndexedDB export UI are eligible.
// Never copy, rename, alter, upload or disclose source data or filenames.
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proveExportedArchiveRecoveryFile } from './prove-exported-archive-recovery.mjs';

export const EXPORT_PATTERN = /^paseka-full-idb-\d{4}-\d{2}-\d{2}(?:\s*\(\d+\))?\.json$/i;
export const REPORT_FILENAME = 'B01-FULL-ARCHIVE-RESULT.json';

export async function findFullExport({root,downloads,desktop,explicitPath} = {}) {
  const folders = explicitPath ? [] : [root,downloads,desktop].filter(Boolean);
  const matches = [];
  if (explicitPath) {
    if (!EXPORT_PATTERN.test(basename(explicitPath)))
      throw new Error('B01_BLOCKED_NOT_FULL_INDEXEDDB_EXPORT_NAME');
    matches.push(resolve(explicitPath));
  } else {
    for (const folder of [...new Set(folders.map(x=>resolve(x)))]) {
      let names;
      try { names = await fs.readdir(folder); }
      catch (error) { if (error.code === 'ENOENT') continue; throw Error('B01_BLOCKED_SOURCE_DIRECTORY_UNREADABLE'); }
      for (const name of names) {
        if (EXPORT_PATTERN.test(name)) matches.push(join(folder,name));
      }
    }
  }
  if (matches.length===0) throw Error('B01_BLOCKED_FULL_EXPORT_NOT_FOUND');
  if (matches.length!==1) throw Error('B01_BLOCKED_MULTIPLE_FULL_EXPORTS');
  const file=matches[0],stat=await fs.lstat(file);
  if (!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>64*1024*1024)
    throw Error('B01_BLOCKED_UNSAFE_OR_OVERSIZE_FULL_EXPORT');
  return file;
}

export function safeError(error) {
  const message=String(error?.message||'');
  return /^B01_BLOCKED_[A-Z0-9_]{3,90}$/.test(message) ?
    message : 'B01_BLOCKED_ARCHIVE_RECOVERY_FAILED_REDACTED';
}

export async function runOneClick({bundleRoot,downloads,desktop,explicitPath}={}) {
  if (!bundleRoot) throw Error('B01_BLOCKED_BUNDLE_ROOT_REQUIRED');
  const report=join(resolve(bundleRoot),REPORT_FILENAME);
  // Preserve every existing result, even if invalid. No automatic overwrite.
  try { await fs.lstat(report); throw Error('B01_BLOCKED_PREVIOUS_REPORT_PRESERVED'); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  let output;
  try {
    const source=await findFullExport({
      root:bundleRoot,downloads,desktop,explicitPath
    });
    const proof=await proveExportedArchiveRecoveryFile(source);
    output={
      ...proof,
      code:'EXTERNAL_EXPORTED_FILE_EPHEMERAL_REOPEN_PASS',
      sourceFileReadOnly:true,
      reportNoPrivateValues:true,
      userArchiveUploaded:false
    };
  } catch(error) {
    output={
      schema:'paseka-b01-ephemeral-export-recovery-v1',
      status:'BLOCKED',code:safeError(error),
      sourceFileReadOnly:true,reportNoPrivateValues:true,
      userArchiveUploaded:false,fullBackupVerified:false,
      realAndroidRestore:'NOT_TESTED',galleryMediaStore:'NOT_TESTED',
      externalOriginalVideos:'NOT_TESTED',phoneAccess:'NOT_ATTEMPTED',
      videoCleanup:'NOT_ATTEMPTED'
    };
  }
  // Saving only a sanitized report into the bundle folder, never into original file.
  await fs.writeFile(report,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  return {output,report};
}

const script=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(script){
  const bundleRoot=resolve(fileURLToPath(new URL('..',import.meta.url)));
  const home=homedir();
  runOneClick({
    bundleRoot,downloads:join(home,'Downloads'),desktop:join(home,'Desktop')
  }).then(({output})=>{
    console.log('B01 '+output.status+' '+output.code);
    console.log('Sanitized report: '+REPORT_FILENAME);
    console.log('Do not send your original archive; do not delete any original videos.');
    if(output.status==='BLOCKED')process.exitCode=2;
  }).catch(()=>{
    console.log('B01_BLOCKED_REPORT_NOT_WRITTEN');
    process.exitCode=3;
  });
}
