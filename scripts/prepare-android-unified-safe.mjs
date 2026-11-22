import {readFile,writeFile,mkdir,rm,copyFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {SYNTHETIC_ONNX} from './generate-synthetic-onnx.mjs';
if(process.env.PASEKA_UNIFIED_SAFE_BUILD!=='1')throw Error('UNIFIED_DIAGNOSTIC_BUILD_NOT_AUTHORIZED');
const file='capacitor.config.json';
const config=JSON.parse(await readFile(file,'utf8'));
if(config.appId!=='ru.paseka.journal')throw Error('PRODUCTION_PACKAGE_ID_GUARD');
config.appId='ru.paseka.journal.diagnostic.allchecks';
config.appName='Пасека — все безопасные тесты';
await writeFile(file,JSON.stringify(config,null,2)+'\n');
await rm('www',{recursive:true,force:true});
await mkdir('www',{recursive:true});
for(const filename of ['index.html','runner.js','synthetic-mp4.js','frame-preparation.js','archive-guard.js']){
 await copyFile('diagnostics/phone-all/'+filename,'www/'+filename);
}
for(const filename of ['ort.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']){
 const source=join('node_modules/onnxruntime-web/dist',filename);
 if((await stat(source)).size<1000)throw Error('MISSING_LOCAL_ORT_FILE_'+filename);
 await copyFile(source,'www/'+filename);
}
if(SYNTHETIC_ONNX.length<50||SYNTHETIC_ONNX.length>500)throw Error('SYNTHETIC_MODEL_INVALID');
await writeFile('www/synthetic-add.onnx',SYNTHETIC_ONNX);
console.log('UNIFIED_DIAGNOSTIC_ISOLATED',config.appId,'ASSETS',9,'MODEL_BYTES',SYNTHETIC_ONNX.length);
