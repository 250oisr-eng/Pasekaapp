import {readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const mode=process.argv[2];
if(process.env.PASEKA_TWO_MP4_PROOF_BUILD!=='1')throw new Error('This script is only for the isolated CI proof build');
const pkg='ru.paseka.journal.archive.proof325';
if(mode==='web'){
  const configFile='capacitor.config.json';
  const config=JSON.parse(readFileSync(configFile,'utf8'));
  if(config.appId!=='ru.paseka.journal'||config.appName!=='Пасека')throw new Error('Unexpected production config; abort isolated build');
  if(!existsSync('www/js/paseka-archive.js'))throw new Error('Prepared web modules missing');
  config.appId=pkg;
  config.appName='Пасека — MP4 proof 325';
  writeFileSync(configFile,JSON.stringify(config,null,2)+'\n');
  copyFileSync('tests/fixtures/android-two-mp4-proof.html','www/index.html');
  for(const name of ['android-two-mp4-proof-fixtures.js','android-two-mp4-proof.js'])
    copyFileSync('tests/fixtures/'+name,'www/'+name);
  console.log('ISOLATED_PROOF_WEB_PREPARED:',pkg);
}else if(mode==='native'){
  const config=JSON.parse(readFileSync('capacitor.config.json','utf8'));
  if(config.appId!==pkg)throw new Error('Wrong package ID: refuse native patch');
  const path=join('android','app','src','main','java',...pkg.split('.'),'MainActivity.java');
  if(!existsSync(path))throw new Error('Generated isolated MainActivity missing');
  const original=readFileSync(path,'utf8');
  if(!/extends BridgeActivity/.test(original) || !original.includes('package '+pkg+';'))
    throw new Error('Unexpected generated native activity, refuse patch');
  const java=`package ${pkg};

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getBridge().getWebView().addJavascriptInterface(new ProofReporter(), "PasekaProofBridge");
  }
  public final class ProofReporter {
    @JavascriptInterface public void report(String report) {
      if (report == null || report.length() > 2048 ||
          !report.startsWith("{\\"proofVersion\\":1,") ||
          !report.contains("\\"cleanupAuthorized\\":false") ||
          !report.contains("\\"recognitionSucceeded\\":false")) return;
      // Test-only internal append-only results. No shared storage permissions.
      File target = new File(getFilesDir(), "paseka-two-mp4-proof.ndjson");
      if (target.exists() && target.length() > 65536) return;
      try (FileOutputStream out = new FileOutputStream(target, true)) {
        out.write((report+"\\n").getBytes(StandardCharsets.UTF_8));
        Log.i("PasekaTwoMp4Proof", report);
      } catch (Exception e) {
        Log.e("PasekaTwoMp4Proof","Cannot persist isolated diagnostic result",e);
      }
    }
  }
}
`;
  writeFileSync(path,java,'utf8');
  console.log('ISOLATED_PROOF_NATIVE_BRIDGE:',path);
}else throw new Error('Expected web or native stage');
