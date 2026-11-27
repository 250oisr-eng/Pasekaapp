import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {QA_ID,voiceQaConfig,patchVoiceActivity,patchVoiceManifest,patchVoiceGradle,patchVoiceHtml} from '../scripts/prepare-android-voice-qa.mjs';
import {patchActivity,patchManifest,assertDailyConfig} from '../scripts/prepare-android-daily-archives.mjs';
const config={appId:'ru.paseka.journal',webDir:'www',android:{allowMixedContent:false}};
test('voice QA is isolated and retains daily scheduler package/origin contract',()=>{
 const qa=voiceQaConfig(config);
 assert.equal(qa.appId,QA_ID);assert.equal(config.appId,'ru.paseka.journal');assert.equal(assertDailyConfig(qa),QA_ID);
 assert.throws(()=>voiceQaConfig({...config,server:{url:'https://remote.test'}}),/BLOCKED/);
 assert.throws(()=>voiceQaConfig(qa),/BLOCKED/);
});
test('voice registration runs before Capacitor super and retains daily scheduler after',()=>{
 const source='package '+QA_ID+';\npublic class MainActivity extends BridgeActivity {}';
 assert.throws(()=>patchVoiceActivity(source),/daily scheduler/);
 const daily=patchActivity(source,QA_ID),voice=patchVoiceActivity(daily);
 assert.equal(voice,patchVoiceActivity(voice));assert.match(voice,/registerPlugin\(PasekaVoiceQaPlugin.class\);\s+super.onCreate\(state\);\s+PasekaDailyArchiveJob.schedule\(this\);/);
 assert.throws(()=>patchVoiceActivity(daily.replace(QA_ID,'ru.paseka.journal')),/BLOCKED/);
});
test('manifest patch preserves scheduler permission and requires mic only in isolated generation',()=>{
 const daily=patchManifest('<manifest><application></application></manifest>');
 const voice=patchVoiceManifest(daily);
 assert.equal(voice,patchVoiceManifest(voice));assert.match(voice,/android.permission.RECORD_AUDIO/);
 assert.match(voice,/android.permission.BIND_JOB_SERVICE/);assert.match(voice,/android.permission.RECEIVE_BOOT_COMPLETED/);
 assert.throws(()=>patchVoiceManifest('<manifest></manifest>'),/BLOCKED/);
});
test('Gradle dependencies are pinned and generated production ID is rejected',()=>{
 const gradle='android { defaultConfig { applicationId "'+QA_ID+'" } }\ndependencies {}';
 const voice=patchVoiceGradle(gradle);
 assert.equal(voice,patchVoiceGradle(voice));assert.match(voice,/vosk-android:0.3.75@aar/);assert.match(voice,/jna:5.18.1@aar/);
 assert.throws(()=>patchVoiceGradle(gradle.replace(QA_ID,'ru.paseka.journal')),/BLOCKED/);
});
test('QA panel sits outside AI sign-in and only generated HTML is changed',async()=>{
 const source=await readFile(new URL('../index.html',import.meta.url),'utf8'),voice=patchVoiceHtml(source);
 assert.doesNotMatch(source,/id="qaVoicePanel"/);
 assert.ok(voice.indexOf('id="qaVoicePanel"')<voice.indexOf('id="aiSignedOut"'));
 assert.ok(voice.indexOf('voice-qa.js')>voice.indexOf('id="aiSignedIn"'));
 assert.throws(()=>patchVoiceHtml(voice),/duplicate/);
});
test('recognized text appends to existing draft without overwrite and rejects excessive text',async()=>{
 const source=await readFile(new URL('../android-native/voice-qa.js',import.meta.url),'utf8');
 const window={};vm.runInNewContext(source,{window,document:{getElementById:()=>null}});
 const append=window.PasekaVoiceQa.appendDraft;
 assert.equal(append('старая запись',' новая '),'старая запись\nновая');
 assert.equal(append('','наблюдение'),'наблюдение');assert.equal(append('keep',' '),null);
 assert.equal(append('a'.repeat(12000),'b'),null);
});
test('native QA source pins model identity and guards microphone lifecycle',async()=>{
 const java=await readFile(new URL('../android-native/PasekaVoiceQaPlugin.java',import.meta.url),'utf8');
 for(const token of ['961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4','ARCHIVE_BYTES=46236750L','EXPANDED_BYTES=91289240L','files!=14','graph/HCLr.fst','graph/Gr.fst','epoch.incrementAndGet()','current!=session','handleOnPause()','handleOnDestroy()','permissionCall!=call','destination().exists()','session.service.cancel()'])assert.ok(java.includes(token),token);
 assert.doesNotMatch(java,/HttpURLConnection|openConnection\(|https?:\/\/|deleteDatabase|clearCache/);
});


async function uiHarness(){
 const source=await readFile(new URL('../android-native/voice-qa.js',import.meta.url),'utf8');
 const ids=['qaVoicePanel','qaVoiceText','qaVoiceStatus','qaVoiceStart','qaVoiceStop','qaVoiceInstall','qaVoiceToDraft','aiJournalDraftInput'];
 const elements=Object.fromEntries(ids.map(id=>[id,{value:'',disabled:false,focus(){}}]));
 const events={},stops=[],starts=[];
 const api={addListener:async(n,fn)=>{events[n]=fn;return{}},getStatus:async()=>({modelInstalled:true}),
   start:async({token})=>{starts.push(token);return {started:true,token}},
   stop:()=>new Promise((resolve,reject)=>stops.push({resolve,reject}))};
 const window={Capacitor:{Plugins:{PasekaOfflineSpeech:api}},addEventListener(){}};
 const document={getElementById:id=>elements[id],addEventListener(){}};
 vm.runInNewContext(source,{window,document});
 await new Promise(resolve=>setImmediate(resolve));
 return {elements,events,stops,starts};
}
test('QA UI ignores stale callbacks and prevents restart/transfer until native stop resolves',async()=>{
 const {elements:e,events,stops,starts}=await uiHarness();
 await e.qaVoiceStart.onclick();const token=starts[0];
 events.result({token:'old',text:'неверно'});assert.equal(e.qaVoiceText.value,'');
 events.result({token,text:'наблюдение'});assert.equal(e.qaVoiceText.value,'наблюдение');
 e.qaVoiceStop.onclick();assert.equal(e.qaVoiceStart.disabled,true);assert.equal(e.qaVoiceToDraft.disabled,true);
 events.result({token,text:'поздняя команда'});assert.equal(e.qaVoiceText.value,'наблюдение');
 await e.qaVoiceStart.onclick();assert.equal(starts.length,1);
 e.qaVoiceToDraft.onclick();assert.equal(e.aiJournalDraftInput.value,'');
 stops[0].resolve();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(e.qaVoiceStart.disabled,false);
 e.aiJournalDraftInput.value='ручной текст  ';e.qaVoiceToDraft.onclick();
 assert.equal(e.aiJournalDraftInput.value,'ручной текст  \nнаблюдение');assert.equal(e.qaVoiceText.value,'');
 e.qaVoiceToDraft.onclick();assert.equal(e.aiJournalDraftInput.value,'ручной текст  \nнаблюдение');
});
test('failed native stop keeps start and journal transfer blocked until retry succeeds',async()=>{
 const {elements:e,stops}=await uiHarness();await e.qaVoiceStart.onclick();e.qaVoiceStop.onclick();
 stops[0].reject(Error('synthetic stop failure'));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(e.qaVoiceStart.disabled,true);assert.equal(e.qaVoiceToDraft.disabled,true);assert.equal(e.qaVoiceStop.disabled,false);
 e.qaVoiceStop.onclick();stops[1].resolve();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(e.qaVoiceStart.disabled,false);assert.equal(e.qaVoiceToDraft.disabled,false);
});
