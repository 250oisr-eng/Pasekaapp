import {readFile,writeFile,copyFile} from 'node:fs/promises';

const originalId='ru.paseka.journal';
const diagnosticId='ru.paseka.journal.p1smoke';
const configPath='capacitor.config.json',htmlPath='www/index.html';
const config=JSON.parse(await readFile(configPath,'utf8'));
if(config.appId!==originalId||config.webDir!=='www')
 throw Error('Unexpected app ID or webDir: refusing to create diagnostic APK');
config.appId=diagnosticId;
config.appName='Пасека · P1 Проверка TEST';
await writeFile(configPath,JSON.stringify(config,null,2)+'\n','utf8');

let html=await readFile(htmlPath,'utf8');
const marker='</body>';
const script='<script src="./p1-oneplus-smoke-meta.js"></script>\n'+
 '<script src="./p1-oneplus-smoke.js"></script>\n';
if(html.split(marker).length!==2||html.includes('p1-oneplus-smoke.js'))
 throw Error('Main document closing tag ambiguous or diagnostic already injected');
html=html.replace(marker,script+marker);
await writeFile(htmlPath,html,'utf8');
await copyFile('diagnostics/p1-oneplus-smoke/runner.js','www/p1-oneplus-smoke.js');

const sourceSha=process.env.P1_SOURCE_SHA||process.env.GITHUB_SHA||'UNVERIFIED_LOCAL';
if(sourceSha!=='UNVERIFIED_LOCAL'&&!/^[a-f0-9]{40}$/.test(sourceSha))
 throw Error('P1_SOURCE_SHA must be a full 40-character commit SHA');
const metadata=Object.freeze({
 schema:'paseka-p1-oneplus-isolated-smoke-v1',diagnosticId,originalId,
 sourceSha,buildPurpose:'TEST_ONLY_READ_ONLY_PHONE_SMOKE',
 noRealArchiveProof:true,noProductionInstall:true
});
await writeFile('www/p1-oneplus-smoke-meta.js',
 'window.PasekaP1SmokeBuild=Object.freeze('+JSON.stringify(metadata)+');\n','utf8');
if(!html.includes(script.trim())||config.appId===originalId)
 throw Error('Isolated diagnostic injection or package identity failed');
console.log('PASS: isolated P1 OnePlus diagnostic assets prepared for '+sourceSha);
