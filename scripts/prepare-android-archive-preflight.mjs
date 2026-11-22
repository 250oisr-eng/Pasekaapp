import { rm, mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';

const configFile='capacitor.config.json';
const config=JSON.parse(await readFile(configFile,'utf8'));
if(config.appId!=='ru.paseka.journal') throw Error('Unexpected production appId; refusing to build diagnostic');
config.appId='ru.paseka.journal.diagnostic.archivepreflight';
config.appName='Пасека архив — проверка';
await writeFile(configFile,JSON.stringify(config,null,2)+'\n');
await rm('www',{recursive:true,force:true});
await mkdir('www',{recursive:true});
await copyFile('js/android-archive-preflight.js','www/preflight-guard.js');
await copyFile('diagnostics/archive-preflight/index.html','www/index.html');
await copyFile('diagnostics/archive-preflight/runner.js','www/runner.js');
await copyFile('diagnostics/archive-preflight/copy-report.js','www/copy-report.js');
console.log('Created isolated synthetic archive preflight web application; no production pages copied.');
