(() => {
  function createApiaryVoiceSession(deps) {
    const {windowRef, getElement, onTranscript, onStatus} = deps;
    const setTimer = deps.setTimer || setTimeout;
    const Utterance = deps.getUtterance;
    let recognition = null, active = false, armed = false, speaking = false;
    let armExpiresAt = 0, generation = 0, speechGeneration = 0;

    function status(message) {
      if (typeof onStatus === 'function') onStatus(message);
    }

    function clearArmed() {
      armed = false;
      armExpiresAt = 0;
    }

    // Invalidate callbacks BEFORE asking the browser to stop. stop()/abort()
    // can deliver a final result or onend synchronously or much later.
    function releaseRecognition() {
      const current = recognition;
      recognition = null;
      if (!current) return;
      try {
        if (typeof current.abort === 'function') current.abort();
        else current.stop();
      } catch (error) {}
    }

    function stop(reason) {
      generation++;
      speechGeneration++;
      active = false;
      clearArmed();
      speaking = false;
      releaseRecognition();
      try { windowRef.speechSynthesis?.cancel(); } catch (error) {}
      const button = getElement('aiVoiceSessionButton');
      if (button) {
        button.textContent = '🎙 Начать сеанс';
        button.classList.add('primary');
      }
      status(reason || 'Сеанс выключен. Микрофон больше не используется этим режимом.');
    }

    function startRecognition() {
      if (!active || speaking || recognition) return;
      const Speech = windowRef.SpeechRecognition || windowRef.webkitSpeechRecognition;
      if (!Speech) {
        stop('На этом устройстве браузер не поддерживает непрерывное распознавание. Используй голосовой ввод клавиатуры.');
        return;
      }
      const session = generation;
      let current;
      try {
        current = new Speech();
        recognition = current;
        current.lang = 'ru-RU';
        current.continuous = true;
        current.interimResults = false;
        current.maxAlternatives = 1;
        const isCurrent = () => active && !speaking && generation === session && recognition === current;
        current.onresult = event => {
          for (let i = event.resultIndex || 0; i < (event.results?.length || 0); i++) {
            if (!isCurrent()) return;
            const result = event.results[i];
            if (!result.isFinal) continue;
            const transcript = String(result[0]?.transcript || '').trim();
            if (transcript && typeof onTranscript === 'function') onTranscript(transcript);
          }
        };
        current.onerror = event => {
          if (!isCurrent()) return;
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            stop('Нет разрешения на микрофон или службу распознавания. Разреши доступ и запусти сеанс снова.');
          } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
            // Terminal errors may never produce onend. Avoid unattended retries
            // and keep the reason visible; restarting needs a user action.
            stop('Ошибка распознавания: ' + event.error + '. Запусти сеанс снова после устранения причины.');
          }
        };
        current.onend = () => {
          if (!isCurrent()) return;
          recognition = null;
          setTimer(() => {
            if (generation === session && active && !speaking && !recognition) startRecognition();
          }, 350);
        };
        current.start();
        if (isCurrent()) status(armed ? 'Слушаю команду…' : 'Сеанс активен. Скажи «Пасека, слушай».');
      } catch (error) {
        if (generation === session && active) stop('Не удалось запустить микрофон: ' + (error.message || error));
      }
    }

    function start() {
      if (active) return true;
      const Speech = windowRef.SpeechRecognition || windowRef.webkitSpeechRecognition;
      if (!Speech) {
        status('Браузер не поддерживает голосовой сеанс. Попробуй голосовой ввод клавиатуры.');
        return false;
      }
      generation++;
      active = true;
      clearArmed();
      const button = getElement('aiVoiceSessionButton');
      if (button) {
        button.textContent = '■ Завершить сеанс';
        button.classList.remove('primary');
      }
      startRecognition();
      return active;
    }

    function speak(value) {
      if (!active || !windowRef.speechSynthesis || typeof Utterance !== 'function') return;
      const text = String(value || '').trim().slice(0, 900);
      if (!text) return;
      const session = generation, speech = ++speechGeneration;
      speaking = true;
      releaseRecognition();
      const resume = () => {
        if (!active || generation !== session || speechGeneration !== speech || !speaking) return;
        speaking = false;
        startRecognition();
      };
      try {
        windowRef.speechSynthesis.cancel();
        const utterance = new Utterance(text);
        utterance.lang = 'ru-RU';
        utterance.rate = 1;
        utterance.onend = resume;
        utterance.onerror = resume;
        windowRef.speechSynthesis.speak(utterance);
      } catch (error) {
        resume();
      }
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
      start, stop, startRecognition, speak, status, arm, clearArmed, isArmed,
      get state() { return { active, armed, speaking, armExpiresAt, recognition }; }
    };
  }

  window.PasekaVoiceSession = { createApiaryVoiceSession };
})();
