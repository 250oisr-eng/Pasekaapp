import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const parserSource = await readFile(new URL('../js/voice-command-parser.js', import.meta.url), 'utf8');
const sessionSource = await readFile(new URL('../js/voice-session.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const webPrepareScript = await readFile(new URL('../scripts/prepare-web.mjs', import.meta.url), 'utf8');

function loadVoiceParser() {
  return new Function(parserSource + '\nreturn parseApiaryVoiceCommand;')();
}

function loadVoiceSession(windowRef, deps = {}) {
  const factory = new Function('window', sessionSource + '\nreturn window.PasekaVoiceSession.createApiaryVoiceSession;')(windowRef);
  return factory({ windowRef, getElement: () => null, ...deps });
}

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

test('voice modules load before the app and are precached and packaged for offline use', () => {
  const parserScript = html.indexOf('<script src="./js/voice-command-parser.js"></script>');
  const sessionScript = html.indexOf('<script src="./js/voice-session.js"></script>');
  const appScript = html.indexOf('<script>', sessionScript);
  assert.ok(parserScript >= 0 && sessionScript > parserScript && appScript > sessionScript);
  assert.match(html, /window\.PasekaVoiceSession\.createApiaryVoiceSession/);
  assert.match(html, /apiaryVoiceSession\.state\.active/);
  assert.doesNotMatch(html, /apiaryVoiceRecognition|apiaryVoiceSessionActive|apiaryVoiceArmed|apiaryVoiceSpeaking|apiaryVoiceArmExpiresAt/);
  assert.match(serviceWorker, /paseka-shell-v\d+/);
  assert.match(serviceWorker, /\.\/js\/voice-command-parser\.js/);
  assert.match(serviceWorker, /\.\/js\/voice-session\.js/);
  assert.match(webPrepareScript, /cp\("js", "www\/js", \{ recursive: true \}\)/);
});

test('voice parser recognizes wake phrases with punctuation and Russian case variants', () => {
  const parse = loadVoiceParser();
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
  const parse = loadVoiceParser();
  assert.deepEqual(parse('какие семьи требуют внимания'), { type: 'ignore' });
  assert.deepEqual(parse('отмена'), { type: 'ignore' });
  assert.deepEqual(parse('покажи журнал', true), {
    type: 'question',
    text: 'покажи журнал'
  });
  assert.deepEqual(parse('ОТМЕНИ!', true), { type: 'cancel' });
});

test('voice parser maps confirmation, cancellation, repeat and stop to explicit actions', () => {
  const parse = loadVoiceParser();
  assert.deepEqual(parse('подтверждаю', true), { type: 'confirm' });
  assert.deepEqual(parse('Пасека слушай, отмена'), { type: 'cancel' });
  assert.deepEqual(parse('Пасека, слушай, повтори'), { type: 'repeat' });
  assert.deepEqual(parse('заверши голосовой режим'), { type: 'stop' });
  assert.deepEqual(parse('Пасека слушай стоп'), { type: 'stop' });
  assert.deepEqual(parse('   '), { type: 'ignore' });
});

test('voice session starts continuous Russian recognition and forwards final results only', () => {
  let recognition;
  const forwarded = [];
  const scheduled = [];
  const statuses = [];
  class MockRecognition {
    constructor() { recognition = this; }
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  const windowRef = { SpeechRecognition: MockRecognition };
  const session = loadVoiceSession(windowRef, {
    onTranscript: value => forwarded.push(value),
    onStatus: value => statuses.push(value),
    setTimer(callback, delay) { scheduled.push({ callback, delay }); }
  });
  assert.equal(session.start(), true);
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
  assert.equal(session.state.recognition, null);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 350);
});

test('voice session stops after microphone permission denial', () => {
  let recognition;
  const statuses = [];
  class MockRecognition {
    constructor() { recognition = this; }
    start() {}
    stop() { this.stopped = true; }
  }
  const session = loadVoiceSession({ SpeechRecognition: MockRecognition }, {
    onStatus: value => statuses.push(value)
  });
  session.start();
  recognition.onerror({ error: 'not-allowed' });
  assert.equal(session.state.active, false);
  assert.equal(recognition.stopped, true);
  assert.match(statuses.join(' '), /Нет разрешения на микрофон/);
});

test('stopping voice session releases microphone, cancels speech and resets controls', () => {
  let microphoneStopped = false;
  let speechCancelled = false;
  const button = { textContent: '■ Завершить сеанс', classList: { add(value) { this.added = value; }, remove() {} } };
  const recognition = { start() {}, stop() { microphoneStopped = true; } };
  class MockUtterance {}
  const windowRef = {
    SpeechRecognition: class { constructor() { return recognition; } },
    speechSynthesis: { cancel() { speechCancelled = true; }, speak() {} }
  };
  const session = loadVoiceSession(windowRef, {
    getElement(id) { return id === 'aiVoiceSessionButton' ? button : null; },
    getUtterance: MockUtterance
  });
  session.start();
  session.arm(10000);
  session.stop();
  assert.equal(session.state.active, false);
  assert.equal(session.state.armed, false);
  assert.equal(session.state.armExpiresAt, 0);
  assert.equal(session.state.recognition, null);
  assert.equal(microphoneStopped, true);
  assert.equal(speechCancelled, true);
  assert.equal(button.textContent, '🎙 Начать сеанс');
  assert.equal(button.classList.added, 'primary');
});

test('voice confirmation cannot apply anything when there is no pending AI operation', async () => {
  let confirmationCalls = 0;
  const spoken = [];
  const deps = {
    apiaryVoiceSession: { isArmed: () => true, clearArmed() {}, arm() {} },
    S: { aiMessages: [] },
    parseApiaryVoiceCommand: loadVoiceParser(),
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
    apiaryVoiceSession: { isArmed: () => true, clearArmed() {}, arm() {} },
    S: { aiMessages: [message] },
    parseApiaryVoiceCommand: loadVoiceParser(),
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
test('voice parser recognizes explicit journal draft commands without saving records',()=>{const parse=loadVoiceParser();assert.deepEqual(parse('Пасека, слушай, запиши в журнал: осмотрел улей, матку видел',true),{type:'journal_draft',text:'осмотрел улей, матку видел'});assert.deepEqual(parse('создай черновик записи осмотрел семью',true),{type:'journal_draft',text:'осмотрел семью'});assert.deepEqual(parse('добавь запись в журнал: дал сироп',true),{type:'journal_draft',text:'дал сироп'});assert.deepEqual(parse('запиши в журнал',true),{type:'question',text:'запиши в журнал'})});
