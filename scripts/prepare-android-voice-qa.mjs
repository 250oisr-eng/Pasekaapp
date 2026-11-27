import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareDailyWorkerAndroid} from './prepare-android-daily-archives.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const QA_ID='ru.paseka.journal.qa.voice2';
const PIN='961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4',MODEL='vosk-model-small-ru-0.22.zip';
const DAILY='        PasekaDailyArchiveJob.schedule(this);';
const SUPER='        super.onCreate(state);';
const REG='        registerPlugin(PasekaVoiceQaPlugin.class);';
export function voiceQaConfig(config){
 if(config?.appId!=='ru.paseka.journal'||config.webDir!=='www'||config.android?.allowMixedContent!==false||
   config.server?.url||config.server?.allowNavigation||(config.server?.hostname||'localhost')!=='localhost'||
   (config.server?.androidScheme||'https')!=='https')throw Error('VOICE_QA_BLOCKED: source package or origin');
 return {...config,appId:QA_ID,appName:'Пасека QA — разговор'};
}
export function patchVoiceActivity(source){
 if(!source.startsWith('package '+QA_ID+';')||source.split(DAILY).length!==2||source.split(SUPER).length!==2)
  throw Error('VOICE_QA_BLOCKED: daily scheduler or package missing');
 if(source.includes(REG)){
  if(source.split(REG).length!==2||!source.includes(REG+'\n'+SUPER))throw Error('VOICE_QA_BLOCKED: invalid registration');
  return source;
 }
 if(source.includes('PasekaVoiceQaPlugin'))throw Error('VOICE_QA_BLOCKED: unknown registration');
 return source.replace(SUPER,REG+'\n'+SUPER);
}
export function patchVoiceManifest(source){
 const permission='<uses-permission android:name="android.permission.RECORD_AUDIO" />';
 if(!source.includes('PasekaDailyArchiveJob')||!source.includes('android.permission.RECEIVE_BOOT_COMPLETED')||source.split('</manifest>').length!==2)throw Error('VOICE_QA_BLOCKED: daily manifest missing');
 let result=source.includes('android.permission.RECORD_AUDIO')?source:source.replace('</manifest>',permission+'\n</manifest>');
 const query='<intent><action android:name="android.intent.action.TTS_SERVICE" /></intent>';
 if(!result.includes('android.intent.action.TTS_SERVICE')){
  if(result.includes('</queries>')){if(result.split('</queries>').length!==2)throw Error('VOICE_QA_BLOCKED: duplicate queries');result=result.replace('</queries>',query+'\n</queries>');}
  else result=result.replace('</manifest>','<queries>'+query+'</queries>\n</manifest>');
 }
 return result;
}
export function patchVoiceGradle(source){
 const ids=[...source.matchAll(/\bapplicationId\s*(?:=\s*)?["']([^"']+)["']/g)].map(m=>m[1]);
 if(ids.length!==1||ids[0]!==QA_ID||!/\bdependencies\s*\{/.test(source))throw Error('VOICE_QA_BLOCKED: wrong Gradle package');
 const lines=["implementation 'com.alphacephei:vosk-android:0.3.75@aar'","implementation 'net.java.dev.jna:jna:5.18.1@aar'"];
 for(const line of lines){
  if(!source.includes(line)){
   if(source.includes(line.split(':')[0]))throw Error('VOICE_QA_BLOCKED: incompatible dependency');
   source=source.replace(/\bdependencies\s*\{/,m=>m+'\n    '+line);
  }
 }
 return source;
}
const CARD='<div class="card" id="qaVoicePanel" hidden><b>Голосовой журнал · свободный рассказ (QA)</b><span id="qaVoiceNatural" hidden></span><label><input type="checkbox" id="qaVoiceCommandMode" checked> Диалог (выключи для обычной диктовки)</label><p class="muted">Расскажи обычными словами: «Осмотрел третий улей, семья Альфа, матка есть». Если чего-то не хватает, приложение спросит. Подтверди «да» или исправь «нет». Ничего не сохраняется автоматически.</p><p class="muted">Только синтетические записи. Модель из APK, без аккаунта и сети. При уходе с экрана микрофон выключается.</p><div class="row"><button id="qaVoiceInstall" type="button">Установить модель</button><button id="qaVoiceStart" type="button" disabled>Начать</button><button id="qaVoiceStop" type="button" disabled>Стоп</button></div><div id="qaVoiceStatus" role="status" aria-live="polite">Проверка…</div><p id="qaVoiceFeedback" role="status" aria-live="polite"></p><label for="qaVoiceText">Буфер обычной диктовки</label><textarea id="qaVoiceText" rows="4" maxlength="12000"></textarea><button type="button" id="qaVoiceToDraft">Добавить в черновик журнала</button></div>';
export function patchVoiceHtml(source){
 const marker='<section id="home" class="panel active">';
 if(source.split(marker).length!==2||source.split('</body>').length!==2||!source.includes('id="aiJournalDraftInput"'))throw Error('VOICE_QA_BLOCKED: unknown journal UI');
 if(source.includes('id="qaVoicePanel"')||source.includes('voice-qa.js'))throw Error('VOICE_QA_BLOCKED: duplicate generated panel');
 const legacy='<div class="ai-voice-panel">',button='id="aiVoiceButton"';
 if(source.split(legacy).length!==2||source.split(button).length!==2)throw Error('VOICE_QA_BLOCKED: legacy voice controls changed');
 const localCard=source.match(/<div class="card" id="aiJournalDraftCard">[^\n]*<\/div>/g);
 if(localCard?.length!==1)throw Error('VOICE_QA_BLOCKED: local journal card changed');
 return source.replace(localCard[0],'').replace(marker,marker+'\n  '+CARD+'\n  '+localCard[0]).replace(legacy,'<div class="ai-voice-panel" hidden style="display:none!important">').replace(button,button+' hidden style="display:none!important"').replace('</body>','<script src="./voice-qa.js"></script>\n</body>');
}
export async function setupVoiceQa(workspace=root,action,archive){
 const configPath=join(workspace,'capacitor.config.json'),config=JSON.parse(await readFile(configPath,'utf8'));
 if(action==='config'){await writeFile(configPath,JSON.stringify(voiceQaConfig(config),null,2)+'\n');return;}
 if(config.appId!==QA_ID||config.webDir!=='www'||config.android?.allowMixedContent!==false||config.server?.url||config.server?.allowNavigation||(config.server?.hostname||'localhost')!=='localhost'||(config.server?.androidScheme||'https')!=='https')throw Error('VOICE_QA_BLOCKED: isolated package required');
 if(action==='web'){
  const file=join(workspace,'www/index.html');
  await writeFile(file,patchVoiceHtml(await readFile(file,'utf8')));
  await copyFile(join(workspace,'android-native/voice-qa.js'),join(workspace,'www/voice-qa.js'));
  return;
 }
 if(action!=='android'||!archive)throw Error('VOICE_QA_BLOCKED: unknown action or model absent');
 if((await stat(archive)).size!==46236750||createHash('sha256').update(await readFile(archive)).digest('hex')!==PIN)throw Error('VOICE_QA_BLOCKED: exact model bytes not verified');
 // First apply the unmodified daily worker bootstrap; then add registration.
 await prepareDailyWorkerAndroid(workspace);
 const app=join(workspace,'android/app'),java=join(app,'src/main/java',...QA_ID.split('.'));
 const activity=join(java,'MainActivity.java'),manifest=join(app,'src/main/AndroidManifest.xml'),gradle=join(app,'build.gradle');
 const [main,xml,build]=await Promise.all([readFile(activity,'utf8'),readFile(manifest,'utf8'),readFile(gradle,'utf8')]);
 const next=[patchVoiceActivity(main),patchVoiceManifest(xml),patchVoiceGradle(build)];
 const assets=join(app,'src/main/assets/voice-qa');
 await mkdir(assets,{recursive:true});
 await Promise.all([writeFile(activity,next[0]),writeFile(manifest,next[1]),writeFile(gradle,next[2]),
  copyFile(join(workspace,'android-native/PasekaVoiceQaPlugin.java'),join(java,'PasekaVoiceQaPlugin.java')),
  copyFile(archive,join(assets,MODEL))]);
 console.log('VOICE_QA_PREPARED '+QA_ID+' '+PIN);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))setupVoiceQa(root,process.argv[2],process.argv[3]).catch(e=>{console.error(e.message);process.exitCode=1;});
