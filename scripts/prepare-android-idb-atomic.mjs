import {readFile,writeFile,mkdir,rm,copyFile} from 'node:fs/promises';
if(process.env.PASEKA_IDB_ATOMIC_BUILD!=='1')throw Error('TEST_BUILD_NOT_AUTHORIZED');
const confFile='capacitor.config.json';
const config=JSON.parse(await readFile(confFile,'utf8'));
if(config.appId!=='ru.paseka.journal')throw Error('PRODUCTION_ID_GUARD');
config.appId='ru.paseka.journal.diagnostic.idbatomicv1';
config.appName='Пасека — проверка записи';
await writeFile(confFile,JSON.stringify(config,null,2)+'\n');
await rm('www',{recursive:true,force:true});
await mkdir('www',{recursive:true});
for(const name of ['index.html','proof.js','runner.js'])
 await copyFile('diagnostics/idb-atomic/'+name,'www/'+name);
console.log('ISOLATED_IDB_ATOMIC_V1',config.appId,'3 WEB FILES');
