import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const EXPECTED_BASE='ru.paseka.journal';
const ISOLATED_ID='ru.paseka.journal.firstuseqa';
const EXPECTED_REF='refs/heads/fix/p0-first-launch-startup-write-gate-2026-11-24';

export function prepareIsolatedConfig(configuration,environment=process.env){
 if(environment.PASEKA_ISOLATED_FIRST_USE!=='YES' || environment.GITHUB_REF!==EXPECTED_REF){
  throw new Error('ISOLATED_BUILD_GUARD: dedicated first-use branch and explicit CI flag required');
 }
 if(configuration?.appId!==EXPECTED_BASE || configuration?.webDir!=='www'){
  throw new Error('ISOLATED_BUILD_GUARD: unexpected original Capacitor identity');
 }
 return {...configuration,appId:ISOLATED_ID,appName:'Пасека · тест первого запуска'};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const file='capacitor.config.json';
 const original=JSON.parse(await readFile(file,'utf8'));
 const isolated=prepareIsolatedConfig(original);
 await writeFile(file,JSON.stringify(isolated,null,2)+'\n');
 console.log('ISOLATED_FIRST_USE_CONFIG_OK appId='+isolated.appId);
}
