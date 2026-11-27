'use strict';
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
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+sep)||!mime[extname(file)]){res.writeHead(403);res.end();return}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store'});
    res.end(data);
  }catch{res.writeHead(404);res.end('Not found')}
});
const scenarios=[
  ['portrait-320',320,640],['portrait-360',360,780],['portrait-390',390,844],
  ['portrait-412',412,915],['portrait-768',768,1024],['portrait-1024',1024,1365],['portrait-1365',1365,1600],
  ['landscape-640',640,320],['landscape-780',780,360],['landscape-844',844,390],
  ['landscape-915',915,412],['landscape-768',768,600],['landscape-1024',1024,768],['landscape-1365',1365,900]
];
const expected=['home','hives','journal','planning','settings','ai'];
const measure=()=> {
  const box=el=>{const r=el.getBoundingClientRect();
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
      width:r.width,height:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2}};
  const nav=document.querySelector('main>nav[aria-label="Основные разделы"]');
  const main=document.querySelector('main');
  if(!nav||!main)return {missing:'nav or main'};
  const n=box(nav);
  const buttons=[...nav.querySelectorAll('button[data-tab]')].map(button=>{
    const r=box(button),cs=getComputedStyle(button);
    const hit=document.elementFromPoint(r.cx,r.cy);
    const range=document.createRange();range.selectNodeContents(button);
    const textRects=[...range.getClientRects()].filter(t=>t.width>0.5&&t.height>0.5);
    const textOutside=textRects.some(t=>t.left<r.left-1||t.right>r.right+1||
      t.top<r.top-1||t.bottom>r.bottom+1);
    return {tab:button.dataset.tab,...r,label:button.textContent.trim(),
      accessibleName:button.getAttribute('aria-label')||button.textContent.trim(),
      visible:cs.visibility!=='hidden'&&cs.display!=='none',
      hit:hit===button||button.contains(hit),textOutside,
      overflowX:button.scrollWidth>button.clientWidth+1,
      overflowY:button.scrollHeight>button.clientHeight+1};
  });
  const overlaps=[];
  for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){
    const a=buttons[i],b=buttons[j],x=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),
      y=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    // In a seamless honeycomb adjoining hexagon bounding boxes intentionally intersect,
    // while clip-path removes the shared triangular regions. Only same-row overlaps are invalid.
    if(x>0.6&&y>0.6&&Math.abs(a.cy-b.cy)<1)overlaps.push({a:a.tab,b:b.tab,width:+x.toFixed(2),height:+y.toFixed(2)});
  }
  const aiButton=nav.querySelector('button[data-tab="ai"]');
  const bee=aiButton?.querySelector('svg.nav-ai-bee[aria-hidden="true"]');
  const aiStyle=aiButton?getComputedStyle(aiButton):null;
  const hexagonButtons=[...nav.querySelectorAll('button[data-tab]')].every(button=>
    getComputedStyle(button).clipPath.includes('polygon('));
  const aiVisual={beePresent:!!bee,beePathCount:bee?.querySelectorAll('path,ellipse').length||0,
    rimColor:aiStyle?.borderTopColor||null,background:aiStyle?.backgroundImage||null,hexagonButtons};
  const ai=buttons.find(b=>b.tab==='ai');
  const layoutProblems=[];
  const first=buttons[0];
  for(let i=0;i<buttons.length;i++){
    const button=buttons[i];
    if(Math.abs(button.cy-first.cy)>1)layoutProblems.push(button.tab+' is not in single row');
    if(i>0&&button.left<buttons[i-1].right-1)layoutProblems.push('tap targets overlap');
  }
  return {viewport:{width:innerWidth,height:innerHeight},
    documentWidth:document.documentElement.scrollWidth,
    mainPaddingBottom:parseFloat(getComputedStyle(main).paddingBottom),
    nav:n,buttons,rowTracks:getComputedStyle(nav).gridTemplateRows.trim().split(/\s+/).length,
    aiDelta:ai?+(ai.cx-n.cx).toFixed(2):null,aiVisual,overlaps,layoutProblems};
};
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser,context;
  try{
    browser=await chromium.launch({headless:true});
    context=await browser.newContext({viewport:{width:320,height:640},
      locale:'ru-RU',serviceWorkers:'block'});
    const origin='http://127.0.0.1:'+server.address().port;
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      return url.origin===origin?route.continue():route.abort();
    });
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    const errors=[];
    page.on('pageerror',error=>errors.push('Browser JS: '+error.message));
    page.on('dialog',async dialog=>{
      if(dialog.type()==='confirm'&&dialog.message().endsWith(
        'Подтверждаешь, что это действительно первый запуск новой пасеки?')){
        await dialog.accept();return;
      }
      errors.push('Unexpected dialog: '+dialog.type());
      await dialog.dismiss();
    });
    await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
    await page.locator('main>nav[aria-label="Основные разделы"]').waitFor({state:'visible'});
    await page.waitForFunction(()=>startupWriteGate.ready===true);
    assert.equal(await page.locator('#recent').textContent(),'Записей пока нет.');
    assert.equal(await page.getByRole('button',{name:'Открыть ИИ-помощника',exact:true}).count(),1);
    const expectedRecent=await page.evaluate(()=>{
      const longLabel='<метка>'+ 'СинтетическаяМетка'.repeat(12);
      S.records=[{id:'newest',date:'2025-05-05',type:'Запись'},{id:'same-day-first',date:'2025-04-04',type:'Осмотр'},{id:'same-day-last',date:'2025-04-04',type:longLabel},{id:'backdated',date:'2025-01-01',type:'Другая работа'},{id:'archived',date:'2025-06-06',type:'Обработка',archivedAt:'2025-06-07'}];
      const before=JSON.stringify(S.records);render();if(JSON.stringify(S.records)!==before)throw new Error('Recent preview mutated records');
      return ['2025-05-05 · Запись · Улей','2025-04-04 · '+longLabel+' · Улей','2025-04-04 · Осмотр · Улей'];
    });
    const failures=[];
    for(const [name,width,height] of scenarios){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const m=await page.evaluate(measure);
      const problems=[];
      if(JSON.stringify(await page.locator('#recent li').allTextContents())!==JSON.stringify(expectedRecent))problems.push('recent preview order');
      if(await page.locator('#recent').evaluate(el=>el.scrollWidth>el.clientWidth+1))problems.push('recent preview overflow');
      if(m.missing)problems.push(m.missing);
      else {
        const tabs=m.buttons.map(b=>b.tab);
        if(JSON.stringify(tabs)!==JSON.stringify(expected))problems.push('navigation routes/order changed');
        if(m.buttons.length!==6)problems.push('expected five sections and one AI button');
        if(m.aiVisual.hexagonButtons)problems.push('obsolete decorative geometry retained');
        if(m.rowTracks!==1)problems.push('default navigation must be one row');
        problems.push(...m.layoutProblems);
        const ai=m.buttons.find(b=>b.tab==='ai');
        if(ai?.label!=='ИИ'||ai?.accessibleName!=='Открыть ИИ-помощника')problems.push('AI visible or accessible name missing');
        if(Math.abs(m.nav.bottom-height)>2)problems.push('nav is not anchored to viewport bottom');
        if(m.nav.left< -1||m.nav.right>width+1)problems.push('nav horizontal overflow');
        if(m.documentWidth>width+2)problems.push('document horizontal overflow '+m.documentWidth);
        if(m.mainPaddingBottom+1<m.nav.height)problems.push('main bottom padding smaller than nav');
        if(m.overlaps.length)problems.push('overlapping tap rectangles: '+JSON.stringify(m.overlaps));
        for(const b of m.buttons){
          if(!b.visible)problems.push(b.tab+' hidden');
          if(b.width<47.5||b.height<47.5)problems.push(b.tab+' tap target '+Math.round(b.width)+'x'+Math.round(b.height));
          if(!b.hit)problems.push(b.tab+' center hit is intercepted');
          if(b.textOutside||b.overflowX||b.overflowY)problems.push(b.tab+' label overflows');
        }
      }
      console.log(JSON.stringify({scenario:'nav-geometry',name,viewport:m.viewport,
        rows:m.rowTracks,
        navHeight:m.nav?.height,mainPaddingBottom:m.mainPaddingBottom,
        aiDelta:m.aiDelta,overlaps:m.overlaps,problems,
        source:'local-Chromium-synthetic',realAndroid:'NOT_TESTED'}));
      if(problems.length){
        failures.push(name+': '+problems.join('; '));
        await page.screenshot({path:'e2e-nav-'+name+'-failure.png'}).catch(()=>{});
      }
    }
    // Persistent navigation and direct Home from all screens.
    const primary=page.locator('main>nav[aria-label="Основные разделы"]');
    const home=primary.locator('button[data-tab="home"]'),back=page.locator('#backButton');
    async function assertInterior(tab){
      await page.locator('#'+tab+'.panel.active').waitFor({state:'visible'});
      assert.ok(await primary.isVisible(),tab+' must keep primary navigation');
      assert.ok(await back.isVisible(),tab+' Back must be visible');
      assert.ok(await home.isVisible(),tab+' Home must be visible');
      const rect=await home.boundingBox();
      assert.ok(rect.width>=48&&rect.height>=48,tab+' Home tap target');
      assert.equal(await home.getAttribute('aria-label'),'Обзор пасеки');
      const parent=({hiveDetail:'hives',entrance:'hives',forage:'planning',varroa:'settings',incidents:'settings',deadout:'settings'})[tab]||tab;
      assert.equal(await primary.locator('button[aria-current="page"]').getAttribute('data-tab'),parent);
      assert.equal(await primary.locator('button[data-tab="ai"]').count(),1);
    }
    async function assertHome(){
      await page.locator('#home.panel.active').waitFor({state:'visible'});
      assert.ok(await primary.isVisible());
      assert.ok(await home.isVisible());
      assert.equal(await back.isVisible(),false);
      const m=await page.evaluate(measure);
      assert.deepEqual(m.buttons.map(x=>x.tab),expected);
      assert.equal(m.rowTracks,1);
      assert.deepEqual(m.layoutProblems,[]);
    }
    await page.setViewportSize({width:390,height:844});
    await assertHome();
    await page.locator('#workspacePreferences summary').click();
    await page.getByRole('combobox',{name:'Рабочий режим'}).selectOption('field');
    assert.equal(await page.locator('body').getAttribute('data-workspace-mode'),'field');
    assert.ok((await page.getByRole('button',{name:'Осмотр семьи',exact:true}).boundingBox()).height>=56);
    await page.setViewportSize({width:320,height:640});
    const fieldGeometry=await page.evaluate(measure);
    assert.equal(fieldGeometry.rowTracks,2);
    assert.ok(fieldGeometry.buttons.every(b=>b.width>=55.5&&b.height>=55.5&&b.hit),'field mode 56px targets');
    assert.ok(fieldGeometry.mainPaddingBottom>=fieldGeometry.nav.height);
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('combobox',{name:'Сезон пасеки'}).selectOption('winter');
    assert.equal(await page.locator('#workspaceSeasonTitle').textContent(),'Зима');
    await page.getByRole('combobox',{name:'Рабочий режим'}).selectOption('night');
    assert.equal(await page.locator('body').getAttribute('data-workspace-mode'),'night');
    // Preferences and theme persist through a reload; verify every primary/secondary route.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>startupWriteGate.ready===true);
    assert.equal(await page.locator('body').getAttribute('data-workspace-mode'),'night');
    assert.equal(await page.locator('#workspaceSeasonTitle').textContent(),'Зима');
    for(const tab of ['hives','journal','planning','settings','ai']){
      await primary.locator('button[data-tab="'+tab+'"]').click();
      await assertInterior(tab);
      assert.equal(await page.getByRole('combobox',{name:'Рабочий режим'}).isVisible(),true);
      assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(22, 30, 26)');
      assert.equal(await page.locator('header.home-header').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(34, 44, 38)');
      assert.equal(await page.locator('header.home-header').evaluate(el=>getComputedStyle(el).transitionDuration),'0s','no intermediate low-contrast theme');
    }
    for(const [parent,children] of Object.entries({hives:['entrance'],planning:['forage'],settings:['incidents','deadout','varroa']})){
      for(const child of children){
        await primary.locator('button[data-tab="'+parent+'"]').click();
        await page.locator('#'+parent+' [data-subtab="'+child+'"]').click();
        await assertInterior(child);
        assert.equal(await page.locator('header.home-header').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(34, 44, 38)');
      }
    }
    await home.click();
    await assertHome();
    if(!(await page.locator('#workspacePreferences').evaluate(el=>el.open)))await page.locator('#workspacePreferences summary').click();
    await page.getByRole('combobox',{name:'Рабочий режим'}).selectOption('home');
    await page.getByRole('combobox',{name:'Сезон пасеки'}).selectOption('auto');
    await page.locator('#workspacePreferences summary').click();
    assert.equal(await page.locator('header.home-header').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
    const aiEntry=primary.locator('button[data-tab="ai"]');
    await aiEntry.focus();
    await aiEntry.press('Enter');
    await assertInterior('ai');
    await back.click();
    await assertHome();
    for(const tab of expected.filter(tab=>tab!=='home')){
      await page.locator('main>nav button[data-tab="'+tab+'"]').click();
      await assertInterior(tab);
      await home.click();
      await assertHome();
    }
    for(const [parent,children] of Object.entries({hives:['entrance'],planning:['forage'],settings:['incidents','deadout','varroa']})){
      for(const child of children){
        await page.locator('main>nav button[data-tab="'+parent+'"]').click();
        await assertInterior(parent);
        const link=page.locator('#'+parent+' [data-subtab="'+child+'"]');
        assert.equal(await link.count(),1);
        assert.ok(await link.isVisible(),child+' must be visible within '+parent);
        assert.ok((await link.boundingBox()).height>=44);
        await link.click();
        await assertInterior(child);
        await back.click();
        await assertInterior(parent);
        await link.click();
        await assertInterior(child);
        await home.click();
        await assertHome();
      }
    }
    // Independent UI #609 smoke on a disposable Chromium profile: no production records.
    await assertHome();
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:width===320?640:width===390?844:1024});
      const field=page.locator('#globalSearch');
      const clear=page.locator('#globalSearchClear');
      const status=page.locator('#globalSearchStatus');
      await field.fill('несуществующий запрос xyz');
      if(!await clear.isVisible())failures.push('global reset hidden with query at '+width);
      if(!await status.isVisible())failures.push('search result status missing at '+width);
      if(await status.textContent()!=='Совпадений не найдено.')
        failures.push('search zero count not announced at '+width);
      await clear.click();
      if(await field.inputValue()!=='')failures.push('click reset did not clear at '+width);
      if(await clear.isVisible())failures.push('reset remained visible when empty at '+width);
      if(!await field.evaluate(element=>element===document.activeElement))
        failures.push('click reset did not focus input at '+width);
      await field.fill('синтетический запрос');
      await field.press('Escape');
      if(await field.inputValue()!=='')failures.push('Escape did not clear search at '+width);
      if(await status.textContent()!=='')failures.push('stale status after Escape at '+width);
      console.log(JSON.stringify({scenario:'global-search-reset',width,
        source:'Chromium-disposable-synthetic',realAndroid:'NOT_TESTED'}));
    }
    assert.deepEqual(errors,[],'unexpected JS errors or dialogs');
    assert.deepEqual(failures,[],'nav geometry regression across supported viewports');
  }finally{if(context)await context.close();if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve))}
})().catch(err=>{console.error(err.stack||String(err));process.exitCode=1});
