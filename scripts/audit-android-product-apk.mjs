import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';

export const EXPECTED_PACKAGE='ru.paseka.journal';
export function parseBadging(value){
 if(typeof value!=='string')throw Error('BADGING_INVALID');
 const lines=value.split(/\r?\n/).filter(x=>x.startsWith('package: '));
 if(lines.length!==1)throw Error('PACKAGE_BADGING_MISSING_OR_DUPLICATE');
 const match=/^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'/.exec(lines[0]);
 if(!match)throw Error('PACKAGE_BADGING_MALFORMED');
 return {packageId:match[1],versionCode:match[2],versionName:match[3]};
}
export function parsePermissions(value){
 if(typeof value!=='string'||!value.includes('package:'))throw Error('PERMISSIONS_AAPT_INVALID');
 const names=[];
 for(const line of value.split(/\r?\n/)){
  if(!/^\s*uses-permission(?:-sdk-\d+)?:/.test(line))continue;
  const match=/^\s*uses-permission(?:-sdk-\d+)?:\s+name='([^']+)'/.exec(line);
  if(!match||!/^[-.\w]+$/.test(match[1]))throw Error('PERMISSION_LINE_MALFORMED');
  names.push(match[1]);
 }
 if(new Set(names).size!==names.length)throw Error('PERMISSION_DUPLICATE');
 return names.sort();
}
export function permissionRisk(name){
 if(name==='android.permission.INTERNET')return 'NETWORK_CAPABILITY';
 if(/^android\.permission\.(CAMERA|RECORD_AUDIO|READ_MEDIA_.*|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|MANAGE_MEDIA|ACCESS_MEDIA_LOCATION)$/.test(name))
  return 'SENSITIVE_MEDIA_OR_STORAGE';
 return 'OTHER';
}
const NETWORK_PATTERNS=[
 ['fetch',/\bfetch\s*\(/g],
 ['xhr',/\bXMLHttpRequest\b/g],
 ['websocket',/\bWebSocket\b/g],
 ['eventsource',/\bEventSource\b/g],
 ['sendBeacon',/\bsendBeacon\s*\(/g],
 ['capacitorHttp',/\bCapacitorHttp\b/g],
 ['externalUrl',/https?:\/\//g]
];
export function scanSource(path,contents){
 if(typeof contents!=='string')throw Error('SOURCE_INVALID');
 const hits=[];
 const lines=contents.split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  for(const [kind,pattern] of NETWORK_PATTERNS){
   pattern.lastIndex=0;
   if(pattern.test(lines[i]))hits.push({file:path,line:i+1,kind});
  }
 }
 return hits;
}
export async function collectNetworkSurface(root='.'){
 const files=['index.html','sw.js'];
 async function walk(dir){
  for(const dirent of await readdir(join(root,dir),{withFileTypes:true})){
   const path=join(dir,dirent.name);
   if(dirent.isDirectory())await walk(path);
   else if(dirent.isFile()&&path.endsWith('.js'))files.push(path);
  }
 }
 await walk('js');
 const hits=[];
 for(const file of files){
  const source=await readFile(join(root,file),'utf8');
  hits.push(...scanSource(file.replaceAll('\\','/'),source));
 }
 return {scope:'SOURCE_HEURISTIC_ONLY',filesScanned:files.length,
  matchedLines:hits.length,hits:hits.slice(0,500),
  truncated:hits.length>500,networkTrafficObserved:'NOT_TESTED'};
}
export function classifyAudit({badging,permissions,sha256,networkSurface}){
 const pkg=parseBadging(badging);
 if(pkg.packageId!==EXPECTED_PACKAGE)throw Error('PRODUCT_PACKAGE_ID_MISMATCH');
 if(!/^[a-f0-9]{64}$/.test(sha256))throw Error('APK_SHA256_INVALID');
 const names=parsePermissions(permissions);
 const entries=names.map(name=>({name,category:permissionRisk(name)}));
 return {
  status:'PASS',code:'PRODUCT_APK_STATIC_AUDIT_ONLY',
  packageId:pkg.packageId,versionCode:pkg.versionCode,versionName:pkg.versionName,
  apkSha256:sha256,
  permissions:entries,
  androidPackagePermissionsSource:'APK_AAPT_BUILD_TIME_ONLY',
  productInstalledPermissions:'NOT_TESTED',
  productNetworkTrafficObserved:'NOT_TESTED',
  sourceNetworkSurface:networkSurface,
  realVideoAccess:'NOT_ATTEMPTED',videoDeletion:'NOT_ATTEMPTED',
  cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false,
  userDataModified:false
 };
}
async function main(){
 const apk=process.argv[2],aapt=process.argv[3],output=process.argv[4];
 if(!apk||!aapt||!output)throw Error('Usage: node scripts/audit-android-product-apk.mjs APK AAPT OUTPUT_JSON');
 const bytes=await readFile(apk);
 if(bytes.length<1000)throw Error('APK_TOO_SMALL');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const badging=execFileSync(aapt,['dump','badging',apk],{encoding:'utf8',maxBuffer:2**20});
 const permissions=execFileSync(aapt,['dump','permissions',apk],{encoding:'utf8',maxBuffer:2**20});
 const networkSurface=await collectNetworkSurface();
 const result=classifyAudit({badging,permissions,sha256,networkSurface});
 await writeFile(output,JSON.stringify(result,null,2)+'\n');
 console.log('Static product APK audit written:',output);
 console.log('Package:',result.packageId,'permissions:',result.permissions.length,
 'static source lines:',networkSurface.matchedLines,'physical network traffic: NOT_TESTED');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)await main();
