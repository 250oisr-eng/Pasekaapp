'use strict';
// Disposable real-Chromium/IndexedDB journey for non-video accounting.
// No access to user files, production endpoints, Android packages or actual hive state.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const root=resolve(__dirname,'../..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json',
 '.svg':'image/svg+xml','.css':'text/css; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep)||!mime[extname(file)]){res.writeHead(403);res.end();return}
  res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store'});
  res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Not found')}
});
const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const close=()=>new Promise(resolve=>server.close(resolve));
async function journey(browser,origin){
 const context=await browser.newContext({viewport:{width:412,height:915},locale:'ru-RU',timezoneId:'UTC',serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[],expectedAlerts=[];
 page.setDefaultTimeout(20000);
 await page.clock.setFixedTime(new Date('2026-11-27T12:00:00Z'));
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',async dialog=>{
  const message=dialog.message();
  if(dialog.type()==='confirm'&&message.endsWith('Подтверждаешь, что это действительно первый запуск новой пасеки?'))return dialog.accept();
  if(dialog.type()==='alert'&&/Дата фактического ввода матки не может быть в будущем/.test(message)){
   expectedAlerts.push(message);return dialog.accept();
  }
  errors.push('Unexpected dialog: '+dialog.type()+' '+message.slice(0,120));
  await dialog.dismiss();
 });
 const ready=()=>page.waitForFunction(()=>{try{return startupWriteGate.ready===true}catch{return false}},{},{timeout:30000});
 const read=()=>page.evaluate(()=>{
  const hive=S.hives[0],family=S.families[0],layout=S.layouts[hive.id];
  return {hives:S.hives.map(h=>h.id),family:{id:family.id,hive:family.hive,currentQueenId:family.currentQueenId},
   queens:S.queens.map(q=>({id:q.id,familyId:q.familyId,code:q.code,status:q.status})).sort((a,b)=>a.code.localeCompare(b.code)),
   queenEvents:S.queenEvents.map(e=>({type:e.type,queenId:e.queenId,previousQueenId:e.previousQueenId||null,date:e.date})),
   journal:S.records.filter(r=>String(r.text||'').includes('QA-ACCOUNTING-')).map(r=>({id:r.id,type:r.type,date:r.date,hive:r.hive,family:r.family,text:r.text,feedingAmount:r.feedingAmount||''})).sort((a,b)=>a.type.localeCompare(b.type)),
   inventory:Object.values(S.equipmentInventory?.bodies||{}).map(b=>({id:b.id,kind:b.kind,storageLocation:b.storageLocation,condition:b.condition})).sort((a,b)=>a.id.localeCompare(b.id)),
   layout:{mode:layout.mode,installedBoxes:layout.installedBoxes,honeyBoxInstalled:layout.honeyBoxInstalled,setupComplete:layout.setupComplete},
   audit:S.auditLog?.length||0};
 });
 try{
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});await ready();
  assert.equal(await page.evaluate(()=>S.hives.length),0,'fresh disposable database');
  await page.locator('button[data-tab="hives"]').click();
  await page.locator('[data-action="open-new-hive"]').click();
  await page.locator('#hiveForm button.primary').click();
  await page.locator('#hiveDlg').waitFor({state:'hidden'});
  await page.locator('#selectedHivePanel').getByRole('button',{name:'＋ Семья'}).click();
  await page.locator('#familyOrigin').selectOption('family');
  await page.locator('#familyForm button.primary').click();
  await page.locator('#familyDlg').waitFor({state:'hidden'});
  const ids=await page.evaluate(()=>({h:S.hives[0].id,f:S.families[0].id}));
  assert.ok(ids.h&&ids.f);
  // Queen: actual UI form first registration, negative future replacement, valid replacement.
  await page.evaluate(()=>openQueenForm(S.families[0].id));
  await page.locator('#queenCodeInput').fill('QA-Q-OLD');
  await page.locator('#queenEventDate').fill('2026-11-12');
  await page.locator('#queenForm button.primary').click();
  await page.locator('#queenDlg').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>S.queens.length),1);
  await page.evaluate(()=>openQueenForm(S.families[0].id));
  await page.locator('#queenReplacementBtn').click();
  await page.locator('#queenCodeInput').fill('QA-Q-NEW');
  await page.locator('#queenEventDate').fill('2099-12-31');
  await page.locator('#queenForm button.primary').click();
  assert.equal(await page.locator('#queenDlg').isVisible(),true,'invalid future date must leave draft open');
  assert.equal(await page.evaluate(()=>S.queens.length),1,'future event cannot replace queen');
  assert.equal(expectedAlerts.length,1);
  await page.locator('#queenEventDate').fill('2026-11-14');
  await page.locator('#queenForm button.primary').click();
  await page.locator('#queenDlg').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>S.queens.filter(q=>q.status==='replaced').length),1);
  // Real journal forms: feeding + inspection with explicit family selection.
  await page.locator('button[data-tab="journal"]').click();
  for(const entry of [{type:'Подкормка',date:'2026-11-15',text:'QA-ACCOUNTING-FEED',amount:'150 г'},
                     {type:'Осмотр',date:'2026-11-16',text:'QA-ACCOUNTING-INSPECTION'}]){
   await page.locator('#journal').getByRole('button',{name:'＋ Запись'}).click();
   await page.locator('#recordDlg').waitFor({state:'visible'});
   await page.locator('#rtype').selectOption({label:entry.type});
   await page.locator('#rdate').fill(entry.date);
   await page.locator('#rfamily').selectOption(ids.f);
   await page.locator('#rtext').fill(entry.text);
   if(entry.amount){
    await page.locator('#rfeedingType').fill('Сироп');
    await page.locator('#rfeedingAmount').fill(entry.amount);
   }
   await page.locator('#recordForm button.primary').click();
   await page.locator('#recordDlg').waitFor({state:'hidden'});
  }
  assert.match(await page.locator('#feedingLedgerContent').textContent(),/150\s*г/);
  const ledger=await page.evaluate((h)=>buildFeedingLedger(S.records,S.families,h),ids.h);
  assert.equal(ledger.find(g=>g.familyId===ids.f).totals.find(t=>t.unit==='г').amount,150);
  await page.locator('button[data-tab="planning"]').click();
  await page.locator('#inspectionHiveSelect').selectOption(ids.h);
  await page.locator('button[onclick="useLastSavedInspection()"]').click();
  assert.equal(await page.locator('#inspectionLastDate').inputValue(),'2026-11-16',
    'planned inspection date must use actually saved record');
  // Inventory: create one physical body on storage, never manufacture two on a brood action.
  await page.locator('button[data-tab="settings"]').click();
  await page.evaluate(()=>openEquipmentInventory());
  await page.locator('#equipmentInventoryDlg').waitFor({state:'visible'});
  await page.locator('#inventoryTemplateHive').selectOption(ids.h);
  await page.locator('#inventoryStockKind').selectOption('brood');
  await page.locator('#inventoryStoragePlace').fill('QA-СКЛАД');
  await page.locator('#equipmentInventoryDlg').getByRole('button',{name:'Зарегистрировать на складе'}).click();
  await page.waitForFunction(()=>Object.keys(S.equipmentInventory?.bodies||{}).length===1);
  assert.equal(await page.evaluate(()=>Object.values(S.equipmentInventory.bodies)[0].storageLocation),'QA-СКЛАД');
  await page.evaluate(()=>document.getElementById('equipmentInventoryDlg').close());
  // Hive assembly confirmation: physically meaningful 'Done' is committed before showing success.
  await page.locator('button[data-tab="hives"]').click();
  await page.locator('.hive-row-main').first().click();
  await page.locator('#assemblyMode').selectOption('winter');
  await page.locator('#assemblyDoneBtn').click();
  await page.waitForFunction(()=>S.layouts[S.hives[0].id].setupComplete===true);
  assert.deepEqual(await page.evaluate(()=>S.layouts[S.hives[0].id].honeyBoxInstalled),[false,false]);
  const before=await read();
  assert.equal(before.queens.length,2);
  assert.equal(before.queenEvents.length,2);
  assert.equal(before.journal.length,2);
  assert.equal(before.inventory.length,1);
  assert.equal(before.layout.mode,'winter');
  await page.evaluate(()=>saveQueue);
  await page.reload({waitUntil:'domcontentloaded'});await ready();
  const after=await read();
  assert.deepEqual(after,before,'verified accounting objects changed after real IndexedDB reload');
  assert.deepEqual(errors,[],'unexpected browser error or confirmation');
  console.log(JSON.stringify({scenario:'accounting-queen-feeding-inspection-inventory-winter-reload',
   status:'PASS',source:'Chromium real IndexedDB synthetic only',qaFamilyId:ids.f,
   device:'NOT_TESTED',productionData:'NOT_ACCESSED'}));
 }catch(e){
  await page.screenshot({path:'e2e-accounting-synthetic-failure.png',fullPage:true}).catch(()=>{});
  console.error(JSON.stringify({scenario:'accounting-queen-feeding-inspection-inventory-winter-reload',
   status:'FAIL',reason:e.message,errors,expectedAlerts}));
  throw e;
 }finally{await context.close()}
}
(async()=>{await listen();let browser;
 try{browser=await chromium.launch({headless:true});await journey(browser,'http://127.0.0.1:'+server.address().port);}
 finally{if(browser)await browser.close();await close()}
})().catch(error=>{console.error(error.stack||String(error));process.exitCode=1});
