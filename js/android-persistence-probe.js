(function () {
  'use strict';
  // This script is injected only into the isolated Android test APK.
  const fallback = document.getElementById('androidPersistenceProbeFallback');
  if (typeof window === 'undefined' || window.__PASEKA_TEST_BUILD__ !== true) {
    if (fallback) fallback.textContent = 'Тестовый режим не подтверждён. Сохранение не проверялось.';
    return;
  }

  const markerKey = 'androidPersistenceProbe';
  let ready = false;
  let busy = false;
  let writtenInThisSession = false;
  let messageOverride = '';

  const settings = document.getElementById('settings');
  if (!settings) {
    if (fallback) fallback.textContent = 'Панель «Ещё» не найдена. Сохранение не проверялось.';
    return;
  }
  if (document.getElementById('androidPersistenceProbe')) return;

  const panel = document.createElement('div');
  panel.id = 'androidPersistenceProbe';
  panel.className = 'card';
  panel.style.border = '2px dashed #8b7655';
  panel.style.marginTop = '16px';
  panel.innerHTML = [
    '<b>Проверка сохранения — тестовая APK</b>',
    '<p class="muted">Проверяется служебная отметка в основном состоянии IndexedDB через штатное сохранение. Улей, семью, матку и запись пасеки создавать не нужно.</p>',
    '<p id="androidPersistenceProbeStatus" role="status">Ожидание открытия локальной базы…</p>',
    '<button type="button" class="primary" id="androidPersistenceProbeCreate" disabled>Записать тестовую отметку</button>',
    '<button type="button" id="androidPersistenceProbeClear" hidden>Удалить тестовую отметку</button>'
  ].join('');
  settings.appendChild(panel);
  if (fallback) fallback.hidden = true;

  const status = panel.querySelector('#androidPersistenceProbeStatus');
  const createButton = panel.querySelector('#androidPersistenceProbeCreate');
  const clearButton = panel.querySelector('#androidPersistenceProbeClear');

  function setStatus(message, failed = false) {
    status.textContent = message;
    status.style.color = failed ? '#a33' : '';
  }

  function markerFromState() {
    return typeof S !== 'undefined' && S.meta ? S.meta[markerKey] || null : null;
  }

  function refresh() {
    const marker = markerFromState();
    createButton.disabled = !ready || busy || Boolean(marker);
    createButton.hidden = Boolean(marker);
    clearButton.hidden = !ready || busy || !marker || writtenInThisSession;
    clearButton.disabled = !ready || busy;
    if (!ready) setStatus('Ожидание безопасного открытия локальной базы…');
    else if (marker && writtenInThisSession) {
      setStatus('Отметка записана и прочитана из IndexedDB в этой сессии. Полностью закрой приложение через список последних приложений и открой снова. После перезапуска этот блок должен подтвердить сохранение.');
    } else if (marker) {
      setStatus('Тестовая отметка найдена в основном состоянии IndexedDB после запуска приложения. Повторный запуск подтвердил сохранение.');
    } else if (messageOverride) setStatus(messageOverride);
    else setStatus('Тестовая отметка отсутствует. Можно начать проверку.');
  }

  async function createMarker() {
    if (!ready || busy || markerFromState()) return;
    busy = true;
    messageOverride = '';
    refresh();
    const marker = {
      version: 1,
      token: window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + '-' + Math.random(),
      createdAt: new Date().toISOString()
    };
    S.meta = S.meta || {};
    S.meta[markerKey] = marker;
    try {
      const saved = await save();
      if (!saved) throw new Error(S.meta?.saveError || 'Штатное сохранение вернуло отказ.');
      const persisted = await readMain();
      if (persisted?.meta?.[markerKey]?.token !== marker.token) {
        throw new Error('Контрольное чтение не подтвердило записанную отметку.');
      }
      writtenInThisSession = true;
    } catch (error) {
      if (S.meta?.[markerKey]?.token === marker.token) delete S.meta[markerKey];
      messageOverride = 'Проверка не пройдена: ' + (error?.message || String(error));
    } finally {
      busy = false;
      refresh();
    }
  }

  async function clearMarker() {
    if (!ready || busy || !markerFromState() || writtenInThisSession) return;
    if (!window.confirm('Удалить только служебную тестовую отметку из тестовой базы и обновить её автокопию?')) return;
    busy = true;
    messageOverride = '';
    refresh();
    const marker = markerFromState();
    try {
      delete S.meta[markerKey];
      const saved = await save();
      if (!saved) {
        S.meta[markerKey] = marker;
        throw new Error(S.meta?.saveError || 'Не удалось сохранить очистку отметки.');
      }
      const persisted = await readMain();
      if (persisted?.meta?.[markerKey]) throw new Error('Основная база всё ещё содержит тестовую отметку.');
      const backupWritten = await writeAutoBackup(S, S.meta?.revisionId || null);
      if (!backupWritten) throw new Error('Основная база очищена, но обновление автокопии не подтверждено. Не удаляй приложение; сообщи об этом результате.');
      const backup = await readAutoBackup();
      if (backup?.state?.meta?.[markerKey]) throw new Error('Тестовая отметка осталась в автокопии.');
      writtenInThisSession = false;
      messageOverride = 'Проверка завершена. Тестовая отметка удалена из основной базы и автокопии.';
    } catch (error) {
      messageOverride = 'Очистка не подтверждена: ' + (error?.message || String(error));
    } finally {
      busy = false;
      refresh();
    }
  }

  createButton.addEventListener('click', createMarker);
  clearButton.addEventListener('click', clearMarker);

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (typeof db !== 'undefined' && db && typeof lastPersistedRevision !== 'undefined' && lastPersistedRevision) {
      ready = true;
      clearInterval(timer);
      refresh();
    } else if (attempts >= 300) {
      clearInterval(timer);
      setStatus('Локальная база не перешла в готовое состояние. Сохранение не запускалось.', true);
    }
  }, 100);
  refresh();
})();
