import {readFile,writeFile} from 'node:fs/promises';
const pkg='ru.paseka.journal.diagnostic.archivea08v1';
const base='android/app/src/main/java/'+pkg.replaceAll('.','/');
const mainFile=base+'/MainActivity.java';
const original=await readFile(mainFile,'utf8');
if(!original.includes('extends BridgeActivity')||!original.includes('package '+pkg+';'))
 throw Error('Unexpected generated MainActivity');
await writeFile(mainFile,`package ${pkg};
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(android.os.Bundle savedInstanceState) {
  registerPlugin(A08ProcessPlugin.class);
  super.onCreate(savedInstanceState);
 }
}
`);
await writeFile(base+'/A08ProcessPlugin.java',`package ${pkg};
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import android.content.SharedPreferences;
import android.os.Process;
import android.os.Handler;
import android.os.Looper;

@CapacitorPlugin(name="A08Process")
public class A08ProcessPlugin extends Plugin {
 private static final String EXPECTED="${pkg}";
 private static final String PREF="a08_synthetic_process_proof_v1";
 private boolean allowed() {return EXPECTED.equals(getContext().getPackageName());}
 private boolean valid(String v) {return v!=null && v.matches("[0-9a-f]{32}");}
 @PluginMethod public void killSelf(PluginCall call) {
  String nonce=call.getString("nonce");
  if(!allowed()||!valid(nonce)){call.reject("A08_INVALID_PACKAGE_OR_NONCE");return;}
  final int pid=Process.myPid();
  SharedPreferences pref=getContext().getSharedPreferences(PREF,0);
  boolean stored=pref.edit().putString("nonce",nonce).putInt("pid",pid).commit();
  if(!stored){call.reject("A08_PROOF_COMMIT_FAILED");return;}
  call.resolve();
  new Handler(Looper.getMainLooper()).postDelayed(()->{
   if(allowed() && Process.myPid()==pid)Process.killProcess(pid);
  },250);
 }
 @PluginMethod public void readProof(PluginCall call) {
  String nonce=call.getString("nonce");
  if(!allowed()||!valid(nonce)){call.reject("A08_INVALID_PACKAGE_OR_NONCE");return;}
  SharedPreferences pref=getContext().getSharedPreferences(PREF,0);
  boolean matched=nonce.equals(pref.getString("nonce",""));
  int previous=pref.getInt("pid",-1);
  boolean changed=previous>0 && previous!=Process.myPid();
  JSObject result=new JSObject();
  result.put("nonceMatched",matched);
  result.put("processChanged",changed);
  result.put("observed",matched && changed);
  call.resolve(result);
 }
}
`);
console.log('Isolated synthetic A08 bridge registered: '+pkg);
