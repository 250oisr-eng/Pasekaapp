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
      if (await page.locator('#currentSectionTitle').innerText() !== 'Обзор' ||
          await page.locator('header .home-ai-shortcut').count() !== 0) {
        throw new Error('Home header must show the active section without duplicate AI shortcut');
      }
      row.steps.push('home-loaded');
      const initial = await page.evaluate(() => ({
        width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
        navButtons:document.querySelectorAll('nav[aria-label="Основные разделы"] button').length,
        activeTab:document.querySelector('.panel.active')?.id
      }));
      row.layout = initial;
      if (initial.navButtons < 7) throw new Error('Primary navigation is missing expected sections');
      if (initial.navButtons !== 11) throw new Error('Honeycomb navigation must contain exactly 11 destinations');
      row.honeycombLayout = await page.locator('nav[aria-label="Основные разделы"]').evaluate(nav => {
        const buttons = [...nav.querySelectorAll('button[data-tab]')];
        return buttons.map(button => ({
          tab: button.dataset.tab,
          row: getComputedStyle(button).gridRowStart,
          column: getComputedStyle(button).gridColumnStart,
          width: Math.round(button.getBoundingClientRect().width),
          height: Math.round(button.getBoundingClientRect().height)
        }));
      });
      const mobileHoneycomb = profile.width < 700 && !(
        profile.width >= 560 && profile.height <= 520
      );
      const expectedRows = mobileHoneycomb ? [3, 5, 3] : [11];
      const actualRows = Object.entries(
        row.honeycombLayout.reduce((acc, item) => {
          acc[item.row] = (acc[item.row] || 0) + 1; return acc;
        }, {})
      ).sort((a,b)=>Number(a[0])-Number(b[0])).map(entry=>entry[1]);
      const aiCell = row.honeycombLayout.find(item=>item.tab==='ai');
      if (JSON.stringify(actualRows) !== JSON.stringify(expectedRows) ||
          !aiCell || aiCell.row !== (mobileHoneycomb ? '2' : '1') ||
          aiCell.column !== (mobileHoneycomb ? '3' : '6')) {
        throw new Error('Unexpected honeycomb grid geometry: '+JSON.stringify({actualRows,aiCell,expectedRows}));
      }
      if (row.honeycombLayout.some(item=>item.width < 44 || item.height < 44)) {
        throw new Error('Honeycomb navigation touch target is below 44x44 CSS pixels');
      }
      row.steps.push('honeycomb-layout');


      // Scan only the empty, local home screen. We record known a11y issues
      // for review, without treating an untriaged legacy finding as a release gate.
      try {
        const results = await new AxeBuilder({page})
          .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])
          .analyze();
        row.violations = minimalViolations(results);
        row.incompleteCount = results.incomplete.length;
      } catch(error) { row.axeError=String(error.message||error); }
      if (row.axeError) throw new Error('axe-core audit failed: '+row.axeError);
      // The legacy axe backlog remains informational, but a proven, repaired
      // contrast regression in the status tiles now blocks this UI smoke.
      const badStatusLabels = row.violations
        .filter(v=>v.id==='color-contrast')
        .flatMap(v=>v.nodes)
        .filter(n=>n.target.some(sel=>String(sel).includes('.apiary-stat')));
      if (badStatusLabels.length) {
        throw new Error('Apiary status labels have insufficient contrast: '+badStatusLabels.length);
      }

      await page.locator('nav button[data-tab="hives"]').click();
      await page.locator('section#hives.panel.active').waitFor({state:'visible',timeout:15000});
      if (await page.locator('nav button[data-tab="hives"][aria-current="page"]').count() !== 1 ||
          await page.locator('nav button[aria-current="page"]').count() !== 1) {
        throw new Error('Only hives navigation item should be aria-current=page');
      }
      if (await page.locator('#currentSectionTitle').innerText() !== 'Ульи') {
        throw new Error('Header title is not synchronized with Hives navigation');
      }
      row.steps.push('hives-navigation');
      // Open and dismiss the real New Hive dialog without submitting its form.
      // The browser profile is disposable; no fake hive or family is created.
      const hiveCountBefore = await page.locator('#hiveDirectoryCount').innerText();
      await page.locator('button[data-action="open-new-hive"]').click();
      const hiveDialog = page.locator('#hiveDlg');
      await hiveDialog.waitFor({state:'visible',timeout:10000});
      if (await page.locator('#hiveDialogTitle').innerText() !== 'Новый улей') {
        throw new Error('New Hive dialog title is incorrect');
      }
      const dialogAudit = await new AxeBuilder({page})
        .include('#hiveDlg')
        .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])
        .analyze();
      row.hiveDialogViolations = minimalViolations(dialogAudit);
      row.hiveDialogIncompleteCount = dialogAudit.incomplete.length;
      if (row.hiveDialogViolations.length) {
        throw new Error('New Hive dialog axe violations: '+row.hiveDialogViolations.map(v=>v.id).join(','));
      }
      const labels = await page.locator('#hiveDlg').evaluate(dialog => ({
        named:dialog.getAttribute('aria-labelledby')==='hiveDialogTitle',
        mode:document.querySelector('#newHiveMode')?.labels?.[0]?.textContent?.trim()||'',
        notes:document.querySelector('#hiveDesc')?.labels?.[0]?.textContent?.trim()||''
      }));
      if (!labels.named || labels.mode!=='Первоначальная комплектация' ||
          labels.notes!=='Примечание об улье (необязательно)') {
        throw new Error('New Hive dialog controls are not programmatically labelled');
      }
      row.hiveDialogTouchTargets = await page.locator('#hiveDlg button').evaluateAll(buttons =>
        buttons.map(btn => ({label:btn.textContent.trim().slice(0,80),
          width:Math.round(btn.getBoundingClientRect().width),
          height:Math.round(btn.getBoundingClientRect().height)})));
      if (row.hiveDialogTouchTargets.some(t=>t.width<44||t.height<44)) {
        throw new Error('New Hive dialog touch targets under 44x44 CSS px');
      }
      await page.screenshot({path:resolve(reportDir,profile.id+'-new-hive-dialog.png'),fullPage:true});
      await page.keyboard.press('Escape');
      await hiveDialog.waitFor({state:'hidden',timeout:10000});
      if (await page.locator('#hiveDirectoryCount').innerText() !== hiveCountBefore) {
        throw new Error('Dismissing New Hive dialog unexpectedly modified the hive directory');
      }
      row.steps.push('new-hive-dialog-open-dismiss-no-save');
      await page.locator('nav button[data-tab="journal"]').click();
      await page.locator('section#journal.panel.active').waitFor({state:'visible',timeout:15000});
      if (await page.locator('nav button[data-tab="journal"][aria-current="page"]').count() !== 1 ||
          await page.locator('nav button[aria-current="page"]').count() !== 1) {
        throw new Error('Only journal navigation item should be aria-current=page');
      }
      if (await page.locator('#currentSectionTitle').innerText() !== 'Журнал') {
        throw new Error('Header title is not synchronized with Journal navigation');
      }
      row.steps.push('journal-navigation');
      // Read-only inspection of the empty journal and planning screens.
      // On a fresh profile, New Record requires a real hive: never create one to unlock the form.
      const journalAudit = await new AxeBuilder({page})
        .include('#journal').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
      row.journalViolations = minimalViolations(journalAudit);
      row.journalIncompleteCount = journalAudit.incomplete.length;
      row.journalEmpty = await page.locator('#journal').evaluate(section => ({
        overflowPx: Math.max(0,section.scrollWidth - section.clientWidth),
        hasSearch: !!section.querySelector('#journalSearch'),
        hasDateFilter: !!section.querySelector('#journalDateFilter'),
        hasRecordButton: !!section.querySelector('button[onclick="newRecord()"]')
      }));
      if (!row.journalEmpty.hasSearch || !row.journalEmpty.hasDateFilter || !row.journalEmpty.hasRecordButton) {
        throw new Error('Journal read-only controls are missing');
      }
      await page.screenshot({path:resolve(reportDir,profile.id+'-empty-journal.png'),fullPage:true});
      // The real Record dialog requires an existing hive to open. Validate its
      // accessible names in the DOM without bypassing that domain safeguard.
      row.recordFormLabels = await page.locator('#recordDlg').evaluate(dialog => {
        const controls = [...dialog.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea, input#rmedia')];
        return {
          dialogName: dialog.getAttribute('aria-labelledby') === 'recordTitle',
          controls: controls.map(control => ({
            id: control.id,
            label: control.labels?.[0]?.textContent?.trim() || ''
          }))
        };
      });
      const unnamedRecordControls = row.recordFormLabels.controls.filter(item => !item.label);
      if (!row.recordFormLabels.dialogName || unnamedRecordControls.length) {
        throw new Error('Record dialog has unlabelled controls: '+unnamedRecordControls.map(x=>x.id).join(','));
      }
      row.steps.push('journal-read-only-audit');
      await page.locator('nav button[data-tab="planning"]').click();
      await page.locator('section#planning.panel.active').waitFor({state:'visible',timeout:15000});
      if (await page.locator('nav button[data-tab="planning"][aria-current="page"]').count() !== 1 ||
          await page.locator('nav button[aria-current="page"]').count() !== 1) {
        throw new Error('Only planning navigation item should be aria-current=page');
      }
      const planningAudit = await new AxeBuilder({page})
        .include('#planning').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
      row.planningViolations = minimalViolations(planningAudit);
      row.planningIncompleteCount = planningAudit.incomplete.length;
      row.planningEmpty = await page.locator('#planning').evaluate(section => ({
        overflowPx: Math.max(0,section.scrollWidth - section.clientWidth),
        hasFloweringDate: !!section.querySelector('#nectarFloweringDate'),
        hasInspectionDate: !!section.querySelector('#inspectionLastDate')
      }));
      if (!row.planningEmpty.hasFloweringDate || !row.planningEmpty.hasInspectionDate) {
        throw new Error('Planning read-only date controls are missing');
      }
      await page.screenshot({path:resolve(reportDir,profile.id+'-empty-planning.png'),fullPage:true});
      if (await page.locator('#currentSectionTitle').innerText() !== 'План') {
        throw new Error('Header title is not synchronized with Planning navigation');
      }
      row.steps.push('planning-read-only-audit');
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
    console.log(profile.id+': '+row.status+' nav='+row.steps.join(',')+' axe='+row.violations.map(v=>v.id+'('+v.impact+')').join(',')+' overflowPx='+((row.layout?.scrollWidth||0)-(row.layout?.width||0))+' pageErrors='+row.pageErrors.length);
    if (row.violations.length) console.log('AXE_NODES '+profile.id+' '+JSON.stringify(row.violations.map(v=>({rule:v.id,nodes:v.nodes.slice(0,6).map(n=>({target:n.target,issue:String(n.failureSummary||'').slice(0,170)}))}))));
    if (row.hiveDialogViolations?.length) console.log('HIVE_DIALOG_AXE '+profile.id+' '+JSON.stringify(row.hiveDialogViolations.map(v=>({rule:v.id,impact:v.impact,nodes:v.nodes.slice(0,5).map(n=>({target:n.target,issue:String(n.failureSummary||'').slice(0,180)}))}))));
    if (row.hiveDialogTouchTargets?.length) console.log('HIVE_DIALOG_TOUCH '+profile.id+' '+JSON.stringify(row.hiveDialogTouchTargets));
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
