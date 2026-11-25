// B01 isolated probe builder. Never writes to the repository's app source,
// Android live device, or a pre-existing output folder.
import { promises as fs } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

export const ISOLATED_APP_ID = 'ru.paseka.journal.diagnostic.restore';
export const LIVE_APP_ID = 'ru.paseka.journal';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function generateIsolatedProbe(target) {
  if(typeof target!=='string' || !target.trim()) throw new Error('EXPLICIT_EMPTY_OUTPUT_REQUIRED');
  const dst=resolve(target);
  // No in-repo or ancestor write, including symlinks.
  const root = await fs.realpath(ROOT);
  const existingAncestor = async path => {
    let p=path;
    while(true) {
      try { return {p,real:await fs.realpath(p)}; }
      catch(e) { if(e.code!=='ENOENT') throw e; const parent=dirname(p);if(parent===p)throw e;p=parent; }
    }
  };
  const ancestor=await existingAncestor(dst);
  if(dst===root || root.startsWith(dst+sep) || dst.startsWith(root+sep) ||
     ancestor.real===root || ancestor.real.startsWith(root+sep)) {
    throw new Error('REPOSITORY_OR_SOURCE_TREE_IS_NOT_A_DESTINATION');
  }
  try { await fs.lstat(dst); throw new Error('DESTINATION_ALREADY_EXISTS'); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  // A pre-existing final path is never overwritten.
  await fs.mkdir(dst,{recursive:false});
  await fs.mkdir(join(dst,'www'));
  await fs.writeFile(join(dst,'package.json'),JSON.stringify({
    name:'paseka-b01-isolated-diagnostic',version:'0.0.1',private:true,
    scripts:{},
    dependencies:{'@capacitor/android':'6.2.1','@capacitor/core':'6.2.1'},
    devDependencies:{'@capacitor/cli':'6.2.1'}
  },null,2)+'\n',{flag:'wx'});
  await fs.writeFile(join(dst,'capacitor.config.json'),JSON.stringify({
    appId:ISOLATED_APP_ID,appName:'Paseka B01 Isolated Diagnostic',
    webDir:'www',bundledWebRuntime:false,
    android:{allowMixedContent:false}
  },null,2)+'\n',{flag:'wx'});
  await fs.copyFile(join(ROOT,'tools/b01-isolated-diagnostic/index.html'),join(dst,'www/index.html'));
  await fs.copyFile(join(ROOT,'tools/b01-isolated-diagnostic/probe.js'),join(dst,'www/probe.js'));
  const config=JSON.parse(await fs.readFile(join(dst,'capacitor.config.json'),'utf8'));
  const html=await fs.readFile(join(dst,'www/index.html'),'utf8');
  if(config.appId!==ISOLATED_APP_ID || config.appId===LIVE_APP_ID ||
     !html.includes('probe.js') || html.includes('js/app.js')) {
    throw new Error('ISOLATED_PROBE_CONFIG_VALIDATION_FAILED');
  }
  return {output:dst,packageId:config.appId};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  generateIsolatedProbe(process.argv[2]).then(v=>{
    console.log('ISOLATED_DIAGNOSTIC_SOURCE_READY '+v.packageId);
    console.log('Generated source only; NOT an installed or tested Android restore');
  }).catch(e=>{console.error('BLOCKED '+e.message);process.exitCode=1;});
}
