import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(html);
  assert.ok(match, 'Function not found: ' + name);
const next = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  next.lastIndex = match.index + match[0].length;
  const end = next.exec(html);
  return html.slice(match.index, end ? end.index : html.indexOf('</script>', match.index));
}

function loadFunction(name, globals = {}) {
  return new Function('deps', 'with (deps) { return (' + extractFunction(name) + '); }')(globals);
}

test('voice parser recognizes wake phrases with punctuation and Russian case variants', () => {
  const parse = loadFunction('parseApiaryVoiceCommand');
  assert.deepEqual(parse('Пасека, слушай: какие семьи требуют осмотра?'), {
    type: 'question',
    text: 'какие семьи требуют осмотра'
  });
  assert.deepEqual(parse('СЛУШАЙ, покажи последние записи!'), {
    type: 'question',
    text: 'покажи последние записи'
  });
  assert.deepEqual(parse('ПАСЕКА СЛУШАЙ'), { type: 'wake' });
  assert.deepEqual(parse('Пасека, СЛУШАЙ, ПОДТВЕРЖДАЮ!'), { type: 'confirm' });
});

test('voice parser ignores ordinary speech until explicitly armed', () => {
  const parse = loadFunction('parseApiaryVoiceCommand');
  assert.deepEqual(parse('какие семьи требуют внимания'), { type: 'ignore' });
  assert.deepEqual(parse('отмена'), { type: 'ignore' });
  assert.deepEqual(parse('покажи журнал', true), {
    type: 'question',
    text: 'покажи журнал'
  });
  assert.deepEqual(parse('ОТМЕНИ!', true), { type: 'cancel' });
});

test('voice parser maps confirmation, cancellation, repeat and stop to explicit actions', () => {
  const parse = loadFunction('parseApiaryVoiceCommand');
  assert.deepEqual(parse('подтверждаю', true), { type: 'confirm' });
  assert.deepEqual(parse('Пасека слушай, отмена'), { type: 'cancel' });
  assert.deepEqual(parse('Пасека, слушай, повтори'), { type: 'repeat' });
  assert.deepEqual(parse('заверши голосовой режим'), { type: 'stop' });
  assert.deepEqual(parse('Пасека слушай стоп'), { type: 'stop' });
  assert.deepEqual(parse('   '), { type: 'ignore' });
});

test('continuous voice recognition forwards final results only and schedules a safe restart', () => {
  let recognition;
  const forwarded = [];
  const scheduled = [];
  class MockRecognition {
    constructor() { recognition = this; }
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  const deps = {
    window: { SpeechRecognition: MockRecognition },
    apiaryVoiceSessionActive: true,
    apiaryVoiceSpeaking: false,
    apiaryVoiceRecognition: null,
    apiaryVoiceArmed: false,
    apiaryVoiceStatus(message) { this.status = message; },
    handleApiaryVoiceTranscript(value) { forwarded.push(value); },
    setTimeout(callback, delay) { scheduled.push({ callback, delay }); }
  };
  loadFunction('startApiaryVoiceRecognition', deps)();
  assert.ok(recognition.started);
  assert.equal(recognition.lang, 'ru-RU');
  assert.equal(recognition.continuous, true);
  assert.equal(recognition.interimResults, false);
  recognition.onresult({
    resultIndex: 0,
    results: [
      Object.assign([{ transcript: 'interim words' }], { isFinal: false }),
      Object.assign([{ transcript: 'Пасека, слушай' }], { isFinal: true })
    ]
  });
  assert.deepEqual(forwarded, ['Пасека, слушай']);
  recognition.onend();
  assert.equal(deps.apiaryVoiceRecognition, null);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 350);
});

test('voice recognition permission denial stops the session instead of retrying forever', () => {
  let stopped = false;
  const deps = {
    window: { SpeechRecognition: class { start() {} } },
    apiaryVoiceSessionActive: true,
    apiaryVoiceSpeaking: false,
    apiaryVoiceRecognition: null,
    apiaryVoiceArmed: false,
    apiaryVoiceStatus(message) { this.status = message; },
    stopApiaryVoiceSession() { stopped = true; this.apiaryVoiceSessionActive = false; }
  };
  loadFunction('startApiaryVoiceRecognition', deps)();
  const recognition = deps.apiaryVoiceRecognition;
  assert.ok(recognition);
  recognition.onerror({ error: 'not-allowed' });
  assert.equal(stopped, true);
  assert.match(deps.status, /Нет разрешения на микрофон/);
});


test('voice confirmation cannot apply anything when there is no pending AI operation', async () => {
  let confirmationCalls = 0;
  const spoken = [];
  const deps = {
    apiaryVoiceArmed: true,
    apiaryVoiceArmExpiresAt: Date.now() + 10000,
    S: { aiMessages: [] },
    parseApiaryVoiceCommand: loadFunction('parseApiaryVoiceCommand'),
    apiaryVoiceStatus(message) { this.status = message; },
    speakApiaryVoice(message) { spoken.push(message); },
    confirmAICommand() { confirmationCalls++; }
  };
  await loadFunction('handleApiaryVoiceTranscript', deps)('Пасека, слушай, подтверждаю');
  assert.equal(confirmationCalls, 0);
  assert.match(deps.status, /Нет ожидающей подтверждения операции/);
  assert.deepEqual(spoken, ['Нет операции для подтверждения.']);
});

test('voice confirmation delegates to the normal plan revalidation path with explicit voice confirmation', async () => {
  const calls = [];
  const spoken = [];
  const message = { role: 'assistant', commandStatus: 'pending' };
  const deps = {
    apiaryVoiceArmed: true,
    apiaryVoiceArmExpiresAt: Date.now() + 10000,
    S: { aiMessages: [message] },
    parseApiaryVoiceCommand: loadFunction('parseApiaryVoiceCommand'),
    apiaryVoiceStatus(value) { this.status = value; },
    speakApiaryVoice(value) { spoken.push(value); },
    async confirmAICommand(index, voiceConfirmed) {
      calls.push({ index, voiceConfirmed });
      message.commandStatus = 'applied';
      return true;
    }
  };
  await loadFunction('handleApiaryVoiceTranscript', deps)('Пасека слушай подтверждаю');
  assert.deepEqual(calls, [{ index: 0, voiceConfirmed: true }]);
  assert.match(deps.status, /Операция подтверждена и сохранена/);
  assert.deepEqual(spoken, ['Операция подтверждена и сохранена.']);
});

test('stopping voice session releases microphone, cancels speech and resets controls', () => {
  let microphoneStopped = false;
  let speechCancelled = false;
  const button = { textContent: '■ Завершить сеанс', classList: { add(value) { this.added = value; } } };
  const recognition = { stop() { microphoneStopped = true; } };
  const deps = {
    apiaryVoiceSessionActive: true,
    apiaryVoiceArmed: true,
    apiaryVoiceArmExpiresAt: Date.now() + 1000,
    apiaryVoiceRecognition: recognition,
    apiaryVoiceSpeaking: true,
    window: { speechSynthesis: { cancel() { speechCancelled = true; } } },
    $(id) { return id === 'aiVoiceSessionButton' ? button : null; },
    apiaryVoiceStatus(message) { this.status = message; }
  };
  loadFunction('stopApiaryVoiceSession', deps)();
  assert.equal(deps.apiaryVoiceSessionActive, false);
  assert.equal(deps.apiaryVoiceArmed, false);
  assert.equal(deps.apiaryVoiceArmExpiresAt, 0);
  assert.equal(deps.apiaryVoiceRecognition, null);
  assert.equal(deps.apiaryVoiceSpeaking, false);
  assert.equal(microphoneStopped, true);
  assert.equal(speechCancelled, true);
  assert.equal(button.textContent, '🎙 Начать сеанс');
  assert.equal(button.classList.added, 'primary');
  assert.match(deps.status, /Сеанс выключен/);
});
