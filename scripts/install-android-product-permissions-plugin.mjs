import {readFile,writeFile} from 'node:fs/promises';
const pkg='ru.paseka.journal.diagnostic.productpermsv1';
const target='ru.paseka.journal';
const dir='android/app/src/main/java/'+pkg.replaceAll('.','/');
const main=dir+'/MainActivity.java';
const source=await readFile(main,'utf8');
if(!source.includes('extends BridgeActivity')||!source.includes('package '+pkg+';'))throw Error('MAIN_ACTIVITY_PACKAGE_MISMATCH');
await writeFile(main,`package ${pkg};
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(android.os.Bundle savedInstanceState) {
  registerPlugin(ProductPermissionsPlugin.class);
  super.onCreate(savedInstanceState);
 }
}
`);
const manifest='android/app/src/main/AndroidManifest.xml';
const xml=await readFile(manifest,'utf8');
if(!xml.includes('</manifest>')||xml.includes('<queries>'))throw Error('UNEXPECTED_MANIFEST_STATE');
const updated=xml.replace('</manifest>',`  <queries>
    <package android:name="${target}" />
  </queries>
</manifest>`);
await writeFile(manifest,updated);
await writeFile(dir+'/ProductPermissionsPlugin.java',`package ${pkg};
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

@CapacitorPlugin(name="ProductPermissions")
public class ProductPermissionsPlugin extends Plugin {
 private static final String DIAGNOSTIC="${pkg}";
 private static final String TARGET="${target}";
 @PluginMethod public void inspectTarget(PluginCall call) {
  Context ctx=getContext();
  if(!DIAGNOSTIC.equals(ctx.getPackageName()) || DIAGNOSTIC.equals(TARGET)) {
   call.reject("DIAGNOSTIC_PACKAGE_INVALID");return;
  }
  PackageManager pm=ctx.getPackageManager();
  try {
   // Exactly one explicitly declared package visibility query; no enumeration.
   PackageInfo info=pm.getPackageInfo(TARGET,PackageManager.GET_PERMISSIONS);
   if(info==null || !TARGET.equals(info.packageName) || info.applicationInfo==null ||
      info.applicationInfo.uid<=0 || info.applicationInfo.uid==Process.myUid()){
    call.reject("TARGET_PACKAGE_IDENTITY_INVALID");return;
   }
   String[] names=info.requestedPermissions;
   int[] flags=info.requestedPermissionsFlags;
   if(names==null && flags==null){names=new String[0];flags=new int[0];}
   if(names==null || flags==null || names.length!=flags.length){
    call.reject("TARGET_PERMISSION_ARRAY_INCOMPLETE");return;
   }
   JSONArray entries=new JSONArray();
   for(int i=0;i<names.length;i++){
    if(names[i]==null || names[i].isEmpty()){call.reject("TARGET_PERMISSION_INVALID");return;}
    JSONObject entry=new JSONObject();
    entry.put("name",names[i]);
    entry.put("granted",pm.checkPermission(names[i],TARGET)==PackageManager.PERMISSION_GRANTED);
    entry.put("requestedGrantedFlag",(flags[i] & PackageInfo.REQUESTED_PERMISSION_GRANTED)!=0);
    entries.put(entry);
   }
   JSObject result=new JSObject();
   result.put("targetPackageId",TARGET);
   result.put("source","ANDROID_PACKAGE_MANAGER_INSTALLED_EXPLICIT_TARGET");
   result.put("identityVerified",true);
   result.put("requestedPermissions",entries);
   result.put("versionName",info.versionName==null?"":info.versionName);
   result.put("versionCode",String.valueOf(info.versionCode));
   call.resolve(result);
  }catch(PackageManager.NameNotFoundException err){
   call.reject("PRODUCT_PACKAGE_NOT_INSTALLED_OR_NOT_VISIBLE");
  }catch(Exception err){
   call.reject("TARGET_PACKAGE_MANAGER_FAILED");
  }
 }
}
`);
console.log('Read-only ProductPermissions target allowlisted: '+target);
