import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function requireAndroid15(source){
 let updated=String(source);
 for(const name of ['minSdkVersion','compileSdkVersion','targetSdkVersion']){
  const pattern=new RegExp('(^\\s*'+name+'\\s*=\\s*)\\d+','m');
  if(!pattern.test(updated))throw new Error('BLOCKED: Android version declaration missing: '+name);
  updated=updated.replace(pattern,(_,prefix)=>prefix+'35');
 }
 return updated;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const file='android/variables.gradle';
 const before=readFileSync(file,'utf8'),after=requireAndroid15(before);
 writeFileSync(file,after,'utf8');
 console.log('ANDROID_15_QA_PROOF_API_GUARD PASS');
}
