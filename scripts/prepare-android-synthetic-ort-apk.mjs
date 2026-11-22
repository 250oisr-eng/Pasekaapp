// Generate test-only WebView assets from a fresh CI checkout; no production code modified.
import {readFileSync,writeFileSync,copyFileSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {SYNTHETIC_ONNX} from './generate-synthetic-onnx.mjs';
const PKG='ru.paseka.journal.diagnostic.ortsmoke';
if(process.env.PASEKA_SYNTHETIC_ORT_BUILD!=='1')throw Error('ORT_TEST_BUILD_NOT_AUTHORIZED');
if(process.argv[2]!=='web')throw Error('EXPECTED_WEB_MODE');
if(!existsSync('www/index.html'))throw Error('WEB_ASSETS_REQUIRED');
const conf=JSON.parse(readFileSync('capacitor.config.json','utf8'));
if(conf.appId!=='ru.paseka.journal')throw Error('ORIGINAL_APP_ID_REQUIRED');
conf.appId=PKG;conf.appName='Пасека — тест ONNX';
writeFileSync('capacitor.config.json',JSON.stringify(conf,null,2)+'\n');
const dist='node_modules/onnxruntime-web/dist';
for(const name of ['ort.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']){
 const from=join(dist,name);
 if(!existsSync(from)||statSync(from).size<100)throw Error('OFFLINE_RUNTIME_ASSET_MISSING_'+name);
 copyFileSync(from,join('www',name));
}
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Пасека — локальный ONNX WASM</title>
<style>body{font:16px system-ui;max-width:650px;margin:24px auto;padding:12px;background:#f6f7f5;color:#182d1f}
button{font:inherit;padding:15px;width:100%;border:0;border-radius:8px;background:#226448;color:white}button:disabled{opacity:.65}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:16px;border-radius:8px}</style>
</head><body><h1>Диагностика ONNX</h1>
<p>Только собственная синтетическая модель: 3 + 2 = 5. Нет нейросети пчёл, доступа к видео, загрузок из интернета, сохранения или удаления.</p>
<button id="run-ort-diagnostic" type="button">Проверить локальный ONNX</button>
<pre id="diagnostic-result" aria-live="polite">Не запускалось.</pre>
<script src="./ort.min.js"></script>
<script src="./android-synthetic-ort-runner.js"></script></body></html>`;
writeFileSync('www/index.html',html);
writeFileSync('www/synthetic-add.onnx',SYNTHETIC_ONNX);
copyFileSync('tests/fixtures/android-synthetic-ort-runner.js','www/android-synthetic-ort-runner.js');
console.log('SYNTHETIC_ORT_TEST_ONLY_PACKAGE',PKG,'MODEL_BYTES',SYNTHETIC_ONNX.length);
