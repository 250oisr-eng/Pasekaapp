// Compile-only isolation stage. Produces a new Android package with NO automatic writes.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {isolatedMediaStoreBridgeJava,TEST_PACKAGE} from './isolated-android-mediastore-proof-bridge.mjs';
if(process.env.PASEKA_FILEPROOF329_BUILD!=='1')throw new Error('FILEPROOF329_BUILD_NOT_AUTHORIZED');
const mode=process.argv[2];
if(mode==='web'){
  const f='capacitor.config.json', c=JSON.parse(readFileSync(f,'utf8'));
  if(c.appId!=='ru.paseka.journal')throw new Error('UNEXPECTED_SOURCE_PACKAGE');
  if(!existsSync('www/js/paseka-archive.js'))throw new Error('WEB_ASSETS_NOT_PREPARED');
  c.appId=TEST_PACKAGE;
  c.appName='Пасека — fileproof329';
  writeFileSync(f,JSON.stringify(c,null,2)+'\n');
  // Intentionally inert: no JS call to native bridge, no file creation during startup.
  writeFileSync('www/index.html',`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Пасека fileproof329</title></head><body><main><h1>MediaStore fileproof329</h1><p>Компиляционная проверка тестового моста. Запись файлов отключена. Данные пользователя не используются.</p></main></body></html>`);
  console.log('FILEPROOF329_WEB_COMPILE_ONLY',TEST_PACKAGE);
}else if(mode==='native'){
  const c=JSON.parse(readFileSync('capacitor.config.json','utf8'));
  if(c.appId!==TEST_PACKAGE)throw new Error('WRONG_PACKAGE_CONFIG');
  const path=join('android','app','src','main','java',...TEST_PACKAGE.split('.'),'MainActivity.java');
  if(!existsSync(path))throw new Error('GENERATED_ACTIVITY_MISSING');
  const original=readFileSync(path,'utf8');
  if(!original.includes('package '+TEST_PACKAGE+';')||!/extends BridgeActivity/.test(original))
    throw new Error('UNEXPECTED_ACTIVITY');
  if(original.includes('onCreate('))throw new Error('EXISTING_ONCREATE_REFUSE_PATCH');
  const marker='public class MainActivity extends BridgeActivity {';
  if(original.indexOf(marker)<0)throw new Error('ACTIVITY_MARKER_MISSING');
  const replacement=marker+`
  @Override public void onCreate(android.os.Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (getBridge()==null || getBridge().getWebView()==null)
      throw new IllegalStateException("TEST_WEBVIEW_MISSING");
    getBridge().getWebView().addJavascriptInterface(
      new IsolatedMediaStoreProofBridge(this), "PasekaFileproof329");
  }
`;
  writeFileSync(path,original.replace(marker,replacement));
  const java=join(dirname(path),'IsolatedMediaStoreProofBridge.java');
  if(existsSync(java))throw new Error('EXISTING_BRIDGE_NO_OVERWRITE');
  writeFileSync(java,isolatedMediaStoreBridgeJava());
  console.log('FILEPROOF329_NATIVE_BRIDGE_COMPILE_ONLY',java);
}else throw new Error('EXPECTED_WEB_OR_NATIVE_STAGE');
