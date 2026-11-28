import {prepareDailyWorkerWeb} from './prepare-android-daily-archives.mjs';
import {mkdir,copyFile,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const isolatedModules=new Set(['sectional-op02-feeding.js']);

export async function prepareWebAssets(workspace='.') {
  const [html,sw]=await Promise.all([
    readFile(join(workspace,'index.html'),'utf8'),
    readFile(join(workspace,'sw.js'),'utf8')
  ]);
  const scriptTagCount=[...html.matchAll(/<script\b[^>]*\bsrc\s*=/gi)].length;
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)].map(match=>match[2]);
  if(!scripts.length||scriptTagCount!==scripts.length||new Set(scripts).size!==scripts.length||
     scripts.some(path=>!/^\.\/js\/[a-z0-9._-]+\.js$/.test(path)))
    throw Error('WEB_ASSETS_BLOCKED: unexpected, duplicate or unsafe script source');
  const manifest=sw.match(/const FILES=\[([^\]]+)\];/);
  if(!manifest)throw Error('WEB_ASSETS_BLOCKED: offline manifest missing');
  const cached=new Set([...manifest[1].matchAll(/'([^']+)'/g)].map(match=>match[1]));
  if(scripts.some(path=>!cached.has(path)))
    throw Error('WEB_ASSETS_BLOCKED: active script absent from offline manifest');
  const sourceNames=(await readdir(join(workspace,'js'))).filter(name=>name.endsWith('.js'));
  const selected=new Set(scripts.map(path=>path.slice('./js/'.length)));
  const unexpected=sourceNames.filter(name=>!selected.has(name)&&!isolatedModules.has(name));
  if(unexpected.length||[...isolatedModules].some(name=>!sourceNames.includes(name)))
    throw Error('WEB_ASSETS_BLOCKED: unclassified or missing isolated module: '+unexpected.join(', '));
  // Preflight every required script before replacing generated build output.
  await Promise.all(scripts.map(path=>readFile(join(workspace,path))));
  const web=join(workspace,'www'),generatedJs=join(web,'js');
  await mkdir(join(web,'icons'),{recursive:true});
  for(const file of ['index.html','manifest.webmanifest','sw.js'])
    await copyFile(join(workspace,file),join(web,file));
  await copyFile(join(workspace,'icons','paseka.svg'),join(web,'icons','paseka.svg'));
  // www/js is generated runtime output, not a user-data directory.
  await rm(generatedJs,{recursive:true,force:true});
  await mkdir(generatedJs,{recursive:true});
  for(const path of scripts)await copyFile(join(workspace,path),join(workspace,'www',path));
  return scripts;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await prepareWebAssets();
  await prepareDailyWorkerWeb();
}
