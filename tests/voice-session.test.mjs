import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const parserSource = await readFile(new URL('../js/voice-command-parser.js', import.meta.url), 'utf8');
const sessionSource = await readFile(new URL('../js/voice-session.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const webPrepareScript = await readFile(new URL('../scripts/prepare-web.mjs', import.meta.url), 'utf8');
const nativeSpeechSource = await readFile(new URL('../android-native/PasekaOfflineSpeechPlugin.java', import.meta.url), 'utf8');
const androidPrepareSource = await readFile(new URL('../scripts/prepare-android.mjs', import.meta.url), 'utf8');
const androidWorkflow = await readFile(new URL('../.github/workflows/android-debug.yml', import.meta.url), 'utf8');

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

test('voice session starts local continuous Russian recognition and forwards final results only', async () => {
  let recognition;
  const forwarded = [];
  const scheduled = [];
  const statuses = [];
  class MockRecognition {
    static async available() { return 'available'; }
    static async install() { return true; }
    set processLocally(value) { this.local = value; }
    get processLocally() { return this.local; }
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
  assert.equal(await session.start(), true);
  assert.ok(recognition.started);
  assert.equal(recognition.processLocally, true);
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

test('voice session stops after microphone permission denial', async () => {
  let recognition;
  const statuses = [];
  class MockRecognition {
    static async available() { return 'available'; }
    static async install() { return true; }
    set processLocally(value) { this.local = value; }
    get processLocally() { return this.local; }
    constructor() { recognition = this; }
    start() {}
    stop() { this.stopped = true; }
  }
  const session = loadVoiceSession({ SpeechRecognition: MockRecognition }, {
    onStatus: value => statuses.push(value)
  });
  await session.start();
  recognition.onerror({ error: 'not-allowed' });
  assert.equal(session.state.active, false);
  assert.equal(recognition.stopped, true);
  assert.match(statuses.join(' '), /Нет разрешения на микрофон/);
});

test('stopping voice session releases microphone, cancels speech and resets controls', async () => {
  let microphoneStopped = false;
  let speechCancelled = false;
  const button = { textContent: '■ Завершить сеанс', classList: { add(value) { this.added = value; }, remove() {} } };
  const recognition = { processLocally: false, start() {}, stop() { microphoneStopped = true; } };
  class MockRecognition {
    static async available() { return 'available'; }
    static async install() { return true; }
    constructor() { return recognition; }
  }
  Object.defineProperty(MockRecognition.prototype, 'processLocally', { value: false, writable: true });
  class MockUtterance {}
  const windowRef = {
    SpeechRecognition: MockRecognition,
    speechSynthesis: { cancel() { speechCancelled = true; }, speak() {} }
  };
  const session = loadVoiceSession(windowRef, {
    getElement(id) { return id === 'aiVoiceSessionButton' ? button : null; },
    getUtterance: MockUtterance
  });
  await session.start();
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
test('voice journal command opens an unsaved draft only for an explicitly selected hive',async()=>{const calls=[],elements={recordDlg:{open:false},aiJournalHiveSelect:{value:'h-1',focus(){}},aiJournalDraftInput:{value:''}};const deps={apiaryVoiceSession:{isArmed:()=>true,clearArmed(){}},parseApiaryVoiceCommand:loadVoiceParser(),S:{hives:[{id:'h-1'}]},$(id){return elements[id]},prepareJournalDraftFromAI(){calls.push('prepare')},showTab(tab){calls.push('tab:'+tab)},apiaryVoiceStatus(value){calls.push('status:'+value)},speakApiaryVoice(value){calls.push('speak:'+value)}};await loadFunction('handleApiaryVoiceTranscript',deps)('Пасека, слушай, запиши в журнал: осмотрел улей, матку видел');assert.equal(elements.aiJournalDraftInput.value,'осмотрел улей, матку видел');assert.ok(calls.includes('prepare'));assert.equal(calls.some(x=>x==='save'),false)});
test('voice journal command refuses to guess a hive and does not open a draft',async()=>{const calls=[],elements={recordDlg:{open:false},aiJournalHiveSelect:{value:'',focus(){}},aiJournalDraftInput:{value:''}};const deps={apiaryVoiceSession:{isArmed:()=>true,clearArmed(){}},parseApiaryVoiceCommand:loadVoiceParser(),S:{hives:[{id:'h-1'}]},$(id){return elements[id]},prepareJournalDraftFromAI(){calls.push('prepare')},showTab(tab){calls.push('tab:'+tab)},apiaryVoiceStatus(value){calls.push('status:'+value)},speakApiaryVoice(value){calls.push('speak:'+value)}};await loadFunction('handleApiaryVoiceTranscript',deps)('Пасека, слушай, запиши в журнал: дал сироп');assert.deepEqual(calls.filter(x=>x==='prepare'),[]);assert.ok(calls.includes('tab:ai'));assert.equal(elements.aiJournalDraftInput.value,'')});
test('voice journal command appends to an open record note without saving it',async()=>{const calls=[],elements={recordDlg:{open:true},rtext:{value:'Первое наблюдение'}};const deps={apiaryVoiceSession:{isArmed:()=>true,clearArmed(){}},parseApiaryVoiceCommand:loadVoiceParser(),S:{hives:[{id:'h-1'}]},$(id){return elements[id]},apiaryVoiceStatus(value){calls.push(value)},speakApiaryVoice(value){calls.push(value)}};await loadFunction('handleApiaryVoiceTranscript',deps)('Пасека, слушай, запиши в журнал: добавил корпус');assert.equal(elements.rtext.value,'Первое наблюдение\nдобавил корпус');assert.equal(calls.some(x=>/сохрани запись вручную/.test(x)),true)});


test('online speech recognition is never used unless the user explicitly allows it', async () => {
  let recognition;
  class MockRecognition {
    static async available() { return 'unavailable'; }
    static async install() { return false; }
    set processLocally(value) { this.local = value; }
    get processLocally() { return this.local; }
    constructor() { recognition = this; }
    start() { this.started = true; }
    stop() {}
  }
  const statuses = [];
  const session = loadVoiceSession({ SpeechRecognition: MockRecognition }, { onStatus: value => statuses.push(value) });
  assert.equal(await session.start(), false);
  assert.equal(recognition, undefined);
  assert.match(statuses.join(' '), /Онлайн-режим выключен/);
  assert.equal(await session.start({ allowOnline: true }), true);
  assert.equal(recognition.processLocally, false);
  assert.equal(session.state.provider, 'web-speech-online');
  session.stop();
});

test('native Vosk provider is preferred and recognized text is forwarded without browser speech', async () => {
  const listeners = {};
  const calls = [];
  const native = {
    async addListener(name, callback) { listeners[name] = callback; return { remove() {} }; },
    async getStatus() { calls.push('status'); return { modelInstalled: true }; },
    async start() { calls.push('start'); },
    async stop() { calls.push('stop'); listeners.result({ text: 'Последняя фраза перед остановкой' }); }
  };
  class BrowserSpeech {
    constructor() { throw new Error('browser speech must not be used'); }
  }
  const forwarded = [];
  const session = loadVoiceSession({ Capacitor: { Plugins: { PasekaOfflineSpeech: native } }, SpeechRecognition: BrowserSpeech }, {
    onTranscript: value => forwarded.push(value)
  });
  assert.equal(await session.start(), true);
  assert.equal(session.state.provider, 'vosk-android');
  assert.deepEqual(calls, ['status', 'start']);
  listeners.result({ text: 'Пасека, слушай' });
  assert.deepEqual(forwarded, ['Пасека, слушай']);
  session.stop();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.includes('stop'));
  assert.deepEqual(forwarded, ['Пасека, слушай', 'Последняя фраза перед остановкой']);
});

test('offline model installation uses the native plugin only after an explicit request', async () => {
  const calls = [];
  const native = {
    async addListener() { return { remove() {} }; },
    async getStatus() { calls.push('status'); return { modelInstalled: false }; },
    async downloadModel() { calls.push('download'); return { modelInstalled: true }; }
  };
  const session = loadVoiceSession({ Capacitor: { Plugins: { PasekaOfflineSpeech: native } } });
  assert.equal(await session.prepareOffline(), true);
  assert.deepEqual(calls, ['status', 'download']);
});

test('one-shot dictation delivers one final transcript and then stops', async () => {
  let recognition;
  const received = [];
  const finished = [];
  class MockRecognition {
    static async available() { return 'available'; }
    static async install() { return true; }
    set processLocally(value) { this.local = value; }
    get processLocally() { return this.local; }
    constructor() { recognition = this; }
    start() {}
    stop() { this.stopped = true; }
  }
  const session = loadVoiceSession({ SpeechRecognition: MockRecognition });
  assert.equal(session.startOneShot(value => received.push(value), { onFinish: () => finished.push(true) }), true);
  await new Promise(resolve => setImmediate(resolve));
  recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'Улей номер пять, осмотр' }], { isFinal: true })] });
  assert.deepEqual(received, ['Улей номер пять, осмотр']);
  assert.deepEqual(finished, [true]);
  assert.equal(session.state.active, false);
  assert.equal(recognition.stopped, true);
});


test('voice UI defaults to local recognition and requires explicit consent for online fallback', () => {
  assert.match(html, /id="aiVoiceOfflineModelButton"/);
  assert.match(html, /id="aiVoiceOnlineConsent" type="checkbox"/);
  assert.match(html, /apiaryVoiceSession\.start\(\{allowOnline\}\)/);
  assert.match(html, /apiaryVoiceSession\.startOneShot/);
  assert.match(html, /apiaryVoiceSession\.prepareOffline\(\)/);
  assert.match(html, /document\.addEventListener\('visibilitychange'/);
  assert.match(html, /Онлайн-распознавание выключено по умолчанию/);
  assert.doesNotMatch(html, /let aiRecognition=null/);
});

test('Android Vosk plugin processes microphone audio locally and downloads the model only over Wi-Fi', () => {
  assert.match(nativeSpeechSource, /new SpeechService\(loadedRecognizer, \(float\) SAMPLE_RATE\)/);
  assert.match(nativeSpeechSource, /notifyListeners\(eventName, payload\)/);
  assert.match(nativeSpeechSource, /publishHypothesis\(hypothesis, "text", "result"\)/);
  assert.match(nativeSpeechSource, /NetworkCapabilities\.TRANSPORT_WIFI/);
  assert.match(nativeSpeechSource, /activeCapabilities\.hasTransport\(NetworkCapabilities\.TRANSPORT_WIFI\)/);
  assert.match(nativeSpeechSource, /candidateCapabilities\.hasTransport\(NetworkCapabilities\.TRANSPORT_WIFI\)[\s\S]*?return candidate;/);
  assert.doesNotMatch(nativeSpeechSource, /activeCapabilities\.hasTransport\(NetworkCapabilities\.TRANSPORT_VPN\)/);
  assert.match(nativeSpeechSource, /direct binding may bypass an active VPN/);
  assert.match(voiceSessionSource, /при активном VPN может обходить его/);
  assert.match(html, /прямое соединение может его обходить/);
  assert.match(nativeSpeechSource, /wifiNetwork\.openConnection\(new URL\(MODEL_URL\)\)/);
  assert.match(nativeSpeechSource, /MODEL_VERSION = "vosk-model-small-ru-0\.22"/);
  assert.match(nativeSpeechSource, /received != declaredLength/);
  assert.match(nativeSpeechSource, /MAX_ARCHIVE_BYTES = 100L/);
  assert.match(nativeSpeechSource, /MAX_EXTRACTED_BYTES = 250L/);
  assert.match(nativeSpeechSource, /canonical\.startsWith\(root\)/);
  assert.match(nativeSpeechSource, /latch\.await\(750, TimeUnit\.MILLISECONDS\)/);
  assert.doesNotMatch(nativeSpeechSource, /https?:\/\/[^\s"]+\/.*audio|uploadAudio|sendAudio/);
  assert.match(androidPrepareSource, /com\.alphacephei:vosk-android:0\.3\.75/);
  assert.match(androidWorkflow, /node scripts\/prepare-android\.mjs/);
});