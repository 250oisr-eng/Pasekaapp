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

    function status(message) {
      if (typeof onStatus === 'function') onStatus(message);
    }

    function clearArmed() {
      armed = false;
      armExpiresAt = 0;
    }

    function stop() {
      active = false;
      clearArmed();
      if (recognition) {
        const current = recognition;
        recognition = null;
        try { current.stop(); } catch (error) {}
      }
      if (windowRef.speechSynthesis) windowRef.speechSynthesis.cancel();
      speaking = false;
      const button = getElement('aiVoiceSessionButton');
      if (button) {
        button.textContent = '🎙 Начать сеанс';
        button.classList.add('primary');
      }
      status('Сеанс выключен. Микрофон больше не используется этим режимом.');
    }

    function startRecognition() {
      if (!active || speaking || recognition) return;
      const Speech = windowRef.SpeechRecognition || windowRef.webkitSpeechRecognition;
      if (!Speech) {
        status('На этом устройстве браузер не поддерживает непрерывное распознавание. Используй разовую диктовку или голосовой ввод клавиатуры.');
        stop();
        return;
      }
      const current = new Speech();
      recognition = current;
      current.lang = 'ru-RU';
      current.continuous = true;
      current.interimResults = false;
      current.maxAlternatives = 1;
      current.onresult = event => {
        for (let i = event.resultIndex || 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result.isFinal) continue;
          const transcript = String(result[0]?.transcript || '').trim();
          if (transcript && typeof onTranscript === 'function') onTranscript(transcript);
        }
      };
      current.onerror = event => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          status('Нет разрешения на микрофон или службу распознавания. Разреши доступ в Android и запусти сеанс снова.');
          stop();
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          status('Ошибка распознавания: ' + event.error + '. Попробую продолжить слушать.');
        }
      };
      current.onend = () => {
        if (recognition === current) recognition = null;
        if (active && !speaking) setTimer(startRecognition, 350);
      };
      try {
        current.start();
        status(armed ? 'Слушаю команду…' : 'Сеанс активен. Скажи «Пасека, слушай».');
      } catch (error) {
        if (recognition === current) recognition = null;
        status('Не удалось запустить микрофон: ' + (error.message || error));
        stop();
      }
    }

    function start() {
      const Speech = windowRef.SpeechRecognition || windowRef.webkitSpeechRecognition;
      if (!Speech) {
        status('Браузер не поддерживает голосовой сеанс. Попробуй разовую диктовку.');
        return false;
      }
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
      speaking = true;
      if (recognition) {
        const current = recognition;
        recognition = null;
        try { current.stop(); } catch (error) {}
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
      stop,
      startRecognition,
      speak,
      status,
      arm,
      clearArmed,
      isArmed,
      get state() {
        return { active, armed, speaking, armExpiresAt, recognition };
      }
    };
  }

  window.PasekaVoiceSession = { createApiaryVoiceSession };
})();
