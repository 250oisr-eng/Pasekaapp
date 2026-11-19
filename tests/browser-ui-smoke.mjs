/*
 * Read-only browser smoke tests for the PWA.
 * Runs on localhost in disposable browser contexts with network egress blocked.
 * No production URL, API credentials, real hives or user IndexedDB are used.
 *
 * Workflow installs pinned, free open-source playwright and @axe-core/playwright.
 * This file is deliberately not matched by 'npm test' (tests/*.test.mjs).
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const reportDir = resolve(root, 'test-results', 'ui-audit');
const profiles = [
  { id: 'phone-360', width: 360, height: 780, mobile: true },
  { id: 'phone-390', width: 390, height: 844, mobile: true },
  { id: 'landscape-800', width: 800, height: 390, mobile: true },
  { id: 'desktop-1280', width: 1280, height: 800, mobile: false }
];

const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json', '.css':'text/css; charset=utf-8' };

function permittedPath(pathname) {
  const path = decodeURIComponent(pathname);
  if (!(path === '/' || ['/index.html','/sw.js','/manifest.webmanifest','/icons/paseka.svg'].includes(path) ||
      /^\/js\/[a-zA-Z0-9_./-]+\.js$/.test(path))) return null;
  const absolute = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!absolute.startsWith(root + sep)) return null;
  return absolute;
}

async function serve(req, res) {
  let path;
  try { path = permittedPath(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (!path) { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream',
      'cache-control':'no-store', 'x-content-type-options':'nosniff' });
    res.end(data);
  } catch { res.writeHead(404).end(); }
}

function minimalViolations(results) {
  return results.violations.map(v => ({
    id:v.id, impact:v.impact, description:v.description, help:v.help,
    nodes:v.nodes.slice(0, 15).map(n => ({ target:n.target, failureSummary:n.failureSummary }))
  }));
}

const server = createServer((req, res) => { serve(req,res).catch(err => {
  console.error('Local test server', err);
  if (!res.headersSent) res.writeHead(500);
  res.end();
}); });
let browser;
const report = { format:'paseka-local-ui-audit-v1', source:'localhost-ephemeral', pages:[], errors:[], timestamp:new Date().toISOString(), 
  notes:['axe findings are advisory until reviewed; no production data is used','mobile viewports emulate screens, not a physical Android phone'] };
let failed = false;
try {
  await mkdir(reportDir,{ recursive:true });
  await new Promise((res,rej) => { server.once('error',rej); server.listen(0,'127.0.0.1',res); });
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await chromium.launch({channel:'chrome',headless:true});
  for (const profile of profiles) {
    const row = {profile:profile.id,viewport:{width:profile.width,height:profile.height},steps:[],violations:[],pageErrors:[]};
    report.pages.push(row);
    const context=await browser.newContext({ viewport:{width:profile.width,height:profile.height},
      isMobile:profile.mobile, hasTouch:profile.mobile, deviceScaleFactor:1, locale:'ru-RU', serviceWorkers:'block' });
    const page=await context.newPage();
    try {
      await page.route('**/*', route =>
        route.request().url().startsWith(url) ? route.continue() : route.abort());
      page.on('pageerror',error=>row.pageErrors.push(String(error?.message||error).slice(0,500)));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForFunction(() => typeof window.showTab === 'function' && document.querySelector('nav button[data-tab="hives"]'),null,{timeout:30000});
      await page.locator('section#home.panel.active').waitFor({state:'visible',timeout:30000});
      const homeCurrent = await page.locator('nav button[aria-current="page"]').count();
      if (homeCurrent !== 1 || await page.locator('nav button[data-tab="home"][aria-current="page"]').count() !== 1) {
        throw new Error('The home tab must be the sole aria-current=page navigation item');
      }
      row.steps.push('home-loaded');
      const initial = await page.evaluate(() => ({
        width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
        navButtons:document.querySelectorAll('nav[aria-label="Основные разделы"] button').length,
        activeTab:document.querySelector('.panel.active')?.id
      }));
      row.layout = initial;
      if (initial.navButtons < 7) throw new Error('Primary navigation is missing expected sections');

      // Scan only the empty, local home screen. We record known a11y issues
      // for review, without treating an untriaged legacy finding as a release gate.
      try {
        const results = await new AxeBuilder({page})
          .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])
          .analyze();
        row.violations = minimalViolations(results);
        row.incompleteCount = results.incomplete.length;
      } catch(error) { row.axeError=String(error.message||error); }

      await page.locator('nav button[data-tab="hives"]').click();
      await page.locator('section#hives.panel.active').waitFor({state:'visible',timeout:15000});
      if (await page.locator('nav button[data-tab="hives"][aria-current="page"]').count() !== 1 ||
          await page.locator('nav button[aria-current="page"]').count() !== 1) {
        throw new Error('Only hives navigation item should be aria-current=page');
      }
      row.steps.push('hives-navigation');
      await page.locator('nav button[data-tab="journal"]').click();
      await page.locator('section#journal.panel.active').waitFor({state:'visible',timeout:15000});
      if (await page.locator('nav button[data-tab="journal"][aria-current="page"]').count() !== 1 ||
          await page.locator('nav button[aria-current="page"]').count() !== 1) {
        throw new Error('Only journal navigation item should be aria-current=page');
      }
      row.steps.push('journal-navigation');
      await page.locator('nav button[data-tab="home"]').click();
      await page.locator('section#home.panel.active').waitFor({state:'visible',timeout:15000});
      row.steps.push('return-home');
      await page.screenshot({path:resolve(reportDir,profile.id+'.png'),fullPage:true});
      row.status='PASS';
    } catch(error) {
      row.status='FAIL';
      row.error=String(error?.message||error).slice(0,1200);
      failed=true;
      try { await page.screenshot({path:resolve(reportDir,profile.id+'-failure.png'),fullPage:true}); } catch {}
    } finally { await context.close(); }
    console.log(profile.id+': '+row.status+' nav='+row.steps.join(',')+' axe='+row.violations.length);
  }
} catch(error) {
  failed=true;
  report.errors.push(String(error?.stack||error).slice(0,2000));
} finally {
  try { await browser?.close(); } catch {}
  await new Promise(res=>server.close(res));
  await mkdir(reportDir,{recursive:true});
  await writeFile(resolve(reportDir,'report.json'),JSON.stringify(report,null,2)+'\n');
}
if(failed) {
  console.error('Read-only local UI smoke failed; see test-results/ui-audit/report.json');
  process.exitCode=1;
} else {
  console.log('Read-only mobile/desktop navigation smoke: PASS');
}
