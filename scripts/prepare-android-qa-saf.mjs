import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeQaConfig} from './prepare-android-qa-config.mjs';

export const ARCHIVE_QA_ID='ru.paseka.journal.qa.archive';
export const ARCHIVE_QA_LABEL='Пасека QA — архив';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

export function archiveQaConfig(original){
 const checked=makeQaConfig(original);
 return {...checked,appId:ARCHIVE_QA_ID,appName:ARCHIVE_QA_LABEL};
}
export function archiveQaMarkup(html){
 const original="const blob=new Blob([raw],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');\n  a.href=url;a.download='paseka-full-idb-'+today()+'.json';document.body.appendChild(a);a.click();a.remove();\n  setTimeout(()=>URL.revokeObjectURL(url),60000);\n  if(status)status.textContent='Файл подготовлен; SHA-256: '+proof.sha256+'. Фактическое сохранение, внешняя копия и восстановление НЕ подтверждены.';";
 const newCode="const saved=await window.PasekaSafExport.saveArchive(raw,'paseka-full-idb-'+today()+'.json');\n  if(status)status.textContent='Android подтвердил запись файла и повторное чтение (SHA-256 файла: '+saved.sha256+', байт: '+saved.byteLength+'). SHA-256 данных: '+proof.sha256+'. Внешняя копия и независимое восстановление НЕ подтверждены.';";
 if(!html.includes(original)||html.split(original).length!==2)
  throw Error('QA_SAF_BLOCKED: unexpected original export; refuse patch');
 if(!html.includes('</body>')||html.includes('qa-saf-export.js'))
  throw Error('QA_SAF_BLOCKED: unexpected generated document');
 return html.replace(original,newCode).replace('</body>','<script src="./qa-saf-export.js"></script>\n</body>');
}
export function archiveQaActivity(java){
 if(!/^package ru\.paseka\.journal\.qa\.archive;/m.test(java))
  throw Error('QA_SAF_BLOCKED: unexpected generated activity package');
 const anchor='public class MainActivity extends BridgeActivity {}';
 if(!java.includes(anchor)||java.split(anchor).length!==2)
  throw Error('QA_SAF_BLOCKED: unexpected MainActivity shape; do not guess');
 return java.replace(anchor,`public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle state) {
        registerPlugin(PasekaSafExportPlugin.class);
        super.onCreate(state);
    }
}`);
}
async function run(){
 const configFile=join(root,'capacitor.config.json');
 const config=JSON.parse(await readFile(configFile,'utf8'));
 if(process.argv[2]==='config'){
  await writeFile(configFile,JSON.stringify(archiveQaConfig(config),null,2)+'\n');
  console.log('QA_SAF_CONFIGURED '+ARCHIVE_QA_ID);return;
 }
 if(process.argv[2]==='web'){
  if(config.appId!==ARCHIVE_QA_ID)throw Error('QA_SAF_BLOCKED: wrong package for web overlay');
  const htmlFile=join(root,'www/index.html');
  await writeFile(htmlFile,archiveQaMarkup(await readFile(htmlFile,'utf8')));
  await copyFile(join(root,'qa/native/qa-saf-export.js'),join(root,'www/qa-saf-export.js'));
  console.log('QA_SAF_WEB_OVERLAY_VERIFIED');return;
 }
 if(process.argv[2]==='android'){
  if(config.appId!==ARCHIVE_QA_ID)throw Error('QA_SAF_BLOCKED: wrong package for native overlay');
  const activity=join(root,'android/app/src/main/java/ru/paseka/journal/qa/archive/MainActivity.java');
  const output=archiveQaActivity(await readFile(activity,'utf8'));
  await writeFile(activity,output);
  await copyFile(join(root,'qa/native/PasekaSafExportPlugin.java'),join(dirname(activity),'PasekaSafExportPlugin.java'));
  console.log('QA_SAF_NATIVE_PLUGIN_REGISTERED');return;
 }
 throw Error('QA_SAF_BLOCKED: expected config, web, or android');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 run().catch(error=>{console.error(error.message);process.exitCode=1;});
