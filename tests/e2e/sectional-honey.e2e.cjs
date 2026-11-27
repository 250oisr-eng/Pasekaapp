'use strict';
// Entirely synthetic, localhost-only Chromium and IndexedDB acceptance.
// The normal application remains compiled with SECTIONAL_HONEY_QA_WRITE_ENABLED=false.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const root=resolve(__dirname,'../..');
const gate='const SECTIONAL_HONEY_QA_WRITE_ENABLED=false;';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.css':'text/css'};
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep)||!mime[extname(file)]){res.writeHead(403);res.end();return}
  let source=await readFile(file);
  if(file===resolve(root,'index.html')){
   const html=source.toString('utf8');
   assert.equal(html.split(gate).length,2,'production gate must remain false');
   source=html.replace(gate,'const SECTIONAL_HONEY_QA_WRITE_ENABLED=true;');
  }
  res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store'});res.end(source);
 }catch(e){res.writeHead(500);res.end('Synthetic test server error');console.error(e.message)}
});
async function journey(browser,origin){
 const context=await browser.newContext({viewport:{width:412,height:915},locale:'ru-RU',timezoneId:'UTC',serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[];
 page.setDefaultTimeout(20000);
 await page.clock.setFixedTime(new Date('2026-11-27T12:00:00Z'));
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',async dialog=>{
  if(dialog.type()==='confirm'&&dialog.message().endsWith('Подтверждаешь, что это действительно первый запуск новой пасеки?'))return dialog.accept();
  errors.push('Unexpected dialog: '+dialog.type()+' '+dialog.message());await dialog.dismiss();
 });
 const ready=()=>page.waitForFunction(()=>startupWriteGate.ready===true,null,{timeout:30000});
 const state=()=>page.evaluate(async()=>{
  const main=await readMain(),backup=await readAutoBackup();
  return {revision:main.meta.revisionId,backupRevision:backup?.state?.meta?.revisionId,bodyIds:main.sectionalLayouts[0]?.honeyStack?.bodyIds||[],covers:(main.sectionalLayouts[0]?.stacks||[]).flatMap(s=>[s.coverItemId,s.topRiserItemId]).filter(Boolean),extractions:main.extractions.map(e=>({id:e.id,items:e.items.map(i=>({boxes:i.boxes,frameIds:i.frameIds,kilograms:i.kilograms,sectional:i.sectional}))})),transitions:main.sectionalTechProcesses[0]?.state.honeyTransitions||[],legacy:main.layouts?.h1??null};
 });
 try{
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});await ready();
  const fixture=await readFile(resolve(root,'tests/sectional-honey-integration.test.mjs'),'utf8');
  const start=fixture.indexOf('const Labels=appWindow.'),end=fixture.indexOf('function extract(p,state');
  assert.ok(start>=0&&end>start,'shared synthetic fixture must be present');
  const source=fixture.slice(start,end);
  await page.evaluate(async source=>{
   if(S.hives.length||!SECTIONAL_HONEY_QA_WRITE_ENABLED)throw Error('test must start from a fresh isolated database');
   const p=new Function('appWindow','assert',source+'\nreturn setupFour();')(window,{equal(a,b,msg){if(a!==b)throw Error(msg)}});
   const fixture=p.fixture.state,previous=S.meta.revisionId;
   const candidate={...structuredClone(S),...fixture,meta:{...S.meta,...fixture.meta,revisionId:'sectional-qa-seed'}};
   candidate.hives[0].number=1;candidate.meta.nextHiveNumber=2;
   PasekaLabels.migrateFrameUids(candidate);
   const validation=sectionalHoneyValidate(candidate);
   if(validation.length)throw Error('Synthetic fixture fails actual validation: '+JSON.stringify(validation));
   await writeMainWithBackup(candidate,previous);
   S=candidate;lastPersistedRevision=candidate.meta.revisionId;
  },source);
  await page.reload({waitUntil:'domcontentloaded'});await ready();
  await page.evaluate(()=>openHive('h1'));
  const panel=page.locator('#hiveExtractionActions'),form=panel.locator('form');
  assert.match(await panel.textContent(),/Готово к откачке: 40 из 40/);
  assert.equal(await page.locator('#legacyExtractionButton').isVisible(),false);
  let before=await state();
  await form.locator('input[type=text]').fill('QA-СКЛАД');
  await form.locator('input[type=number]').fill('22');
  for(const [i,id] of ['cover1','riser1','cover2','riser2','cover3','riser3'].entries())await form.locator('select').nth(i).selectOption(id);
  await form.locator('input[type=checkbox]').check();
  await form.getByRole('button',{name:'Записать откачку'}).click();
  await page.waitForFunction(()=>S.extractions.length===1&&S.sectionalLayouts[0].honeyStack==null);
  const harvested=await state();
  assert.equal(harvested.backupRevision,before.revision);assert.equal(harvested.bodyIds.length,0);assert.equal(harvested.covers.length,6);
  assert.equal(harvested.extractions[0].items[0].frameIds.length,40);assert.equal(harvested.extractions[0].items[0].kilograms,22);assert.equal(harvested.legacy,null);
  await page.reload({waitUntil:'domcontentloaded'});await ready();await page.evaluate(()=>openHive('h1'));
  assert.deepEqual(await state(),harvested,'restart preserves actual IndexedDB state');
  await page.clock.setFixedTime(new Date('2026-11-28T12:00:00Z'));
  const install=panel.locator('form');
  await install.locator('input[type=text]').fill('QA-СКЛАД');
  await install.locator('select').nth(0).selectOption('2');
  await install.locator('select').nth(1).selectOption('main');
  await install.locator('select').nth(2).selectOption('honey1');
  await install.locator('select').nth(3).selectOption('honey3');
  await install.locator('select').nth(6).selectOption('ex-left');
  await install.locator('select').nth(7).selectOption('ex-right');
  await install.locator('input[type=checkbox]').check();
  await install.getByRole('button',{name:'Записать установку'}).click();
  await page.waitForFunction(()=>S.sectionalLayouts[0].honeyStack?.bodyIds?.length===2);
  const installed=await state();
  assert.equal(installed.backupRevision,harvested.revision);assert.deepEqual(installed.bodyIds,['honey1','honey3']);
  assert.equal(installed.extractions.length,1);assert.equal(installed.transitions.length,2);assert.equal(installed.legacy,null);
  await page.reload({waitUntil:'domcontentloaded'});await ready();await page.evaluate(()=>openHive('h1'));
  assert.deepEqual(await state(),installed);assert.deepEqual(errors,[]);
  console.log('PASS_SYNTHETIC B07 browser: actual screen 4→0→2, regroup, IndexedDB main+previous backup and reload');
 }catch(e){await page.screenshot({path:resolve(root,'e2e-sectional-synthetic-failure.png'),fullPage:true}).catch(()=>{});throw e}
 finally{await context.close()}
}
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 let browser;
 try{browser=await chromium.launch({headless:true});await journey(browser,'http://127.0.0.1:'+server.address().port);}
 finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(error=>{console.error(error);process.exitCode=1;});
