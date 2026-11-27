'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const root=resolve(__dirname,'../..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.css':'text/css'};
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const target=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!target.startsWith(root+sep)||!mime[extname(target)]){res.writeHead(403);res.end();return}
  res.writeHead(200,{'Content-Type':mime[extname(target)],'Cache-Control':'no-store'});
  res.end(await readFile(target));
 }catch{res.writeHead(404);res.end()}
});
const listen=()=>new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const close=()=>new Promise(ok=>server.close(ok));
async function journey(browser,origin,label,viewport){
 const context=await browser.newContext({viewport,acceptDownloads:true,serviceWorkers:'block',locale:'ru-RU'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[];
 page.setDefaultTimeout(15000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',async dialog=>{
  if(dialog.type()==='confirm'&&/первый запуск новой пасеки/.test(dialog.message()))return dialog.accept();
  if(dialog.type()==='alert'&&/нет корпусов для CSV/.test(dialog.message()))return dialog.accept();
  errors.push('Unexpected dialog: '+dialog.type()+' '+dialog.message().slice(0,100));
  await dialog.dismiss();
 });
 try{
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{try{return startupWriteGate.ready===true}catch{return false}},{timeout:30000});
  assert.equal(await page.evaluate(()=>S.hives.length),0);
  await page.locator('button[data-tab="hives"]').click();
  await page.locator('[data-action="open-new-hive"]').click();
  await page.locator('#hiveDlg').waitFor({state:'visible'});
  await page.locator('#hiveForm button.primary').click();
  await page.locator('#hiveDlg').waitFor({state:'hidden'});
  await page.locator('button[data-tab="settings"]').click();
  await page.locator('#settings').getByRole('button',{name:'Открыть инвентарь'}).click();
  const dlg=page.locator('#equipmentInventoryDlg');
  await dlg.waitFor({state:'visible'});
  async function addStock(location,note){
   await page.locator('#inventoryStoragePlace').fill(location);
   await page.locator('#inventoryStockNotes').fill(note);
   await page.getByRole('button',{name:'Зарегистрировать на складе'}).click();
   await page.waitForFunction(loc=>Object.values(S.equipmentInventory?.bodies||{}).some(x=>x.storageLocation===loc),location);
  }
  await addStock('QA Полка A','=2+2');
  await addStock('QA Полка B','Обычный корпус');
  const records=await page.evaluate(()=>Object.values(S.equipmentInventory.bodies).filter(x=>x.storageLocation?.startsWith('QA Полка')).map(x=>({id:x.id,place:x.storageLocation})));
  assert.equal(records.length,2);
  const a=records.find(x=>x.place.endsWith('A')),b=records.find(x=>x.place.endsWith('B'));
  assert.ok(a&&b&&a.id!==b.id);
  // Real UI selection and CSV download; no test-only injection into app state.
  await page.locator('#inventorySearch').fill('QA Полка A');
  await page.waitForFunction(()=>/^Показано: 1 из \d+/.test(document.querySelector('#inventoryFilterResult')?.textContent||''));
  assert.equal(await page.locator('#equipmentInventoryContent [data-inventory-body]:visible').count(),1);
  const before=await page.evaluate(()=>JSON.stringify(S.equipmentInventory));
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'Скачать CSV по фильтрам'}).click();
  const download=await downloading;
  assert.match(download.suggestedFilename(),/^paseka-inventory-\d{4}-\d{2}-\d{2}-\d+\.csv$/);
  const csv=await readFile(await download.path(),'utf8');
  assert.match(csv,/^\uFEFF"Код корпуса";"Тип";"Состояние";/);
  assert.ok(csv.includes(a.id),'selected body missing');
  assert.ok(!csv.includes(b.id),'hidden body leaked to CSV');
  assert.ok(csv.includes('"\'=2+2"'),'formula must be neutralized');
  assert.ok(!csv.includes('"Обычный корпус"'),'other body notes leaked');
  assert.equal(await page.evaluate(()=>JSON.stringify(S.equipmentInventory)),before,'CSV mutated inventory state');
  // Download works offline even if network is unavailable.
  await context.setOffline(true);
  await page.locator('#inventorySearch').fill('QA Полка B');
  const offlinePromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Скачать CSV по фильтрам'}).click();
  const offline=await offlinePromise;
  const offlineCsv=await readFile(await offline.path(),'utf8');
  assert.ok(offlineCsv.includes(b.id)&&!offlineCsv.includes(a.id));
  assert.equal(await page.evaluate(()=>JSON.stringify(S.equipmentInventory)),before);
  await page.locator('#inventorySearch').fill('QA_NO_SUCH_BODY');
  await page.getByRole('button',{name:'Скачать CSV по фильтрам'}).click();
  assert.equal(await page.evaluate(()=>JSON.stringify(S.equipmentInventory)),before,'empty export changed inventory');
  assert.deepEqual(errors,[]);
  process.stdout.write(JSON.stringify({scenario:'inventory-filtered-csv-offline',viewport:label,status:'PASS',source:'SYNTHETIC_BROWSER_ONLY',rows:2,onlineSelected:1,offlineSelected:1,device:'NOT_TESTED'})+'\n');
 }catch(error){
  process.stderr.write(JSON.stringify({scenario:'inventory-filtered-csv-offline',viewport:label,status:'FAIL',reason:error.message,errors})+'\n');
  try{await page.screenshot({path:'inventory-csv-'+label+'-failure.png',fullPage:true})}catch{}
  throw error;
 }finally{await context.close()}
}
(async()=>{
 await listen();
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  await journey(browser,origin,'mobile',{width:390,height:844});
  await journey(browser,origin,'desktop',{width:1366,height:900});
 }finally{await browser.close();await close()}
})().catch(error=>{console.error(error);process.exitCode=1});
