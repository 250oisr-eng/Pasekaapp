// Isolated one-shot runtime proof. NEVER modifies a production package or existing app.
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
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
  const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Пасека fileproof329</title>
<style>body{font:15px system-ui;margin:24px;background:#f5f6f5;color:#152718}pre{padding:16px;background:white;white-space:pre-wrap;overflow-wrap:anywhere}</style></head>
<body><main><h1>Тест файла двух MP4</h1><p>Только два синтетических видео. Отдельная база и отдельный тестовый каталог Download/PasekaProof329. Один запуск, без удаления или восстановления.</p><pre id="result">Проверка...</pre></main>
<script src="./js/paseka-archive.js"></script><script src="./android-two-mp4-proof-fixtures.js"></script><script src="./android-two-mp4-fileproof329.js"></script></body></html>`;
  writeFileSync('www/index.html',html);
  copyFileSync('tests/fixtures/android-two-mp4-proof-fixtures.js','www/android-two-mp4-proof-fixtures.js');
  copyFileSync('tests/fixtures/android-two-mp4-fileproof329.js','www/android-two-mp4-fileproof329.js');
  console.log('FILEPROOF329_ISOLATED_WEB',TEST_PACKAGE);
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
      new IsolatedMediaStoreProofBridge(this), "PasekaFileproof329");\n    getBridge().getWebView().addJavascriptInterface(\n      new Fileproof329Reporter(this), "PasekaFileproof329Report");
  }
`;
  writeFileSync(path,original.replace(marker,replacement));
  const java=join(dirname(path),'IsolatedMediaStoreProofBridge.java');
  if(existsSync(java))throw new Error('EXISTING_BRIDGE_NO_OVERWRITE');
  writeFileSync(java,isolatedMediaStoreBridgeJava());
  const reporterPath=join(dirname(path),'Fileproof329Reporter.java');
  if(existsSync(reporterPath))throw new Error('EXISTING_REPORTER_NO_OVERWRITE');
  writeFileSync(reporterPath,`package ${TEST_PACKAGE};
import android.content.Context;
import android.webkit.JavascriptInterface;
import android.util.Log;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
public final class Fileproof329Reporter {
  private final Context app;
  public Fileproof329Reporter(Context context){app=context.getApplicationContext();}
  @JavascriptInterface public synchronized void report(String text) {
    if(text==null || text.length()>1200 ||
      !text.startsWith("{") ||
      !text.contains("proofVersion") ||
      !text.contains("cleanupAuthorized") ||
      !text.contains("recognitionSucceeded"))return;
    File file=new File(app.getFilesDir(),"paseka-fileproof329.ndjson");
    if(file.exists() && file.length()>4096)return;
    try(FileOutputStream output=new FileOutputStream(file,true)){
      output.write((text+"\\n").getBytes(StandardCharsets.UTF_8));
      Log.i("PasekaFileproof329",text);
    }catch(Exception error){Log.e("PasekaFileproof329","Cannot write test report",error);}
  }
}
`);
  console.log('FILEPROOF329_NATIVE_RUNTIME_BRIDGES',java,reporterPath);
}else throw new Error('EXPECTED_WEB_OR_NATIVE_STAGE');
