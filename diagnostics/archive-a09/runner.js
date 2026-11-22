(function(){'use strict';
const PKG='ru.paseka.journal.diagnostic.archivea09v1';
const run=document.getElementById('run'),copy=document.getElementById('copy');
const status=document.getElementById('status'),view=document.getElementById('result');
let report=null;
const forbidden=(name)=>/^android\.permission\.(?:INTERNET|CAMERA|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|MANAGE_MEDIA|ACCESS_MEDIA_LOCATION|READ_MEDIA_[A-Z0-9_]+|WRITE_MEDIA_[A-Z0-9_]+|RECORD_AUDIO)$/.test(name);
function requireValid(condition,code){if(!condition)throw Error(code);}
function output(state,code,details={}){
 const obj={status:state,code,packageId:PKG,suite:'ARCHIVE_A09_INSTALLED_PERMISSION_AUDIT_V1',
  checks:state==='PASS'?['A09_INSTALLED_OWN_PACKAGE_PERMISSIONS:PASS']:[],
  scenariosVerified:state==='PASS'?['A09_INSTALLED_PERMISSION_AUDIT_ONLY']:[],
  scenariosNotTested:['A02_REAL_PASEKA01','A03_REAL_PASEKA02','A08_ANDROID_FORCE_STOP','A09_NETWORK_TRAFFIC_OBSERVATION'],
  networkTrafficObserved:'NOT_TESTED',networkRequests:'NOT_ATTEMPTED',
  beeRecognition:'NOT_TESTED',realArchiveRestore:'NOT_TESTED',
  realVideoAccess:'NOT_ATTEMPTED',externalMediaAccess:'NOT_ATTEMPTED',videoDeletion:'NOT_ATTEMPTED',
  cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false,userDataModified:false,...details};
 report=JSON.stringify(obj,null,2);view.textContent=report;copy.disabled=false;
 status.textContent=state==='PASS'?'PASS (только разрешения). Нажмите «Копировать результат».':'BLOCKED. Нажмите «Копировать результат».';
}
async function test(){
 run.disabled=true;copy.disabled=true;report=null;view.textContent='RUNNING';
 status.textContent='Чтение собственных разрешений Android…';
 try{
  const plugin=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.A09Permissions;
  requireValid(plugin&&typeof plugin.inspectOwnPackage==='function','NATIVE_PACKAGE_MANAGER_UNAVAILABLE');
  const data=await plugin.inspectOwnPackage();
  requireValid(data&&typeof data==='object'&&data.packageId===PKG&&data.uidMatchesProcess===true&&
   data.source==='ANDROID_PACKAGE_MANAGER_INSTALLED_OWN_PACKAGE'&&Array.isArray(data.requestedPermissions),
   'A09_PACKAGE_IDENTITY_OR_SOURCE_INVALID');
  requireValid(data.requestedPermissions.length<=256,'A09_PERMISSION_COUNT_UNEXPECTED');
  const seen=new Set(),entries=[];
  for(const item of data.requestedPermissions){
   requireValid(item&&typeof item.name==='string'&&/^[-._A-Za-z0-9]+$/.test(item.name)&&
    item.name.length<=200&&typeof item.granted==='boolean'&&
    typeof item.requestedGrantedFlag==='boolean'&&!seen.has(item.name),'A09_PERMISSION_ENTRY_INVALID');
   seen.add(item.name);
   entries.push({name:item.name,granted:item.granted,requestedGrantedFlag:item.requestedGrantedFlag});
  }
  const unsafe=entries.filter(x=>forbidden(x.name));
  if(unsafe.length){
   output('BLOCKED','A09_FORBIDDEN_PERMISSION_DECLARED',{packagePermissionAudit:'BLOCKED',
    requestedPermissions:entries,forbiddenPermissions:unsafe,installedPackageVerified:true});
  }else{
   output('PASS','A09_INSTALLED_PERMISSION_AUDIT_ONLY',{packagePermissionAudit:'PASS',
    requestedPermissions:entries,forbiddenPermissions:[],installedPackageVerified:true});
  }
 }catch(error){
  output('BLOCKED',String(error&&error.message||error),{packagePermissionAudit:'BLOCKED',
   installedPackageVerified:false});
 }finally{run.disabled=false;}
}
async function copyResult(){
 if(copy.disabled||!report)return;
 copy.disabled=true;
 try{
  const plugin=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Clipboard;
  await window.PasekaDiagnosticCopy.copyReport(report,plugin);
  status.textContent='Результат скопирован. Вставьте его в чат.';
 }catch(error){status.textContent='Не удалось скопировать: '+String(error&&error.message||error);}
 finally{copy.disabled=false;}
}
run.addEventListener('click',test);
copy.addEventListener('click',copyResult);
})();
