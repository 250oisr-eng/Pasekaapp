// Test-only compilation in a clean GitHub Actions checkout.
// Generates ru.paseka.journal.archive.restoreproof335, never production or fileproof329.
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
const picker=process.env.PASEKA_RESTORE335_PICKER==='1';
const PACKAGE=picker?'ru.paseka.journal.archive.restorepicker':'ru.paseka.journal.archive.restoreproof335';
const INPUT='fileproof335-input.paseka';
const EXPECTED='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186';
if(process.env.PASEKA_RESTORE335_BUILD!=='1')throw new Error('RESTORE335_BUILD_NOT_AUTHORIZED');
const mode=process.argv[2];
if(mode==='web'){
  const configFile='capacitor.config.json';
  const config=JSON.parse(readFileSync(configFile,'utf8'));
  if(config.appId!=='ru.paseka.journal')throw new Error('ORIGINAL_APP_ID_REQUIRED');
  if(!existsSync('www/js/paseka-archive.js'))throw new Error('PASEKA_ARCHIVE_WEB_ASSET_REQUIRED');
  config.appId=PACKAGE;
  config.appName=picker?'Пасека — проверка архива':'Пасека — восстановление335';
  writeFileSync(configFile,JSON.stringify(config,null,2)+'\n');
  // Staged input bytes are read by a dedicated native bridge, not by the app UI.
  const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Пасека — изолированный restore335</title>
<style>body{font:16px system-ui;margin:20px;background:#f6f7f5;color:#182d1f}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:16px;border-radius:8px}</style>
</head><body><h2>Только тестовое восстановление</h2><p>Отдельная пустая тестовая IndexedDB. Только два синтетических MP4 и архив с закреплённым SHA. Не удаляет файлы.</p>${picker?'<label>Выберите тестовый архив из Download/PasekaProof329 <input type="file" id="archive"></label>':''}<pre id="result" aria-live="polite">${picker?'Ожидание файла':'Проверка входного архива...'}</pre>
<script src="./js/paseka-archive.js"></script><script src="./android-fileproof335-isolated-restore.js"></script>
<script src="./android-fileproof335-start.js"></script></body></html>`;
  writeFileSync('www/index.html',html);
  copyFileSync('tests/fixtures/android-fileproof335-isolated-restore.js','www/android-fileproof335-isolated-restore.js');
  copyFileSync(picker?'tests/fixtures/android-restore335-picker.js':'tests/fixtures/android-fileproof335-start.js','www/android-fileproof335-start.js');
  console.log('RESTORE335_WEB_ISOLATED',PACKAGE);
}else if(mode==='native'){
  const config=JSON.parse(readFileSync('capacitor.config.json','utf8'));
  if(config.appId!==PACKAGE)throw new Error('WRONG_TEST_PACKAGE');
  if(picker){
    console.log('System file chooser uses the standard Capacitor activity.',PACKAGE);
    process.exit(0);
  }
  const activityPath=join('android','app','src','main','java',...PACKAGE.split('.'),'MainActivity.java');
  if(!existsSync(activityPath))throw new Error('ACTIVITY_NOT_GENERATED');
  const activity=readFileSync(activityPath,'utf8');
  const marker='public class MainActivity extends BridgeActivity {';
  if(!activity.includes('package '+PACKAGE+';') || !activity.includes(marker) || activity.includes('onCreate(')){
    throw new Error('UNEXPECTED_ACTIVITY_NO_PATCH');
  }
  const injected=marker+`
  @Override public void onCreate(android.os.Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if(getBridge()==null || getBridge().getWebView()==null)
      throw new IllegalStateException("RESTORE335_WEBVIEW_REQUIRED");
    getBridge().getWebView().addJavascriptInterface(
      new Restore335InputBridge(this), "PasekaRestore335Input");
    getBridge().getWebView().addJavascriptInterface(
      new Restore335Reporter(this), "PasekaRestore335Report");
  }
`;
  writeFileSync(activityPath,activity.replace(marker,injected));
  const java=join(dirname(activityPath),'Restore335InputBridge.java');
  if(existsSync(java))throw new Error('BRIDGE_ALREADY_EXISTS');
  const nativeSource=`package ${PACKAGE};

import android.content.Context;
import android.webkit.JavascriptInterface;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import android.util.Base64;

public final class Restore335InputBridge {
  private static final String FILE = "${INPUT}";
  private static final String SHA = "${EXPECTED}";
  private final Context context;
  private boolean readAttempted = false;
  Restore335InputBridge(Context ctx) { context=ctx.getApplicationContext(); }
  private static String sha(byte[] bytes) throws Exception {
    byte[] result=MessageDigest.getInstance("SHA-256").digest(bytes);
    StringBuilder out=new StringBuilder(64);
    for(byte b:result)out.append(String.format(java.util.Locale.ROOT,"%02x",b&0xff));
    return out.toString();
  }
  @JavascriptInterface public synchronized String readPinnedArchiveBase64(){
    if(readAttempted)return "BLOCKED:ONE_SHOT_ALREADY_ATTEMPTED";
    readAttempted=true;
    try {
      File file=new File(context.getFilesDir(),FILE);
      if(!file.isFile() || file.length()!=3158)return "BLOCKED:PRIVATE_FILE_MISSING_OR_SIZE";
      byte[] data=new byte[3158];
      try(FileInputStream input=new FileInputStream(file)){
        int offset=0;
        while(offset<data.length){
          int count=input.read(data,offset,data.length-offset);
          if(count<0)return "BLOCKED:INCOMPLETE_READ";
          offset+=count;
        }
        if(input.read()!=-1)return "BLOCKED:EXTRA_BYTES";
      }
      if(!sha(data).equals(SHA))return "BLOCKED:PINNED_SHA_MISMATCH";
      return "PASS:"+Base64.encodeToString(data,Base64.NO_WRAP);
    } catch(Exception error) {
      return "BLOCKED:PRIVATE_INPUT_READ_ERROR";
    }
  }
}
`;
  writeFileSync(java,nativeSource);
  const reporterFile=join(dirname(activityPath),'Restore335Reporter.java');
  if(existsSync(reporterFile))throw new Error('REPORTER_ALREADY_EXISTS');
  const reporterSource=`package ${PACKAGE};
import android.content.Context;
import android.webkit.JavascriptInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
public final class Restore335Reporter {
  private final Context context;
  private boolean attempted=false;
  Restore335Reporter(Context ctx) { context=ctx.getApplicationContext(); }
  @JavascriptInterface public synchronized void report(String text) {
    if(attempted)return;
    attempted=true;
    if(text==null || text.length()>1200 || !text.startsWith("{") ||
      !text.contains("cleanupAuthorized") || !text.contains("recognitionSucceeded"))return;
    File destination=new File(context.getFilesDir(),"restore335-report.json");
    if(destination.exists())return;
    try(FileOutputStream stream=new FileOutputStream(destination,false)){
      stream.write(text.getBytes(StandardCharsets.UTF_8));
    }catch(Exception ignored){}
  }
}
`;
  writeFileSync(reporterFile,reporterSource);
  console.log('RESTORE335_NATIVE_BRIDGE',java,reporterFile);
}else throw new Error('EXPECTED_WEB_OR_NATIVE');
