(function(){'use strict';
const PKG='ru.paseka.journal.diagnostic.productpermsv1',TARGET='ru.paseka.journal';
const button=document.getElementById('run'),copy=document.getElementById('copy'),status=document.getElementById('status'),view=document.getElementById('result');
let last=null;
function check(x,code){if(!x)throw Error(code);}
function report(state,code,extra={}){
 const result={status:state,code,packageId:PKG,targetPackageId:TARGET,
  suite:'PRODUCT_INSTALLED_PERMISSIONS_READONLY_V1',
  checks:state==='PASS'?['PRODUCT_INSTALLED_PACKAGE_PERMISSIONS_READ:PASS']:[],
  scenariosVerified:state==='PASS'?['PRODUCT_INSTALLED_PERMISSIONS_METADATA_ONLY']:[],
  scenariosNotTested:['PRODUCT_NETWORK_TRAFFIC_OBSERVATION','PRODUCT_DATA_READ_OR_RESTORE',
   'A02_REAL_PASEKA01','A03_REAL_PASEKA02','A08_ANDROID_FORCE_STOP'],
  productInstalledPermissions:state==='PASS'?'READ_ONLY_METADATA_VERIFIED':'NOT_VERIFIED',
  productNetworkTrafficObserved:'NOT_TESTED',
  productSigningCertificateVerified:'NOT_TESTED',productBinaryMatchesCIBuild:'NOT_TESTED',
  installedAppOpened:false,
  beeRecognition:'NOT_TESTED',realArchiveRestore:'NOT_TESTED',
  realVideoAccess:'NOT_ATTEMPTED',videoDeletion:'NOT_ATTEMPTED',
  cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false,userDataModified:false,
  ...extra};
 // Keep every completed PASS/BLOCKED report inside the clipboard safety limit.
 // A large permission inventory must fail closed, never leave an uncopyable PASS.
 let serialized=JSON.stringify(result,null,2);
 if(serialized.length>32768){
  const blocked={status:'BLOCKED',code:'REPORT_TOO_LARGE',packageId:PKG,targetPackageId:TARGET,
   suite:'PRODUCT_INSTALLED_PERMISSIONS_READONLY_V1',
   checks:[],scenariosVerified:[],
   scenariosNotTested:['PRODUCT_INSTALLED_PERMISSIONS_METADATA_ONLY','PRODUCT_NETWORK_TRAFFIC_OBSERVATION',
    'PRODUCT_DATA_READ_OR_RESTORE','A02_REAL_PASEKA01','A03_REAL_PASEKA02','A08_ANDROID_FORCE_STOP'],
   productInstalledPermissions:'NOT_VERIFIED',productNetworkTrafficObserved:'NOT_TESTED',
   installedProductPackageVerified:false,installedAppOpened:false,
   beeRecognition:'NOT_TESTED',realArchiveRestore:'NOT_TESTED',
   realVideoAccess:'NOT_ATTEMPTED',videoDeletion:'NOT_ATTEMPTED',
   cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false,userDataModified:false};
  serialized=JSON.stringify(blocked,null,2);
 }
 last=serialized;view.textContent=last;copy.disabled=false;
 const finalReport=JSON.parse(serialized);
 status.textContent=(finalReport.status==='PASS'?'Метаданные получены.':'Проверка ограничена: '+finalReport.code+'.')+' Нажмите «Копировать результат».';
}
async function run(){
 button.disabled=true;copy.disabled=true;last=null;view.textContent='RUNNING';
 status.textContent='Читаются сведения установленного пакета Android…';
 try{
  const native=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.ProductPermissions;
  check(native&&typeof native.inspectTarget==='function','NATIVE_AUDITOR_UNAVAILABLE');
  const source=await native.inspectTarget();
  check(source&&source.targetPackageId===TARGET&&source.source==='ANDROID_PACKAGE_MANAGER_INSTALLED_EXPLICIT_TARGET'&&source.identityVerified===true&&Array.isArray(source.requestedPermissions),
  'INSTALLED_TARGET_IDENTITY_UNVERIFIED');
  check(source.requestedPermissions.length<=256,'PERMISSION_COUNT_INVALID');
  const seen=new Set(),permissions=[];
  for(const entry of source.requestedPermissions){
   check(entry&&typeof entry.name==='string'&&/^[-.a-zA-Z0-9_]+$/.test(entry.name)&&entry.name.length<=200&&
    !seen.has(entry.name)&&typeof entry.granted==='boolean'&&typeof entry.requestedGrantedFlag==='boolean',
    'PERMISSION_LIST_INVALID');
   seen.add(entry.name);
   permissions.push({name:entry.name,granted:entry.granted,requestedGrantedFlag:entry.requestedGrantedFlag});
  }
  check(typeof source.versionName==='string'&&source.versionName.length<=100&&
   typeof source.versionCode==='string'&&/^\d{1,20}$/.test(source.versionCode),
   'INSTALLED_VERSION_INVALID');
  const internet=permissions.some(x=>x.name==='android.permission.INTERNET');
  const media=permissions.filter(x=>/^android\.permission\.(?:CAMERA|RECORD_AUDIO|READ_MEDIA_.*|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|MANAGE_MEDIA)$/.test(x.name));
  report('PASS','PRODUCT_INSTALLED_PACKAGE_PERMISSIONS_READONLY',{installedProductPackageVerified:true,
   installedVersionCode:source.versionCode,installedVersionName:source.versionName,
   internetPermissionDeclared:internet,sensitiveMediaPermissionsDeclared:media,
   requestedPermissions:permissions});
 }catch(e){
  report('BLOCKED',String(e&&e.message||e),{installedProductPackageVerified:false});
 }finally{button.disabled=false;}
}
async function write(){
 if(copy.disabled||!last)return;
 copy.disabled=true;
 try{
  const native=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Clipboard;
  await window.PasekaDiagnosticCopy.write(last,native);
  status.textContent='Отчёт скопирован. Вставьте его в чат.';
 }catch(e){status.textContent='Не удалось скопировать: '+String(e&&e.message||e);}
 finally{copy.disabled=false;}
}
button.addEventListener('click',run);
copy.addEventListener('click',write);
})();