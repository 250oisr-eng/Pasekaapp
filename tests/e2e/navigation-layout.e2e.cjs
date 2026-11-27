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
  ['portrait-412',412,915],['portrait-560',560,850],['portrait-699',699,960],
  ['portrait-700',700,960],['portrait-768',768,1024],['portrait-1024',1024,1365],
  ['landscape-560',560,320],['landscape-640',640,320],
  ['landscape-780',780,360],['landscape-844',844,390],
  ['landscape-1024',1024,768],['landscape-1365',1365,900]
];
const desktopOrder=['home','hives','entrance','journal','settings','ai',
  'forage','varroa','incidents','planning','deadout'];
const compactOrder=['home','hives','entrance','journal','settings','forage',
  'varroa','incidents','ai','planning','deadout'];
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
    return {tab:button.dataset.tab,...r,visible:cs.visibility!=='hidden'&&cs.display!=='none',
      hit:hit===button||button.contains(hit),textOutside,
      overflowX:button.scrollWidth>button.clientWidth+1,
      overflowY:button.scrollHeight>button.clientHeight+1};
  });
  const overlaps=[];
  for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){
    const a=buttons[i],b=buttons[j],x=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),
      y=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    if(x>0.6&&y>0.6)overlaps.push({a:a.tab,b:b.tab,width:+x.toFixed(2),height:+y.toFixed(2)});
  }
  const ai=buttons.find(b=>b.tab==='ai');
  return {viewport:{width:innerWidth,height:innerHeight},
    documentWidth:document.documentElement.scrollWidth,
    mainPaddingBottom:parseFloat(getComputedStyle(main).paddingBottom),
    nav:n,buttons,rowTracks:getComputedStyle(nav).gridTemplateRows.trim().split(/\s+/).length,
    aiDelta:ai?+(ai.cx-n.cx).toFixed(2):null,overlaps};
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
        const compact=width<700&&!(width>=560&&width>height&&height<=520);
        const expected=compact?compactOrder:desktopOrder;
        if(JSON.stringify(tabs)!==JSON.stringify(expected))problems.push('navigation routes/keyboard order changed');
        if(m.rowTracks!==(compact?2:1))problems.push('expected '+(compact?2:1)+' grid rows, got '+m.rowTracks);
        // CSS grid row-major layout and DOM order must match Tab navigation order.
        const visual=[...m.buttons].sort((a,b)=>
          (Math.abs(a.cy-b.cy)>5?a.cy-b.cy:a.cx-b.cx)).map(b=>b.tab);
        if(JSON.stringify(tabs)!==JSON.stringify(visual))
          problems.push('DOM/Tab order differs from visual row-major order');
        if(m.buttons.length!==11)problems.push('expected 11 nav buttons');
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
    // Rotation/resizing must not strand the focused control or change the tab destination.
    await page.setViewportSize({width:320,height:640});
    await page.locator('main>nav button[data-tab="ai"]').focus();
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.tab),'ai');
    for(const viewport of [{width:700,height:960},{width:320,height:640}]){
      await page.setViewportSize(viewport);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(()=>document.activeElement?.dataset.tab),'ai',
        'responsive DOM reorder dropped keyboard focus on AI');
    }
    assert.deepEqual(errors,[],'unexpected JS errors or dialogs');
    assert.deepEqual(failures,[],'nav geometry regression across supported viewports');
  }finally{if(context)await context.close();if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve))}
})().catch(err=>{console.error(err.stack||String(err));process.exitCode=1});
