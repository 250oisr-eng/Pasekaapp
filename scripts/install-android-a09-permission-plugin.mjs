import {readFile,writeFile} from 'node:fs/promises';
const pkg='ru.paseka.journal.diagnostic.archivea09v1';
const base='android/app/src/main/java/'+pkg.replaceAll('.','/');
const main=base+'/MainActivity.java';
const orig=await readFile(main,'utf8');
if(!orig.includes('extends BridgeActivity') || !orig.includes('package '+pkg+';'))throw Error('Unexpected generated Android MainActivity');
await writeFile(main,`package ${pkg};
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(android.os.Bundle savedInstanceState) {
  registerPlugin(A09PermissionsPlugin.class);
  super.onCreate(savedInstanceState);
 }
}
`);
await writeFile(base+'/A09PermissionsPlugin.java',`package ${pkg};
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Process;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name="A09Permissions")
public class A09PermissionsPlugin extends Plugin {
 private static final String EXPECTED="${pkg}";
 @PluginMethod public void inspectOwnPackage(PluginCall call) {
  try {
   Context ctx=getContext();
   String name=ctx.getPackageName();
   if(!EXPECTED.equals(name)){call.reject("PACKAGE_MISMATCH");return;}
   PackageManager pm=ctx.getPackageManager();
   // Only our own package: no query-all-packages or external app enumeration.
   PackageInfo info=pm.getPackageInfo(name,PackageManager.GET_PERMISSIONS);
   if(info==null || info.applicationInfo==null || info.applicationInfo.uid!=Process.myUid()) {
    call.reject("PACKAGE_IDENTITY_INCONSISTENT");return;
   }
   String[] names=info.requestedPermissions;
   int[] flags=info.requestedPermissionsFlags;
   if(names==null && flags==null) {
    names=new String[0];
    flags=new int[0];
   }
   if(names==null || flags==null || names.length!=flags.length) {
    call.reject("PERMISSION_ARRAY_INCOMPLETE");return;
   }
   JSONArray entries=new JSONArray();
   for(int i=0;i<names.length;i++) {
    String permission=names[i];
    if(permission==null || permission.isEmpty()) {call.reject("EMPTY_PERMISSION_NAME");return;}
    JSONObject entry=new JSONObject();
    entry.put("name",permission);
    entry.put("granted",pm.checkPermission(permission,name)==PackageManager.PERMISSION_GRANTED);
    entry.put("requestedGrantedFlag",(flags[i] & PackageInfo.REQUESTED_PERMISSION_GRANTED)!=0);
    entries.put(entry);
   }
   JSObject result=new JSObject();
   result.put("packageId",name);
   result.put("uidMatchesProcess",true);
   result.put("source","ANDROID_PACKAGE_MANAGER_INSTALLED_OWN_PACKAGE");
   result.put("requestedPermissions",entries);
   call.resolve(result);
  } catch(Exception e) {
   call.reject("PACKAGE_MANAGER_AUDIT_FAILED");
  }
 }
}
`);
console.log('Isolated own-package PackageManager plugin registered for '+pkg);
