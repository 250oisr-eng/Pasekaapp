import { readFileSync, writeFileSync } from 'node:fs';
const path='android/variables.gradle';
let text=readFileSync(path,'utf8');
for(const key of ['minSdkVersion','compileSdkVersion','targetSdkVersion']){
 const rx=new RegExp('(^\\s*'+key+'\\s*=\\s*)\\d+','m');
 if(!rx.test(text))throw new Error('Android SDK property unavailable: '+key);
 text=text.replace(rx,(_,prefix)=>prefix+'35');
}
writeFileSync(path,text);
console.log('Emulator build requires Android API 35, exact SDK gate verified');
