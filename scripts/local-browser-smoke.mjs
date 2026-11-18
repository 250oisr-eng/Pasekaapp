import { createServer } from 'node:http';
import { access, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NAV_TABS = [
  { id: 'home', label: 'Обзор' },
  { id: 'hives', label: 'Ульи' },
  { id: 'entrance', label: 'Лёток' },
  { id: 'journal', label: 'Журнал' },
  { id: 'ai', label: 'ИИ' },
  { id: 'forage', label: 'Медоносы' },
  { id: 'varroa', label: 'Клещ' },
  { id: 'incidents', label: 'Инцидент' },
  { id: 'planning', label: 'План' },
  { id: 'deadout', label: 'Потери' },
  { id: 'settings', label: 'Ещё' }
];

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

export function resolveSafePath(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const cleanPath = decoded.replace(/^\/+/, '') || 'index.html';
  const absoluteRoot = resolve(root);
  const candidate = resolve(absoluteRoot, cleanPath);
  const rel = relative(absoluteRoot, candidate);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return null;
  return candidate;
}

export function isAllowedAppPath(relativePath) {
  const normalized = relativePath.split(sep).join('/');
  return ['index.html', 'manifest.webmanifest', 'sw.js'].includes(normalized) || /^(js|icons)\//.test(normalized);
}

export function isAllowedLocalUrl(candidate, localOrigin) {
  try {
    return new URL(candidate).origin === localOrigin;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

async function waitFor(check, description, timeoutMs = 15000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error('Тайм-аут ожидания: ' + description + (lastError ? ' (' + lastError.message + ')' : ''));
}

async function startStaticServer(root) {
  const rootPath = await realpath(root);
  const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try {
      pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }
    const candidate = resolveSafePath(rootPath, pathname);
    if (!candidate) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      let actual = await realpath(candidate);
      const rel = relative(rootPath, actual);
      if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      let info = await stat(actual);
      if (info.isDirectory()) {
        actual = await realpath(join(actual, 'index.html'));
        info = await stat(actual);
      }
      const relativeFile = relative(rootPath, actual).split(sep).join('/');
      if (!isAllowedAppPath(relativeFile)) {
        response.writeHead(404).end('Not found');
        return;
      }
      if (!info.isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(actual).toLowerCase()] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else response.end(await readFile(actual));
    } catch (error) {
      const status = error && (error.code === 'ENOENT' || error.code === 'ENOTDIR') ? 404 : 500;
      response.writeHead(status).end(status === 404 ? 'Not found' : 'Local test server error');
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  return {
    server,
    origin: 'http://paseka.test:' + address.port,
    close: () => new Promise(resolveClose => server.close(resolveClose))
  };
}

async function findChrome() {
  if (process.env.PASEKA_CHROME_PATH) {
    await access(process.env.PASEKA_CHROME_PATH);
    return process.env.PASEKA_CHROME_PATH;
  }
  const candidates = process.platform === 'win32'
    ? [
        join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  for (const executable of ['chrome.exe', 'chrome', 'google-chrome', 'chromium', 'chromium-browser']) {
    const result = spawnSync(command, [executable], { encoding: 'utf8', windowsHide: true });
    const candidate = result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean) : null;
    if (candidate) return candidate.trim();
  }
  throw new Error('Google Chrome не найден. Установите Chrome или задайте PASEKA_CHROME_PATH с путём к chrome.exe.');
}

class DevToolsClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    socket.addEventListener('message', event => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || 'DevTools command failed'));
        else pending.resolve(message.result || {});
        return;
      }
      for (const handler of this.handlers.get(message.method) || []) {
        Promise.resolve(handler(message.params || {})).catch(() => {});
      }
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('Соединение с Chrome DevTools закрыто'));
      this.pending.clear();
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) || [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.socket.close(); } catch {}
  }
}

async function connectDevTools(webSocketUrl) {
  if (typeof globalThis.WebSocket !== 'function') {
    throw new Error('Для автоматического управления Chrome нужен Node.js 20.10+ (рекомендуется Node.js 22 LTS), где доступен WebSocket.');
  }
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', () => rejectOpen(new Error('Не удалось подключиться к Chrome DevTools')), { once: true });
  });
  return new DevToolsClient(socket);
}

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Chrome DevTools HTTP ' + response.status);
  return response.json();
}

async function waitForChrome(chrome, profileDir) {
  const portFile = join(profileDir, 'DevToolsActivePort');
  const portText = await waitFor(async () => {
    if (chrome.exitCode !== null) throw new Error('Chrome завершился с кодом ' + chrome.exitCode);
    try { return await readFile(portFile, 'utf8'); } catch { return null; }
  }, 'запуска Chrome DevTools', 25000);
  const port = Number(portText.split(/\r?\n/)[0]);
  if (!Number.isInteger(port) || port < 1) throw new Error('Chrome создал некорректный DevToolsActivePort');
  const endpoint = 'http://127.0.0.1:' + port;
  const target = await waitFor(async () => {
    const targets = await readJson(endpoint + '/json/list');
    return targets.find(item => item.type === 'page' && item.url === 'about:blank');
  }, 'вкладки Chrome', 15000);
  return target;
}

async function evaluate(devtools, expression) {
  const result = await devtools.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Ошибка выполнения проверки в браузере');
  }
  return result.result?.value;
}

async function waitForDocument(devtools) {
  await waitFor(async () => (await evaluate(devtools, 'document.readyState')) === 'complete', 'загрузки страницы');
  await waitFor(async () => Boolean(await evaluate(devtools, "Boolean(document.querySelector('nav[aria-label=\"Основные разделы\"]'))")), 'инициализации навигации');
  await delay(500);
}

async function captureScreenshot(devtools, outputPath) {
  const result = await devtools.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true
  });
  await writeFile(outputPath, Buffer.from(result.data, 'base64'));
}

function terminateChrome(chrome) {
  if (!chrome || chrome.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { chrome.kill('SIGTERM'); } catch {}
  }
}

export async function runLocalBrowserSmoke({ root = PROJECT_ROOT } = {}) {
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    platform: process.platform + ' ' + process.arch,
    nodeVersion: process.version,
    isolation: 'temporary Chrome profile; no existing browser profile or application data is opened',
    externalNetwork: 'all page requests outside the loopback test server are blocked before dispatch',
    checks: [],
    blockedExternalHosts: [],
    localHttpErrors: [],
    browserErrors: [],
    screenshots: [],
    status: 'running'
  };
  let staticServer;
  let chrome;
  let devtools;
  let profileDir;
  let outputDir;
  try {
    const rootPath = await realpath(root);
    await access(join(rootPath, 'index.html'));
    if (typeof globalThis.WebSocket !== 'function') {
      throw new Error('Для автоматического управления Chrome нужен Node.js 20.10+ (рекомендуется Node.js 22 LTS).');
    }
    const chromePath = await findChrome();
    staticServer = await startStaticServer(rootPath);
    const appUrl = staticServer.origin + '/';
    profileDir = await mkdtemp(join(tmpdir(), 'paseka-chrome-isolated-'));
    outputDir = join(rootPath, '.local-test-results', new Date().toISOString().replace(/[:.]/g, '-'));
    await mkdir(outputDir, { recursive: true });

    const args = [
      ...(process.platform === 'linux' ? ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'] : []),
      '--host-resolver-rules=MAP paseka.test 127.0.0.1',
      '--remote-debugging-port=0',
      '--remote-debugging-address=127.0.0.1',
      '--remote-allow-origins=*',
      '--user-data-dir=' + profileDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-breakpad',
      '--disable-features=MediaRouter,Translate,OptimizationHints',
      '--window-size=1440,1000',
      'about:blank'
    ];
    chrome = spawn(chromePath, args, { stdio: 'ignore', windowsHide: true });
    const target = await waitForChrome(chrome, profileDir);
    devtools = await connectDevTools(target.webSocketDebuggerUrl);

    devtools.on('Fetch.requestPaused', async event => {
      if (isAllowedLocalUrl(event.request.url, staticServer.origin)) {
        await devtools.send('Fetch.continueRequest', { requestId: event.requestId });
      } else {
        try {
          const host = new URL(event.request.url).host;
          if (host && !report.blockedExternalHosts.includes(host)) report.blockedExternalHosts.push(host);
        } catch {}
        await devtools.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
      }
    });
    devtools.on('Runtime.exceptionThrown', event => {
      const details = event.exceptionDetails || {};
      report.browserErrors.push({
        type: 'uncaught-exception',
        message: details.exception?.description || details.text || 'Uncaught browser exception'
      });
    });
    devtools.on('Runtime.consoleAPICalled', event => {
      if (event.type !== 'error') return;
      const message = (event.args || []).map(arg => arg.value ?? arg.description ?? '').join(' ').trim();
      if (!/ERR_BLOCKED_BY_CLIENT|net::ERR_BLOCKED_BY_CLIENT/i.test(message)) {
        report.browserErrors.push({ type: 'console.error', message: message || 'console.error called' });
      }
    });
    devtools.on('Network.responseReceived', event => {
      if (isAllowedLocalUrl(event.response.url, staticServer.origin) && event.response.status >= 400) {
        report.localHttpErrors.push({ url: new URL(event.response.url).pathname, status: event.response.status });
      }
    });

    await devtools.send('Page.enable');
    await devtools.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: () => Promise.resolve({ update: () => Promise.resolve() }) } });"
    });
    await devtools.send('Runtime.enable');
    await devtools.send('Network.enable');
    await devtools.send('Network.setBypassServiceWorker', { bypass: true });
    await devtools.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await devtools.send('Emulation.setDeviceMetricsOverride', {
      width: 1365,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await devtools.send('Page.navigate', { url: appUrl });
    await waitForDocument(devtools);

    const tabsJson = JSON.stringify(NAV_TABS.map(tab => tab.id));
    const initialExpression = '(() => ({ title: document.title, navCount: document.querySelectorAll(\'nav[aria-label="Основные разделы"] button[data-tab]\').length, activePanel: document.querySelector(".panel.active")?.id || null, missingPanels: ' + tabsJson + '.filter(id => !document.getElementById(id)) }))()';
    const initial = await evaluate(devtools, initialExpression);
    report.checks.push({
      name: 'startup',
      passed: initial.title === 'Пасека' && initial.navCount === NAV_TABS.length && initial.missingPanels.length === 0,
      details: initial
    });

    for (const tab of NAV_TABS) {
      const expression = '(() => { const button = document.querySelector(\'nav[aria-label="Основные разделы"] button[data-tab="' + tab.id + '"]\'); if (!button) return { found: false, activePanel: null }; button.click(); return { found: true, activePanel: document.querySelector(".panel.active")?.id || null }; })()';
      const result = await evaluate(devtools, expression);
      const passed = result.found && result.activePanel === tab.id;
      report.checks.push({
        name: 'navigation:' + tab.id,
        passed,
        details: { label: tab.label, ...result }
      });
      if (!passed) continue;
      if (['home', 'hives', 'entrance', 'journal', 'settings'].includes(tab.id)) {
        const file = join(outputDir, tab.id + '.png');
        await captureScreenshot(devtools, file);
        report.screenshots.push(file.slice(rootPath.length + 1));
      }
      await delay(100);
    }

    await evaluate(devtools, 'document.querySelector(\'nav[aria-label="Основные разделы"] button[data-tab="home"]\').click()');
    await devtools.send('Page.reload', { ignoreCache: true });
    await waitForDocument(devtools);
    const reloadState = await evaluate(devtools, '({ title: document.title, activePanel: document.querySelector(".panel.active")?.id || null, navCount: document.querySelectorAll(\'nav[aria-label="Основные разделы"] button[data-tab]\').length })');
    report.checks.push({
      name: 'reload',
      passed: reloadState.title === 'Пасека' && reloadState.activePanel === 'home' && reloadState.navCount === NAV_TABS.length,
      details: reloadState
    });

    report.finishedAt = new Date().toISOString();
    report.chromePath = chromePath;
    report.appUrl = appUrl;
    report.status = report.checks.every(check => check.passed) &&
      report.localHttpErrors.length === 0 && report.browserErrors.length === 0
      ? 'passed'
      : 'failed';
  } catch (error) {
    report.status = 'failed';
    report.fatalError = error?.stack || String(error);
    report.finishedAt = new Date().toISOString();
  } finally {
    devtools?.close();
    terminateChrome(chrome);
    await delay(300);
    if (profileDir) await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    if (staticServer) await staticServer.close().catch(() => {});
  }

  if (!outputDir) {
    outputDir = join(root, '.local-test-results', new Date().toISOString().replace(/[:.]/g, '-'));
    await mkdir(outputDir, { recursive: true });
  }
  const reportPath = join(outputDir, 'report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return { report, reportPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runLocalBrowserSmoke();
  const report = result.report;
  console.log('\nПроверка приложения: ' + (report.status === 'passed' ? 'УСПЕШНО' : 'ЕСТЬ ОШИБКИ'));
  console.log('Проверки: ' + report.checks.filter(check => check.passed).length + '/' + report.checks.length);
  console.log('Ошибки браузера: ' + report.browserErrors.length + '; HTTP-ошибки: ' + report.localHttpErrors.length);
  console.log('Заблокировано внешних хостов: ' + report.blockedExternalHosts.length);
  console.log('Отчёт: ' + result.reportPath);
  if (report.fatalError) console.error(report.fatalError);
  if (report.status !== 'passed') process.exitCode = 1;
}
