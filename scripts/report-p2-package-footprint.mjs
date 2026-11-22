import {readdir, stat} from "node:fs/promises";

async function entries(dir){
  return (await readdir(dir,{withFileTypes:true}))
    .filter(item=>item.isFile()&&item.name.endsWith(".js"))
    .map(item=>item.name)
    .sort();
}
async function total(dir,names){
  let bytes=0;
  for(const name of names)bytes+=(await stat(`${dir}/${name}`)).size;
  return bytes;
}
const generated=await entries("www/js");
const source=await entries("js");
const omitted=source.filter(name=>!generated.includes(name));
if(generated.length===0||generated.some(name=>!source.includes(name))) {
  throw new Error("Unexpected Android runtime JS asset set");
}
const bytes=await total("www/js",generated);
const originalBytes=await total("js",source);
const apk=await stat("android/app/build/outputs/apk/debug/app-debug.apk");
if(apk.size<=0)throw new Error("Android debug APK missing or empty");
console.log("P2_APK_BYTES="+apk.size);
console.log("P2_RUNTIME_JS_BYTES="+bytes);
console.log("P2_SOURCE_JS_BYTES="+originalBytes);
console.log("P2_OMITTED_ISOLATED_JS_BYTES="+(originalBytes-bytes));
console.log("P2_PACKAGED_JS_COUNT="+generated.length);
console.log("P2_SOURCE_JS_COUNT="+source.length);
console.log("P2_OMITTED_JS="+omitted.join(","));
