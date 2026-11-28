import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const BOOTSTRAP='(async()=>{\n try{\n  const databaseCreatedDuringOpen=await openDB();';
const CSP='<meta http-equiv="Content-Security-Policy" content="default-src \u0027none\u0027; script-src \u0027unsafe-inline\u0027; style-src \u0027unsafe-inline\u0027; img-src data: blob:; media-src data: blob:; connect-src \u0027none\u0027; frame-src \u0027none\u0027; base-uri \u0027none\u0027; form-action \u0027none\u0027">';
export async function buildDailyWorkerHtml(index,loadModule,runner){
 if(typeof index!=='string'||typeof runner!=='string'||index.split(BOOTSTRAP).length!==2||/<\/script/i.test(runner))
  throw Error('DAILY_WORKER_BLOCKED: unexpected app bootstrap or worker source');
 const start=index.indexOf(BOOTSTRAP),end=index.indexOf('</script>',start);
 if(end<0||!index.slice(start,end).trimEnd().endsWith('})();'))
  throw Error('DAILY_WORKER_BLOCKED: unexpected startup closure');
 let html=index.slice(0,start)+runner+'\n'+index.slice(end);
 const scripts=[...html.matchAll(/<script src="\.\/(js\/[a-z0-9-]+\.js)"><\/script>/g)];
 if(!scripts.some(m=>m[1]==='js/daily-archives.js')||!scripts.some(m=>m[1]==='js/disaster-archive.js'))
  throw Error('DAILY_WORKER_BLOCKED: archive modules absent');
 for(const match of scripts){
  const code=await loadModule(match[1]);
  if(typeof code!=='string'||/<\/script/i.test(code))throw Error('DAILY_WORKER_BLOCKED: unsafe inline module '+match[1]);
  html=html.replace(match[0],()=>'<script>\n'+code+'\n</script>');
 }
 if(/<script\b[^>]*\bsrc\s*=/i.test(html))throw Error('DAILY_WORKER_BLOCKED: external script');
 html=html.replace(/<link\b[^>]*>/gi,'');
 if(html.split('<meta charset="utf-8">').length!==2)throw Error('DAILY_WORKER_BLOCKED: missing charset');
 html=html.replace('<meta charset="utf-8">','<meta charset="utf-8">'+CSP);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(match[1]);
 return html;
}
export async function prepareDailyWorkerWeb(workspace=root){
 const [index,runner]=await Promise.all([
  readFile(join(workspace,'index.html'),'utf8'),
  readFile(join(workspace,'android-native/daily-archive-worker.js'),'utf8')
 ]);
 const html=await buildDailyWorkerHtml(index,path=>readFile(join(workspace,path),'utf8'),runner);
 await mkdir(join(workspace,'www'),{recursive:true});
 await writeFile(join(workspace,'www/daily-archive-worker.html'),html);
 return html;
}
const allowed=new Set(['ru.paseka.journal','ru.paseka.journal.qa.daily','ru.paseka.journal.qa.voice4']);
export function dailyQaConfig(config){
 if(config?.appId!=='ru.paseka.journal')throw Error('DAILY_QA_BLOCKED: unexpected original Capacitor config');
 assertDailyConfig(config);
 return {...config,appId:'ru.paseka.journal.qa.daily',appName:'Пасека QA — автоархив'};
}
export function assertDailyConfig(config){
 if(!allowed.has(config?.appId)||config.webDir!=='www'||config.android?.allowMixedContent!==false||
    config.server?.url||config.server?.allowNavigation||
    (config.server?.hostname||'localhost')!=='localhost'||(config.server?.androidScheme||'https')!=='https')
  throw Error('DAILY_WORKER_BLOCKED: unsupported package or origin; never migrate live WebView origin');
 return config.appId;
}
export function patchActivity(source,id){
 if(!source.startsWith('package '+id+';'))throw Error('DAILY_WORKER_BLOCKED: MainActivity package differs');
 const old='public class MainActivity extends BridgeActivity {}';
 const next='public class MainActivity extends BridgeActivity {\n    @Override public void onCreate(android.os.Bundle state) {\n        super.onCreate(state);\n        PasekaDailyArchiveJob.schedule(this);\n    }\n}';
 if(source.includes(next)&&source.split(next).length===2)return source;
 if(source.split(old).length!==2)throw Error('DAILY_WORKER_BLOCKED: unexpected MainActivity template');
 return source.replace(old,next);
}
const service='<service android:name=".PasekaDailyArchiveJob" android:exported="true" android:permission="android.permission.BIND_JOB_SERVICE" />';
const permission='<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />';
export function patchManifest(source){
 if(source.includes(service)&&source.includes(permission))return source;
 if(source.includes('PasekaDailyArchiveJob')||source.split('</application>').length!==2||source.split('</manifest>').length!==2)
  throw Error('DAILY_WORKER_BLOCKED: unexpected AndroidManifest');
 const patched=source.replace('</application>',service+'\n    </application>');
 return source.includes(permission)?patched:patched.replace('</manifest>',permission+'\n</manifest>');
}
export async function prepareDailyWorkerAndroid(workspace=root){
 const config=JSON.parse(await readFile(join(workspace,'capacitor.config.json'),'utf8')),id=assertDailyConfig(config);
 const html=await readFile(join(workspace,'android/app/src/main/assets/public/daily-archive-worker.html'),'utf8');
 if(!html.includes('bridge.finish(outcome)')||html.includes(BOOTSTRAP))
  throw Error('DAILY_WORKER_BLOCKED: generated Android worker asset missing or unsafe');
 const generated=JSON.parse(await readFile(join(workspace,'android/app/src/main/assets/capacitor.config.json'),'utf8'));
 if(assertDailyConfig(generated)!==id)throw Error('DAILY_WORKER_BLOCKED: generated config differs');
 const javaDir=join(workspace,'android/app/src/main/java',...id.split('.'));
 const activity=join(javaDir,'MainActivity.java'),manifest=join(workspace,'android/app/src/main/AndroidManifest.xml');
 const [main,xml,job]=await Promise.all([readFile(activity,'utf8'),readFile(manifest,'utf8'),readFile(join(workspace,'android-native/PasekaDailyArchiveJob.java'),'utf8')]);
 if(job.split('__PASEKA_PACKAGE__').length!==2)throw Error('DAILY_WORKER_BLOCKED: native template package marker missing');
 const nextMain=patchActivity(main,id),nextManifest=patchManifest(xml);
 await Promise.all([writeFile(activity,nextMain),writeFile(manifest,nextManifest),writeFile(join(javaDir,'PasekaDailyArchiveJob.java'),job.replace('__PASEKA_PACKAGE__',id))]);
 console.log('DAILY_WORKER_PREPARED '+id);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const action=process.argv[2]||'android';
 (async()=>{
  if(action==='config'){
   const path=join(root,'capacitor.config.json');
   await writeFile(path,JSON.stringify(dailyQaConfig(JSON.parse(await readFile(path,'utf8'))),null,2)+'\n');
  }else if(action==='android')await prepareDailyWorkerAndroid();
  else if(action==='web')await prepareDailyWorkerWeb();
  else throw Error('DAILY_WORKER_BLOCKED: unknown action');
 })().catch(e=>{console.error(e.message);process.exitCode=1;});
}
