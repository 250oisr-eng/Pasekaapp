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
  ['portrait-412',412,915],['portrait-768',768,1024],['portrait-1024',1024,1365],
  ['landscape-640',640,320],['landscape-780',780,360],['landscape-844',844,390],
  ['landscape-1024',1024,768],['landscape-1365',1365,900]
];
const expected=['entrance','hives','home','planning','journal','ai',
  'forage','incidents','deadout','varroa','settings'];
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
  const mobileRows=[['entrance','hives','home','planning'],
    ['journal','ai','forage'],
    ['incidents','deadout','varroa','settings']];
  const layoutProblems=[];
  if(mobileRows){
    const ordered=mobileRows.flatMap((row,index)=>row.map(tab=>({tab,row:index})));
    for(const {tab,row} of ordered){
      const button=buttons.find(b=>b.tab===tab);
      if(!button||Math.abs(button.cy-buttons.find(b=>b.tab===mobileRows[row][0]).cy)>1)
        layoutProblems.push(tab+' is not in designated row '+(row+1));
    }
    const hex=buttons.find(b=>b.tab==='entrance');
    const other=buttons.find(b=>b.tab==='hives');
    if(hex&&other&&Math.abs(hex.right-other.left)>1)
      layoutProblems.push('same-row hexagons do not touch edges');
    const rows=[mobileRows[0][0],mobileRows[1][0],mobileRows[2][0]].map(t=>buttons.find(b=>b.tab===t));
    if(rows.every(Boolean)&&Math.abs((rows[1].cy-rows[0].cy)-rows[0].height*.75)>1.5)
      layoutProblems.push('hexagon rows are not vertically tessellated');
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
    const failures=[];
    for(const [name,width,height] of scenarios){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const m=await page.evaluate(measure);
      const problems=[];
      if(m.missing)problems.push(m.missing);
      else {
        const tabs=m.buttons.map(b=>b.tab);
        if(JSON.stringify(tabs)!==JSON.stringify(expected))problems.push('navigation routes/order changed');
        if(m.buttons.length!==11)problems.push('expected 11 nav buttons');
        if(!m.aiVisual.beePresent||m.aiVisual.beePathCount<5)
          problems.push('central AI must contain an inline stylized bee');
        if(!m.aiVisual.hexagonButtons)problems.push('all nav cells must be hexagons');
        if(!m.aiVisual.background?.includes('radial-gradient('))
          problems.push('AI must use an edge-lightened radial blue gradient');
        if(!/rgba\(/.test(m.aiVisual.rimColor||''))
          problems.push('AI border must be translucent: '+m.aiVisual.rimColor);
        if(m.rowTracks!==3)
          problems.push('4-3-4 honeycomb rows changed');
        problems.push(...m.layoutProblems);
        const ai=m.buttons.find(b=>b.tab==='ai');
        if(ai?.label)problems.push('AI button must have no visible text');
        if(ai?.accessibleName!=='Открыть ИИ-помощника')problems.push('AI accessibility name missing');
        if(m.buttons.find(b=>b.tab==='ai')?.cy!==m.buttons.find(b=>b.tab==='journal')?.cy)
          problems.push('AI not in middle row');
        if(Math.abs(m.nav.bottom-height)>2)problems.push('nav is not anchored to viewport bottom');
        if(m.nav.left< -1||m.nav.right>width+1)problems.push('nav horizontal overflow');
        if(m.documentWidth>width+2)problems.push('document horizontal overflow '+m.documentWidth);
        if(m.mainPaddingBottom+1<m.nav.height)problems.push('main bottom padding smaller than nav');
        if(m.aiDelta===null||Math.abs(m.aiDelta)>3)problems.push('AI not centered: '+m.aiDelta);
        if(m.overlaps.length)problems.push('overlapping tap rectangles: '+JSON.stringify(m.overlaps));
        for(const b of m.buttons){
          if(!b.visible)problems.push(b.tab+' hidden');
          if(b.width<43.5||b.height<43.5)problems.push(b.tab+' tap target '+Math.round(b.width)+'x'+Math.round(b.height));
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
    // One shared navigation must persist unchanged across each existing tab.
    await page.setViewportSize({width:390,height:844});
    for(const tab of expected){
      const selector='main>nav[aria-label="Основные разделы"] button[data-tab="'+tab+'"]';
      await page.locator(selector).click();
      const m=await page.evaluate(measure);
      if(JSON.stringify(m.buttons.map(button=>button.tab))!==JSON.stringify(expected))
        failures.push('navigation changed after opening '+tab);
      if(m.rowTracks!==3||m.layoutProblems.length||Math.abs(m.aiDelta)>3)
        failures.push('4-3-4 layout changed on tab '+tab+': '+JSON.stringify(m.layoutProblems));
    }
    // Independent UI #609 smoke on a disposable Chromium profile: no production records.
    await page.locator('main>nav button[data-tab="home"]').click();
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
