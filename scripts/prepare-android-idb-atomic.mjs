import {readFile,writeFile,mkdir,rm,copyFile} from 'node:fs/promises';
import {extractAtomicWriterForDiagnostic} from './extract-android-idb-atomic-writer.mjs';
if(process.env.PASEKA_IDB_ATOMIC_TEST_BUILD!=='1')
  throw Error('P1_IDB_TEST_BUILD_NOT_AUTHORIZED');
const configPath='capacitor.config.json';
const config=JSON.parse(await readFile(configPath,'utf8'));
if(config.appId!=='ru.paseka.journal')throw Error('P1_PRODUCTION_APP_ID_GUARD');
config.appId='ru.paseka.journal.diagnostic.idbatomicv1';
config.appName='Пасека — атомарность БД (тест)';
await writeFile(configPath,JSON.stringify(config,null,2)+'\n');
const output='www';
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const file of ['index.html','runner.js'])
  await copyFile('diagnostics/phone-idb-atomic/'+file,output+'/'+file);
const source=await readFile('index.html','utf8');
await writeFile(output+'/writer.js',extractAtomicWriterForDiagnostic(source));
console.log('P1_SYNTHETIC_ANDROID_IDB_ATOMIC_ONLY',config.appId,'ASSETS',3);
