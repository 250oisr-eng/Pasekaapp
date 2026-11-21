// Separate test-only Android package. Run only in clean CI checkout.
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
const PKG='ru.paseka.journal.diagnostic.selftest';
if(process.env.PASEKA_SELF_DIAG_BUILD!=='1')throw Error('SELF_DIAG_BUILD_NOT_AUTHORIZED');
if(process.argv[2]!=='web')throw Error('EXPECTED_WEB_MODE');
if(!existsSync('www/index.html'))throw Error('WEB_ASSETS_REQUIRED');
const config=JSON.parse(readFileSync('capacitor.config.json','utf8'));
if(config.appId!=='ru.paseka.journal')throw Error('ORIGINAL_APP_ID_REQUIRED');
config.appId=PKG;
config.appName='Пасека — тест диагностики';
writeFileSync('capacitor.config.json',JSON.stringify(config,null,2)+'\n');
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Пасека — безопасная диагностика</title>
<style>body{font:16px system-ui;background:#f6f7f5;color:#182d1f;max-width:650px;margin:25px auto;padding:12px}
button{font:inherit;padding:16px;border:0;border-radius:10px;background:#226448;color:white;width:100%}
button:disabled{opacity:.6}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:16px;border-radius:10px}</style>
</head><body><h1>Диагностика Пасеки</h1><p>Только отдельный тестовый пакет и собственная IndexedDB.
Создаются две синтетические записи; реальные видео не читаются и не удаляются. Повторный запуск блокируется.</p>
<button type="button" id="run-diagnostics">Проверить тестовое хранилище</button>
<pre id="diagnostic-result" aria-live="polite">Проверка ещё не запускалась.</pre>
<script src="./android-self-diagnostic.js"></script></body></html>`;
writeFileSync('www/index.html',html);
copyFileSync('tests/fixtures/android-self-diagnostic.js','www/android-self-diagnostic.js');
console.log('SELF_DIAGNOSTIC_TEST_ONLY_PACKAGE',PKG);
