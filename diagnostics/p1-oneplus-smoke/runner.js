// Read-only OnePlus P1 smoke: injected ONLY into the dedicated diagnostic APK.
// No IndexedDB reads/writes, no network calls, no cleanup and no CAS.
(function(root){
'use strict';
const PACKAGE='ru.paseka.journal.p1smoke';
const CODE='P1_ISOLATED_PREVIEW_SMOKE_PASS';
const KEY='paseka-p1smoke-private-launch-marker-v1';
const checks=[];
function add(id,ok,detail){checks.push({id,status:ok?'PASS':'BLOCKED',detail:String(detail||'')});}
function report(){
 const meta=root.PasekaP1SmokeBuild;
 const local=meta&&meta.diagnosticId===PACKAGE&&meta.originalId==='ru.paseka.journal';
 add('testOnlyPackageConfig',!!local,'Configured diagnostic ID, not a live-package identity attestation');
 add('secureCapacitorWebview',location.protocol==='https:'&&location.hostname==='localhost',
  location.protocol+'//'+location.hostname);
 const required=[
  ['seasonWizard14',root.PasekaSeasonOperationsWizardV2?.descriptors?.length===14],
  ['sourcePhysicalManifest',typeof root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource==='function'],
  ['physicalLayoutInspector',typeof root.PasekaSectionalPhysicalLayout?.validate==='function'],
  ['op11Preview',typeof root.PasekaSectionalOP11GuidedV2?.plan==='function'],
  ['op12Preview',typeof root.PasekaSectionalOP12GuidedV2?.plan==='function'],
  ['op13Preview',typeof root.PasekaSectionalOP13GuidedV2?.plan==='function'],
  ['op14Preview',typeof root.PasekaSectionalOP14GuidedV2?.plan==='function']
 ];
 for(const [name,ok] of required)add(name,ok,'Built-in P1 module loaded in Android WebView');
 add('liveCasBridgeUnshipped',root.PasekaSectionalPhysicalBrowserCommitV2===undefined,
  'Critical OP11–14 CAS adapter must not be in the live shell before full archive proof');
 const op13=root.PasekaSectionalOP13GuidedV2;
 const validateVariant=(variant,observed,expected)=>{
  if(typeof op13?.makeStructure!=='function')return false;
  try{return op13.makeStructure({},{
   springVariant:variant,springDevelopmentPersonallyConfirmed:observed}).error===expected;}
  catch{return false;}
 };
 add('ordinarySpringNotRecastAsEarlyHoney',validateVariant('REGULAR_DEVELOPMENT',true,
  'op13_regular_development_requires_separate_plan'), 'The ordinary OP13 route must remain blocked');
 add('unknownSpringVariantBlocked',validateVariant('',true,
  'op13_early_honey_variant_must_be_explicit'), 'No default or inferred spring route');
 add('unobservedColonyStrengthBlocked',validateVariant('EARLY_HONEY_PREPARATION',false,
  'op13_personal_spring_strength_observation_required'), 'Only firsthand colony observation permits this route');
 const criticalPass=checks.every(x=>x.status==='PASS');
 let previous='',persistence='NOT_VERIFIED';
 try{
  previous=localStorage.getItem(KEY)||'';
  if(previous==='launch-observed')persistence='PRIVATE_DIAGNOSTIC_LOCAL_MARKER_SEEN_AGAIN';
  localStorage.setItem(KEY,'launch-observed');
 }catch{persistence='UNAVAILABLE_NO_USER_DATA_TOUCHED';}
 const result={
  schema:'paseka-p1-phone-readonly-smoke-v1',
  packageId:PACKAGE,sourceSha:meta?.sourceSha||'UNVERIFIED',
  status:criticalPass?'PASS':'BLOCKED',code:criticalPass?CODE:'P1_ISOLATED_PREVIEW_SMOKE_BLOCKED',
  scope:'ISOLATED_ANDROID_WEBVIEW_MODULES_ONLY',
  mobileDataAccess:'NOT_ATTEMPTED',originalUserArchive:'NOT_ACCESSED',
  originalVideos:'NOT_ACCESSED',productionDatabase:'NOT_ACCESSED',
  physicalHiveOperation:'NOT_ATTEMPTED',dataRestore:'NOT_ATTEMPTED',
  p1CasPersistence:'NOT_TESTED',independentSecondDeviceArchive:'NOT_VERIFIED',
  p1ReleaseReady:false,cleanup:'NOT_ATTEMPTED',
  networkReportedByWebView:navigator.onLine?'ONLINE':'OFFLINE',
  isolatedLocalStorageContinuity:persistence,
  forceStopObserved:'NOT_DETECTABLE_BY_WEBVIEW',
  checks
 };
 show(result);
 console.log('PASEKA_P1_ONEPLUS_SMOKE_RESULT '+JSON.stringify(result));
 return result;
}
function show(result){
 const pane=document.createElement('div');pane.id='p1-oneplus-diagnostic';
 pane.style.cssText='position:fixed;inset:0;z-index:2147483647;overflow-y:auto;'+
  'padding:22px max(18px,env(safe-area-inset-right)) 36px max(18px,env(safe-area-inset-left));'+
  'background:#fafafa;color:#17202b;font:16px/1.5 system-ui,-apple-system,sans-serif;';
 const title=document.createElement('h1');title.textContent='Пасека P1 · тест OnePlus';
 title.style.cssText='font-size:23px;margin:0 0 12px';
 const status=document.createElement('div');
 status.style.cssText='font-weight:700;font-size:21px;margin:10px 0 14px';
 status.textContent=(result.status==='PASS'?'PASS — модули Android запущены':'BLOCKED — есть неисправность')+
  ' (только тестовый APK)';
 const context=document.createElement('p');
 context.textContent='Изолированное приложение. Рабочая пасека, настоящий архив, видео и критические операции не проверяются и не изменяются. PASS не означает готовность P1 к эксплуатации.';
 const details=document.createElement('p');
 details.textContent='SHA '+result.sourceSha+'. Сеть: '+result.networkReportedByWebView+
  '. Повторный запуск: '+result.isolatedLocalStorageContinuity+'.';
 const note=document.createElement('p');
 note.textContent='Для испытания офлайн: отключите Wi-Fi и мобильную передачу данных; закройте и откройте ЭТО тестовое приложение. Для проверки после force-stop завершите его принудительно через настройки Android и откройте снова. Снимите экран или скопируйте результат. Не очищайте данные рабочего приложения.';
 const pre=document.createElement('pre');
 pre.style.cssText='white-space:pre-wrap;word-break:break-word;font:12px/1.45 monospace;'+
  'background:#edf0f3;border-radius:8px;padding:12px';
 pre.textContent=JSON.stringify(result,null,2);
 const actions=document.createElement('div');
 actions.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin:16px 0;';
 const copy=document.createElement('button');copy.type='button';copy.textContent='Скопировать результат';
 const repeat=document.createElement('button');repeat.type='button';repeat.textContent='Повторить проверку';
 for(const btn of [copy,repeat])btn.style.cssText='font:inherit;padding:11px 14px;border:1px solid #929aa3;'+
  'border-radius:9px;background:white;color:#17202b';
 copy.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(pre.textContent);copy.textContent='Результат скопирован';}
  catch{copy.textContent='Сделайте скриншот результата';}
 });
 repeat.addEventListener('click',()=>{pane.remove();report();});
 actions.append(copy,repeat);
 pane.append(title,status,context,details,note,actions,pre);
 document.body.append(pane);
}
if(document.readyState==='loading')
 document.addEventListener('DOMContentLoaded',report,{once:true});
else report();
})(typeof window!=='undefined'?window:globalThis);
