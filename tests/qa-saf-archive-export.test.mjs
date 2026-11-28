import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {archiveQaConfig,archiveQaMarkup,archiveQaActivity,ARCHIVE_QA_ID} from '../scripts/prepare-android-qa-saf.mjs';

const original=await readFile(new URL('../index.html',import.meta.url),'utf8');
const client=await readFile(new URL('../qa/native/qa-saf-export.js',import.meta.url),'utf8');
const native=await readFile(new URL('../qa/native/PasekaSafExportPlugin.java',import.meta.url),'utf8');
function makeClient(bridge){
 const window={Capacitor:{isNativePlatform:()=>true,registerPlugin:()=>bridge},crypto:webcrypto};
 new Function('window','TextEncoder','btoa',client)(window,TextEncoder,btoa);
 return window.PasekaSafExport;
}
test('QA archive variant uses independent identity and rejects unsafe production server config',()=>{
 const qa=archiveQaConfig({appId:'ru.paseka.journal',webDir:'www',android:{allowMixedContent:false}});
 assert.equal(qa.appId,ARCHIVE_QA_ID);
 assert.equal(qa.appName,'Пасека QA — архив');
 assert.throws(()=>archiveQaConfig({appId:'ru.paseka.journal',webDir:'www',server:{url:'https://remote.test'},android:{allowMixedContent:false}}),/QA_BLOCKED/);
});
test('overlay is generated-only and refuses mismatch; existing main export untouched',()=>{
 const output=archiveQaMarkup(original);
 assert.match(output,/await window\.PasekaSafExport\.saveArchive\(raw,'paseka-full-idb-'/);
 assert.match(output,/Android подтвердил запись файла и повторное чтение/);
 assert.match(output,/<script src="\.\/qa-saf-export\.js"><\/script>/);
 assert.doesNotMatch(output,/const blob=new Blob\(\[raw\]/);
 assert.match(original,/const blob=new Blob\(\[raw\]/);
 assert.throws(()=>archiveQaMarkup(output),/QA_SAF_BLOCKED/);
});
test('native plugin registration patches only expected isolated QA activity',()=>{
 const src='package ru.paseka.journal.qa.archive;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {}';
 const output=archiveQaActivity(src);
 assert.match(output,/registerPlugin\(PasekaSafExportPlugin\.class\);/);
 assert.throws(()=>archiveQaActivity(output),/QA_SAF_BLOCKED/);
 assert.throws(()=>archiveQaActivity(src.replace('ru.paseka.journal.qa.archive','ru.paseka.journal')),/QA_SAF_BLOCKED/);
});
test('native handler uses Android document picker, readback hash, and no DB or delete routes',()=>{
 for(const marker of ['ACTION_CREATE_DOCUMENT','CATEGORY_OPENABLE','openOutputStream','openInputStream','SHA-256','getCacheDir','QA_SAF_CANCELLED','readback.digest()']) assert.ok(native.includes(marker),marker);
 assert.doesNotMatch(native,/getDatabasePath\(|deleteDatabase\(|contentResolver\.delete\(|getExternalStorageDirectory/);
});
test('client streams chunks, verifies full file SHA/size, and never claims cancelled save',async()=>{
 const state={chunks:[],started:null,aborts:0};
 const bridge={
  async begin(input){state.started=input;},
  async append({chunk}){state.chunks.push(Buffer.from(chunk,'base64'));},
  async finish(){return {fileName:state.started.name,byteLength:state.started.byteLength,sha256:state.started.sha256};},
  async abort(){state.aborts++;}
 };
 const client=makeClient(bridge);
 const raw=JSON.stringify({manifest:{format:'paseka-idb-full-v1'},payload:{note:'синтетический архив'}});
 const result=await client.saveArchive(raw,'paseka-full-idb-2026-11-27.json');
 assert.equal(result.readbackVerified,true);
 assert.equal(Buffer.concat(state.chunks).toString('utf8'),raw);
 assert.equal(result.byteLength,Buffer.byteLength(raw));
 assert.equal(result.sha256,state.started.sha256);
});
test('client rejects mismatch/cancel and does not report success',async()=>{
 let aborted=0;
 const bridge={async begin(){},async append(){},async finish(){return {sha256:'bad',byteLength:10,fileName:'bad'}},async abort(){aborted++}};
 const client=makeClient(bridge);
 await assert.rejects(client.saveArchive('{"ok":true}','paseka-full-idb-2026-11-27.json'),/QA_SAF_BLOCKED/);
 assert.equal(aborted,1);
});
