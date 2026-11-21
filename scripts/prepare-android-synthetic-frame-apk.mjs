// Generate only a separate test APK in a fresh CI checkout; never patch deployed production.
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
const PKG='ru.paseka.journal.diagnostic.frametest';
if(process.env.PASEKA_FRAME_TEST_BUILD!=='1')throw Error('FRAME_TEST_BUILD_NOT_AUTHORIZED');
if(process.argv[2]!=='web')throw Error('EXPECTED_WEB_MODE');
if(!existsSync('www/index.html'))throw Error('WEB_ASSETS_REQUIRED');
const config=JSON.parse(readFileSync('capacitor.config.json','utf8'));
if(config.appId!=='ru.paseka.journal')throw Error('ORIGINAL_APP_ID_REQUIRED');
config.appId=PKG;config.appName='Пасека — тест кадров';
writeFileSync('capacitor.config.json',JSON.stringify(config,null,2)+'\n');
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Пасека — изолированное извлечение кадров</title>
<style>body{font:16px system-ui;max-width:650px;margin:24px auto;padding:12px;background:#f6f7f5;color:#182d1f}
button{font:inherit;padding:15px;width:100%;border:0;border-radius:8px;background:#226448;color:white}button:disabled{opacity:.65}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:16px;border-radius:8px}</style>
</head><body><h1>Диагностика кадров</h1>
<p>Только встроенный синтетический чёрный MP4. Извлечём три временных JPEG кадра.
Нет модели распознавания, внешних записей, сохранения и удаления.</p>
<button id="run-frame-diagnostic" type="button">Проверить извлечение кадров</button>
<pre id="diagnostic-result" aria-live="polite">Не запускалось.</pre>
<script src="./entrance-frame-preparation.js"></script>
<script type="module" src="./android-synthetic-frame-extraction-runner.js"></script></body></html>`;
writeFileSync('www/index.html',html);
copyFileSync('js/entrance-frame-preparation.js','www/entrance-frame-preparation.js');
copyFileSync('tests/fixtures/android-synthetic-mp4.js','www/android-synthetic-mp4.js');
copyFileSync('tests/fixtures/android-synthetic-frame-extraction-runner.js','www/android-synthetic-frame-extraction-runner.js');
console.log('SYNTHETIC_FRAME_TEST_ONLY_PACKAGE',PKG);
