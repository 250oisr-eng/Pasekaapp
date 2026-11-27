'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,extname,sep}=require('node:path');
const root=resolve(__dirname,'../..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.css':'text/css; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+sep)||!mime[extname(file)]){res.writeHead(403);res.end();return}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store'});
    res.end(data);
  }catch{res.writeHead(404);res.end('Not found')}
});
const listen=()=>new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const close=()=>new Promise(ok=>server.close(ok));
async function journey(browser,origin,name,viewport){
  const context=await browser.newContext({viewport,locale:'ru-RU',serviceWorkers:'block'});
  const errors=[];
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.origin===origin?route.continue():route.abort();
  });
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push('Browser JS: '+e.message));
  let freshContext=true;
  page.on('dialog',async dialog=>{
    if(freshContext && dialog.type()==='confirm' && dialog.message().endsWith('Подтверждаешь, что это действительно первый запуск новой пасеки?')){
      freshContext=false;
      await dialog.accept();
      return;
    }
    errors.push('Unexpected '+dialog.type()+': '+dialog.message().slice(0,200));
    await dialog.dismiss();
  });
  const note='QA-SYNTHETIC-E2E-'+name;
  const ready=async()=>page.waitForFunction(()=>{
    try{return startupWriteGate.ready===true}catch{return false}
  },null,{timeout:30000});
  try{
    await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
    await ready();
    freshContext=false;
    assert.equal(await page.evaluate(()=>S.hives.length),0,'fresh browser is not empty');
    await page.locator('button[data-tab="hives"]').click();
    await page.locator('[data-action="open-new-hive"]').click();
    await page.locator('#hiveDlg').waitFor({state:'visible'});
    await page.locator('#hiveForm button.primary').click();
    await page.locator('#hiveDlg').waitFor({state:'hidden'});
    await page.locator('#selectedHivePanel').waitFor({state:'visible'});
    await page.locator('#selectedHivePanel').getByRole('button',{name:'＋ Семья'}).click();
    await page.locator('#familyDlg').waitFor({state:'visible'});
    await page.locator('#familyOrigin').selectOption('family');
    await page.locator('#familyForm button.primary').click();
    await page.locator('#familyDlg').waitFor({state:'hidden'});
    await page.locator('#selectedHivePanel').getByRole('button',{name:'Журнал',exact:true}).click();
    await page.locator('#journal').getByRole('button',{name:'＋ Запись'}).click();
    await page.locator('#recordDlg').waitFor({state:'visible'});
    await page.locator('#rtype').selectOption({label:'Осмотр'});
    assert.ok(await page.locator('#rfamily option').count()>=2,'new family not offered in journal');
    await page.locator('#rfamily').selectOption({index:1});
    await page.locator('#rtext').fill(note);
    await page.locator('#recordForm button.primary').click();
    await page.locator('#recordDlg').waitFor({state:'hidden'});
    assert.equal(await page.locator('#records .journal-entry').filter({hasText:note}).count(),1,
      'new inspection should be visible exactly once');
    // Two saved records have the same type, date, hive and search term.
    await page.locator('#journal').getByRole('button',{name:'＋ Запись'}).click();
    await page.locator('#rtype').selectOption({label:'Осмотр'});
    const secondText='Второй осмотр · '+note;
    await page.locator('#rtext').fill(secondText);
    await page.locator('#recordForm button.primary').click();
    await page.locator('#recordDlg').waitFor({state:'hidden'});
    await page.locator('button[data-tab="home"]').click();
    await page.locator('#globalSearch').fill(note);
    const matches=page.locator('#globalSearchResults [data-kind="record"]');
    assert.equal(await matches.count(),2);
    const selected=matches.filter({hasText:secondText});
    const selectedId=await selected.getAttribute('data-id');
    await selected.click();
    assert.equal(await page.locator('#recordId').inputValue(),selectedId);
    assert.equal(await page.locator('#rtext').inputValue(),secondText);
    await page.keyboard.press('Escape');
    await page.locator('#recordDlg').waitFor({state:'hidden'});
    assert.equal(await page.locator('#globalSearch').inputValue(),note);
    assert.equal(await matches.count(),2);
    const capture=()=>page.evaluate(()=>({
      hives:S.hives.map(h=>h.id),
      families:S.families.map(f=>({id:f.id,hive:f.hive})),
      records:S.records.filter(r=>r.text.startsWith('QA-SYNTHETIC-E2E-'))
        .map(r=>({id:r.id,hive:r.hive,family:r.family,text:r.text}))
    }));
    const before=await capture();
    assert.equal(before.hives.length,1);
    assert.equal(before.families.length,1);
    assert.equal(before.records.length,1);
    assert.equal(before.records[0].family,before.families[0].id);
    assert.equal(before.records[0].hive,before.hives[0]);
    await page.reload({waitUntil:'domcontentloaded'});
    await ready();
    await page.locator('button[data-tab="journal"]').click();
    const after=await capture();
    assert.deepEqual(after,before,'hive/family/inspection changed after real reload');
    assert.equal(await page.locator('#records .journal-entry-text').filter({hasText:secondText}).count(),1);
    assert.equal(await page.getByText(note,{exact:true}).and(page.locator('#records .journal-entry-text')).count(),1,
      'saved inspection is duplicated or not visible after reload');
    // Integration: #599 keeps exact global search links; #598 adds the family timeline.
    await page.locator('button[data-tab="hives"]').click();
    await page.locator('.hive-row-main').first().click();
    await page.getByRole('button',{name:'Карточка семьи',exact:true}).click();
    const card=page.locator('#familyHistoryDlg');
    await card.waitFor({state:'visible'});
    await card.locator('#familyHistoryType').selectOption('Осмотр');
    await card.locator('#familyHistoryDate').fill('2000-01-01');
    assert.equal(await card.locator('article').count(),0);
    await card.locator('#familyHistoryDate').fill('');
    assert.equal(await card.locator('article').filter({hasText:note}).count(),1,
      'family history must include only the record linked to the family ID');
    await card.getByRole('button',{name:'Открыть запись'}).click();
    assert.equal(await page.locator('#rtext').inputValue(),note);
    await page.keyboard.press('Escape');
    await page.locator('#recordDlg').waitFor({state:'hidden'});
    assert.equal(await card.locator('#familyHistoryType').inputValue(),'Осмотр');
    await card.getByRole('button',{name:'Вернуться к улью'}).click();
    await page.locator('#selectedHivePanel').waitFor({state:'visible'});
    assert.deepEqual(await capture(),before,'history navigation mutated journal data');
    // #600 selective port: global family result opens this family's history directly.
    await page.locator('button[data-tab="home"]').click();
    const familySearch=await page.evaluate(()=>{
      const family=S.families[0];
      return [family?.name,family?.code,family?.breed].find(v=>typeof v==='string'&&v.trim())||'';
    });
    assert.ok(familySearch,'synthetic family has searchable name/code');
    await page.locator('#globalSearch').fill(familySearch);
    const familyResult=page.locator('#globalSearchResults [data-kind="family"][data-id="'+before.families[0].id+'"]');
    assert.equal(await familyResult.count(),1,'expected one family search result');
    await familyResult.click();
    await card.waitFor({state:'visible'});
    assert.equal(await card.getAttribute('data-family-id'),before.families[0].id);
    assert.equal(await card.locator('article').filter({hasText:note}).count(),1);
    await card.getByRole('button',{name:'Вернуться к улью'}).click();
    await page.locator('#selectedHivePanel').waitFor({state:'visible'});
    assert.deepEqual(await capture(),before,'search-to-family-history altered records');
    // Approved UX: one canonical AI entry in bottom nav; keep one-tap record creation on home.
    await page.locator('button[data-tab="home"]').click();
    assert.equal(await page.locator('#home .home-ai-card').count(),0);
    assert.equal(await page.locator('#home #homeAIQuestion').count(),0);
    assert.equal(await page.locator('main>nav button[data-tab="ai"]').count(),1);
    await page.locator('#home .home-recent-card').getByRole('button',{name:'＋ Записать событие'}).click();
    await page.locator('#recordDlg').waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    await page.locator('#recordDlg').waitFor({state:'hidden'});
    assert.deepEqual(await capture(),before,'unsaved quick journal draft mutated data');
    assert.deepEqual(errors,[],'unexpected browser error or dialog');
    console.log(JSON.stringify({scenario:'hive-family-inspection-save-reload-no-duplicate',
      viewport:name,status:'PASS',source:'local-Chromium-real-IndexedDB',
      productionData:'NOT_ACCESSED',device:'NOT_TESTED'}));
  }catch(error){
    await page.screenshot({path:'e2e-journal-'+name+'-failure.png',fullPage:true}).catch(()=>{});
    console.error(JSON.stringify({scenario:'hive-family-inspection-save-reload-no-duplicate',
      viewport:name,status:'FAIL',reason:error.message,diagnostics:errors,device:'NOT_TESTED'}));
    throw error;
  }finally{await context.close()}
}

async function archiveJourney(browser,origin){
 const context=await browser.newContext({viewport:{width:412,height:915},locale:'ru-RU',timezoneId:'UTC',serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage(),errors=[];
 page.setDefaultTimeout(20000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',async dialog=>{
  if(dialog.type()==='confirm'&&(dialog.message().includes('Подтверждаешь, что это действительно первый запуск')||dialog.message().startsWith('Восстановить архив от '))){await dialog.accept();return;}
  errors.push('Unexpected dialog: '+dialog.message());await dialog.dismiss();
 });
 const setDay=day=>page.clock.setFixedTime(new Date(day+'T12:00:00Z'));
 const ready=()=>page.waitForFunction(()=>startupWriteGate.ready===true);
 const archived=day=>page.waitForFunction(day=>dailyArchiveCheckedDay===day&&!dailyArchiveBusy,day);
 const addHive=async()=>{
  await page.locator('button[data-tab="hives"]').click();
  await page.locator('[data-action="open-new-hive"]').click();
  await page.locator('#hiveForm button.primary').click();
  await page.locator('#hiveDlg').waitFor({state:'hidden'});
  await page.evaluate(()=>saveQueue);
 };
 try{
  await setDay('2026-11-25');
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
  await ready();await archived('2026-11-25');
  await addHive();
  await setDay('2026-11-26');
  await page.evaluate(()=>checkDailyArchives());await archived('2026-11-26');
  const firstHive=await page.evaluate(()=>S.hives[0].id);
  await addHive();
  await setDay('2026-11-27');
  await page.evaluate(()=>checkDailyArchives());await archived('2026-11-27');
  const slots=await page.evaluate(async()=>(await PasekaDailyArchives.readAll(await getDailyArchiveStore())).map(r=>[r.slot,r.day]).sort());
  assert.deepEqual(slots,[['latest','2026-11-27'],['previous','2026-11-26']]);
  assert.equal(await page.evaluate(()=>S.hives.length),2);
  // Corrupt only synthetic archive storage, not the live database.
  await page.evaluate(async()=>{
   const store=await getDailyArchiveStore(),rows=await PasekaDailyArchives.readAll(store);
   const latest=rows.find(r=>r.slot==='latest');
   await new Promise((resolve,reject)=>{
    const tx=store.transaction('files','readwrite');
    tx.objectStore('files').put({...latest,blob:new Blob(['corrupt'])});
    tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
   });
  });
  await page.locator('button[data-tab="settings"]').click();
  assert.equal(await page.locator('#dailyArchivePanel button').count(),1);
  assert.equal(await page.locator('#legacyBackupDiagnostics').isVisible(),false);
  await page.locator('#dailyRestoreButton').click();
  await page.locator('#dailyRestoreConfirm').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('dailyRestoreConfirm').disabled);
  assert.deepEqual(await page.locator('#dailyRestoreSlot option').evaluateAll(options=>options.map(o=>o.value)),['previous']);
  assert.match(await page.locator('#dailyArchiveLatest').textContent(),/повреждён/);
  const navigated=page.waitForEvent('framenavigated',{predicate:frame=>frame===page.mainFrame()});
  await page.locator('#dailyRestoreConfirm').click();
  await navigated;await ready();
  assert.deepEqual(await page.evaluate(()=>S.hives.map(h=>h.id)),[firstHive]);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({scenario:'daily-two-zip-corrupt-latest-restore-previous-reopen',status:'PASS',source:'Chromium real IndexedDB with synthetic clock and data',device:'NOT_TESTED'}));
 }catch(e){
  await page.screenshot({path:'e2e-journal-daily-archive-failure.png',fullPage:true}).catch(()=>{});
  console.error(JSON.stringify({scenario:'daily-two-zip-corrupt-latest-restore-previous-reopen',status:'FAIL',reason:e.message,errors}));
  throw e;
 }finally{await context.close();}
}

(async()=>{
  await listen();
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    await journey(browser,origin,'mobile',{width:412,height:915});
    await journey(browser,origin,'desktop',{width:1280,height:800});
    await archiveJourney(browser,origin);
  }finally{if(browser)await browser.close();await close()}
})().catch(error=>{console.error(error.stack||String(error));process.exitCode=1});
