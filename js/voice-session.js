(() => {
  function createApiaryVoiceSession(deps) {
    const windowRef = deps.windowRef;
    const getElement = deps.getElement;
    const onTranscript = deps.onTranscript;
    const onStatus = deps.onStatus;
    const setTimer = deps.setTimer || setTimeout;
    const Utterance = deps.getUtterance;
    let recognition = null;
    let active = false;
    let armed = false;
    let speaking = false;
    let armExpiresAt = 0;
    let provider = 'none';
    let allowOnlineFallback = false;
    let starting = false;
    let nativePlugin = null;
    let nativeListening = false;
    let stoppingNative = false;
    let suppressNativeStopFinal = false;
    let nativeListenersPromise = null;
    let oneShotMode = false;
    let oneShotCallback = null;
    let oneShotFinish = null;

    function status(message) {
      if (typeof onStatus === 'function') onStatus(message);
    }

    function getSpeechConstructor() {
      return windowRef.SpeechRecognition || windowRef.webkitSpeechRecognition || null;
    }

    function getNativePlugin() {
      return windowRef.Capacitor?.Plugins?.PasekaOfflineSpeech || null;
    }

    function clearArmed() {
      armed = false;
      armExpiresAt = 0;
    }

    function updateSessionButton(isActive) {
      const button = getElement('aiVoiceSessionButton');
      if (!button) return;
      button.textContent = isActive ? '■ Завершить сеанс' : '🎙 Начать сеанс';
      if (isActive) button.classList.remove('primary');
      else button.classList.add('primary');
    }

    function finishOneShot() {
      const finish = oneShotFinish;
      oneShotFinish = null;
      oneShotCallback = null;
      oneShotMode = false;
      if (typeof finish === 'function') {
        try { finish(); } catch (error) {}
      }
    }

    function stop(message = null, options = {}) {
      active = false;
      starting = false;
      clearArmed();
      if (recognition) {
        const current = recognition;
        recognition = null;
        try { current.stop(); } catch (error) {}
      }
      if (nativeListening && nativePlugin) {
        const current = nativePlugin;
        nativeListening = false;
        stoppingNative = true;
        suppressNativeStopFinal = options.preserveFinal === false;
        Promise.resolve(current.stop()).catch(() => {}).finally(() => {
          setTimer(() => {
            stoppingNative = false;
            suppressNativeStopFinal = false;
          }, 200);
        });
      }
      provider = 'none';
      if (windowRef.speechSynthesis) windowRef.speechSynthesis.cancel();
      speaking = false;
      updateSessionButton(false);
      const finalMessage = message || 'Сеанс выключен. Микрофон больше не используется этим режимом.';
      status(finalMessage);
      if (oneShotMode || oneShotCallback || oneShotFinish) finishOneShot();
    }

    function deliverTranscript(value) {
      if (!active && !(stoppingNative && !suppressNativeStopFinal)) return;
      const transcript = String(value || '').trim();
      if (!transcript) return;
      if (oneShotMode) {
        const callback = oneShotCallback;
        oneShotCallback = null;
        oneShotMode = false;
        try {
          if (typeof callback === 'function') callback(transcript);
        } finally {
          stop('Диктовка завершена. Текст добавлен в поле ввода.', { preserveFinal: false });
        }
        return;
      }
      if (typeof onTranscript === 'function') onTranscript(transcript);
    }

    async function ensureNativeListeners(plugin) {
      if (nativeListenersPromise) return nativeListenersPromise;
      nativeListenersPromise = Promise.all([
        plugin.addListener('result', event => deliverTranscript(event?.text)),
        plugin.addListener('partialResult', event => {
          if (active && event?.text) status('Локально распознано: ' + String(event.text).slice(0, 140));
        }),
        plugin.addListener('modelDownloadProgress', event => {
          if (!event) return;
          const percent = Number(event.percent);
          status(percent >= 0 ? 'Загрузка офлайн-модели: ' + percent + '%' : 'Загрузка офлайн-модели…');
        }),
        plugin.addListener('error', event => {
          if (active) stop('Ошибка локального распознавания: ' + String(event?.message || 'неизвестная ошибка'));
        })
      ]).then(handles => {
        return handles;
      }).catch(error => {
        nativeListenersPromise = null;
        throw error;
      });
      return nativeListenersPromise;
    }

    async function browserLocalAvailability(Speech) {
      if (!Speech || typeof Speech.available !== 'function' || typeof Speech.install !== 'function' || !('processLocally' in Speech.prototype)) return 'unsupported';
      try {
        return await Speech.available({ langs: ['ru-RU'], processLocally: true, quality: 'dictation' });
      } catch (error) {
        try {
          return await Speech.available({ langs: ['ru-RU'], processLocally: true });
        } catch (nestedError) {
          return 'unsupported';
        }
      }
    }

    async function startBrowserRecognition(local) {
      const Speech = getSpeechConstructor();
      if (!Speech) throw new Error('В этом браузере нет распознавания речи');
      const current = new Speech();
      recognition = current;
      provider = local ? 'web-speech-local' : 'web-speech-online';
      current.lang = 'ru-RU';
      current.continuous = true;
      current.interimResults = false;
      current.maxAlternatives = 1;
      if ('processLocally' in current) current.processLocally = Boolean(local);
      current.onresult = event => {
        for (let i = event.resultIndex || 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result.isFinal) continue;
          deliverTranscript(result[0]?.transcript || '');
        }
      };
      current.onerror = event => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stop('Нет разрешения на микрофон или службу распознавания. Разреши доступ и запусти сеанс снова.');
        } else if (event.error === 'language-not-supported' && local) {
          stop('Локальная модель русского языка недоступна. Установи офлайн-модель или отдельно разреши онлайн-распознавание.');
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          status('Ошибка распознавания: ' + event.error + '.');
        }
      };
      current.onend = () => {
        if (recognition === current) recognition = null;
        if (active && !speaking) setTimer(() => startRecognition(), 350);
      };
      current.start();
      status(local
        ? 'Слушаю. Распознавание выполняется локально на устройстве.'
        : 'Слушаю. Включено онлайн-распознавание; аудио может передаваться внешней службе.');
    }

    async function startRecognition(forceOnline = false) {
      if (!active || speaking || recognition || nativeListening || starting || stoppingNative) return;
      starting = true;
      try {
        if (!forceOnline) {
          const native = getNativePlugin();
          if (native && typeof native.getStatus === 'function' && typeof native.start === 'function') {
            nativePlugin = native;
            await ensureNativeListeners(native);
            const nativeStatus = await native.getStatus();
            if (!active) return;
            if (nativeStatus?.modelInstalled) {
              await native.start();
              if (!active) {
                await native.stop().catch(() => {});
                return;
              }
              nativeListening = true;
              provider = 'vosk-android';
              status('Слушаю. Русская речь распознаётся локально на телефоне; аудио не отправляется в интернет.');
              return;
            }
            if (!allowOnlineFallback) {
              stop('Офлайн-модель русского языка не установлена. Нажми «Установить офлайн-распознавание».');
              return;
            }
          } else {
            const Speech = getSpeechConstructor();
            if (Speech) {
              const availability = await browserLocalAvailability(Speech);
              if (!active) return;
              if (availability === 'available') {
                await startBrowserRecognition(true);
                return;
              }
              if (!allowOnlineFallback) {
                stop(availability === 'downloadable'
                  ? 'Доступна загрузка локальной модели русского языка. Нажми «Установить офлайн-распознавание».'
                  : 'Локальное распознавание не поддерживается этим браузером. Онлайн-режим выключен.');
                return;
              }
            }
          }
        }
        if (allowOnlineFallback) {
          await startBrowserRecognition(false);
          return;
        }
        stop('Локальное распознавание недоступно. Онлайн-режим выключен; аудио не отправлялось.');
      } catch (error) {
        if (active && allowOnlineFallback && !forceOnline) {
          try {
            await startBrowserRecognition(false);
            return;
          } catch (fallbackError) {
            stop('Не удалось запустить распознавание: ' + (fallbackError.message || fallbackError));
          }
        } else {
          stop('Не удалось запустить локальное распознавание: ' + (error.message || error));
        }
      } finally {
        starting = false;
      }
    }

    async function start(options = {}) {
      if (active || stoppingNative) {
        status('Дождись завершения остановки микрофона и повтори попытку.');
        return false;
      }
      active = true;
      allowOnlineFallback = options.allowOnline === true;
      oneShotMode = false;
      finishOneShot();
      clearArmed();
      updateSessionButton(true);
      await startRecognition();
      return active;
    }

    function startOneShot(callback, options = {}) {
      if (active || stoppingNative || typeof callback !== 'function') return false;
      oneShotMode = true;
      oneShotCallback = callback;
      oneShotFinish = options.onFinish || null;
      allowOnlineFallback = options.allowOnline === true;
      active = true;
      clearArmed();
      startRecognition();
      return true;
    }

    async function prepareOffline() {
      if (active || stoppingNative) {
        status('Сначала заверши текущий голосовой сеанс и дождись остановки микрофона.');
        return false;
      }
      const native = getNativePlugin();
      if (native && typeof native.getStatus === 'function' && typeof native.downloadModel === 'function') {
        nativePlugin = native;
        await ensureNativeListeners(native);
        const current = await native.getStatus();
        if (current?.modelInstalled) {
          status('Офлайн-модель русского языка уже установлена. Распознавание будет выполняться на телефоне.');
          return true;
        }
        status('Загрузка русской офлайн-модели (~45 МБ; для работы требуется около 300 МБ RAM). Загрузка разрешена только через Wi-Fi.');
        const result = await native.downloadModel();
        if (result?.modelInstalled) {
          status('Офлайн-модель установлена. Голосовое распознавание готово к работе без интернета.');
          return true;
        }
        status('Модель не установлена. Проверь Wi-Fi и свободное место.');
        return false;
      }
      const Speech = getSpeechConstructor();
      if (Speech && typeof Speech.install === 'function' && 'processLocally' in Speech.prototype) {
        status('Установка локальной модели русского языка в браузере…');
        let installed = false;
        try {
          installed = await Speech.install({ langs: ['ru-RU'], processLocally: true, quality: 'dictation' });
        } catch (error) {
          installed = await Speech.install({ langs: ['ru-RU'], processLocally: true });
        }
        const availability = await browserLocalAvailability(Speech);
        if (installed && availability === 'available') {
          status('Локальная модель русского языка установлена. Аудио будет обрабатываться в браузере.');
          return true;
        }
      }
      status('На этом устройстве нет доступного локального провайдера речи. Онлайн-распознавание можно включить отдельно.');
      return false;
    }

    function speak(value) {
      if (!active || !windowRef.speechSynthesis || typeof Utterance !== 'function') return;
      const text = String(value || '').trim().slice(0, 900);
      if (!text) return;
      speaking = true;
      if (recognition) {
        const current = recognition;
        recognition = null;
        try { current.stop(); } catch (error) {}
      }
      if (nativeListening && nativePlugin) {
        nativeListening = false;
        stoppingNative = true;
        suppressNativeStopFinal = true;
        Promise.resolve(nativePlugin.stop()).catch(() => {}).finally(() => {
          setTimer(() => {
            stoppingNative = false;
            suppressNativeStopFinal = false;
          }, 200);
        });
      }
      windowRef.speechSynthesis.cancel();
      const utterance = new Utterance(text);
      utterance.lang = 'ru-RU';
      utterance.rate = 1;
      const resume = () => {
        speaking = false;
        if (active) startRecognition();
      };
      utterance.onend = resume;
      utterance.onerror = resume;
      windowRef.speechSynthesis.speak(utterance);
    }

    function arm(durationMs = 15000) {
      armed = true;
      armExpiresAt = Date.now() + durationMs;
    }

    function isArmed() {
      if (armed && Date.now() > armExpiresAt) clearArmed();
      return armed;
    }

    return {
      start,
      startOneShot,
      prepareOffline,
      stop,
      startRecognition,
      speak,
      status,
      arm,
      clearArmed,
      isArmed,
      get state() {
        return { active, armed, speaking, armExpiresAt, recognition, provider, nativeListening, oneShotMode, allowOnlineFallback };
      }
    };
  }

  window.PasekaVoiceSession = { createApiaryVoiceSession };
})();
