// Build only a new isolated test package. No changes to installed diagnostics.
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
const PKG='ru.paseka.journal.diagnostic.mediatest';
if(process.env.PASEKA_SYNTHETIC_MEDIA_BUILD!=='1')throw Error('SYNTHETIC_MEDIA_BUILD_NOT_AUTHORIZED');
if(process.argv[2]!=='web')throw Error('EXPECTED_WEB_MODE');
if(!existsSync('www/index.html'))throw Error('WEB_ASSETS_REQUIRED');
const config=JSON.parse(readFileSync('capacitor.config.json','utf8'));
if(config.appId!=='ru.paseka.journal')throw Error('ORIGINAL_APP_ID_REQUIRED');
config.appId=PKG;config.appName='Пасека — тест MP4';
writeFileSync('capacitor.config.json',JSON.stringify(config,null,2)+'\n');
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Пасека — изолированный тест MP4</title>
<style>body{font:16px system-ui;margin:20px;background:#f6f7f5;color:#182d1f}button{font:inherit;padding:15px;width:100%;border:0;border-radius:8px;background:#226448;color:white}button:disabled{opacity:.6}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:14px;border-radius:8px}video{width:90px;height:90px;background:black}</style>
</head><body><h1>Диагностика видео</h1><p>Только встроенный синтетический чёрный MP4. Ни одного видео пасеки не читаем и не удаляем.</p>
<button id="run-media-diagnostic" type="button">Проверить декодирование MP4</button><p><video id="synthetic-player" muted playsinline></video></p>
<pre id="diagnostic-result" aria-live="polite">Не запускалось.</pre>
<script type="module" src="./android-synthetic-mp4-runner.js"></script></body></html>`;
writeFileSync('www/index.html',html);
copyFileSync('tests/fixtures/android-synthetic-mp4.js','www/android-synthetic-mp4.js');
copyFileSync('tests/fixtures/android-synthetic-mp4-runner.js','www/android-synthetic-mp4-runner.js');
console.log('SYNTHETIC_MP4_TEST_ONLY_PACKAGE',PKG);
