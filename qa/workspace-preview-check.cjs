'use strict';
const assert=require('node:assert/strict');
module.exports=async function checkWorkspacePreview(browser,origin){
 const context=await browser.newContext({viewport:{width:320,height:640},locale:'ru-RU',serviceWorkers:'block'});
 const outside=[],errors=[];
 try{
  await context.route('**/*',route=>{
   if(new URL(route.request().url()).origin===origin)return route.continue();
   outside.push(route.request().url());return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/qa/seasonal-workspace-preview.html',{waitUntil:'domcontentloaded'});
  const nav=page.locator('#navigation');
  const mode=page.getByRole('combobox',{name:'Рабочий режим'});
  assert.equal(await nav.locator('button').count(),6);
  assert.equal(await page.getByText('Демонстрация · вымышленные данные',{exact:true}).isVisible(),true);
  for(const [width,height] of [[320,640],[390,844],[768,1024],[844,390]]){
   await page.setViewportSize({width,height});
   for(const kind of ['home','field','night']){
    await mode.selectOption(kind);
    assert.equal(await page.locator('#workspace').getAttribute('data-mode'),kind);
    const geometry=await nav.evaluate(el=>{
     const buttons=[...el.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {width:r.width,height:r.height,hit:b===hit||b.contains(hit),overflow:b.scrollWidth>b.clientWidth+1}});
     return {buttons,overflow:document.documentElement.scrollWidth>innerWidth+1,bottom:el.getBoundingClientRect().bottom};
    });
    const target=kind==='field'?56:48;
    assert.equal(geometry.overflow,false,'page overflow '+width+' '+kind);
    assert.ok(Math.abs(geometry.bottom-height)<2,'bottom anchored');
    assert.ok(geometry.buttons.every(b=>b.height>=target-.5&&b.width>=target-.5&&b.hit&&!b.overflow),'touch geometry '+width+' '+kind);
   }
  }
  await page.setViewportSize({width:390,height:844});await mode.selectOption('home');
  await page.locator('#preferences summary').click();
  await page.getByRole('combobox',{name:'Сезон пасеки'}).selectOption('winter');
  assert.equal(await page.locator('#season-title').textContent(),'Зима');
  await page.locator('#preferences summary').click();
  await page.locator('#search').fill('02');
  assert.equal(await page.locator('#search-results button').count(),1);
  await page.locator('#search-results button').click();
  assert.equal(await page.locator('#page-title').textContent(),'Улей 02');
  await page.locator('#back').click();
  assert.equal(await page.locator('#home-panel').isVisible(),true);
  await page.locator('#clear').click();
  assert.equal(await page.locator('#search').inputValue(),'');
  await page.getByRole('button',{name:'Осмотр семьи',exact:true}).click();
  assert.match(await page.locator('#quick-status').textContent(),/Выбери/);
  await page.locator('#quick-hive').selectOption({label:'Улей 01'});
  await page.getByRole('button',{name:'Осмотр семьи',exact:true}).click();
  assert.equal(await page.locator('#draft').isVisible(),true);
  assert.equal(await page.locator('#draft-hive').textContent(),'Улей 01');
  await page.locator('#draft textarea').fill('Учебный текст');
  await page.locator('#finish-draft').click();
  assert.equal(await page.locator('#draft').isVisible(),false);
  assert.match(await page.locator('#quick-status').textContent(),/Запись не создана/);
  for(const [parent,children] of Object.entries({hives:['entrance'],planning:['forage'],settings:['incidents','deadout','varroa']})){
   for(const child of children){
    await nav.locator('[data-group="'+parent+'"]').click();
    const label=await page.evaluate(key=>window.PasekaWorkspaceUI.labels[key],child);
    await page.locator('#route-list').getByRole('button',{name:label,exact:true}).click();
    assert.equal(await page.locator('#page-title').textContent(),label);
    assert.equal(await nav.locator('[aria-current="page"]').getAttribute('data-group'),parent);
    await page.locator('#back').click();
    assert.equal(await nav.locator('[aria-current="page"]').getAttribute('data-group'),parent);
   }
  }
  await nav.locator('[data-group="ai"]').click();
  assert.match(await page.locator('#route-help').textContent(),/Запросы не отправляются/);
  await nav.locator('[data-group="journal"]').click();
  assert.equal(await page.locator('#page-title').textContent(),'Журнал');
  await nav.locator('[data-group="home"]').click();
  assert.equal(await page.locator('#home-panel').isVisible(),true);
  assert.deepEqual(await page.evaluate(async()=>({keys:Object.keys(localStorage),dbs:(await indexedDB.databases()).map(x=>x.name)})),{keys:[],dbs:[]},'preview must not create data');
  assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({scenario:'workspace-preview-interactive',status:'PASS',viewports:4,modes:3,source:'Chromium disposable synthetic',device:'NOT_TESTED'}));
 }finally{await context.close();}
};
