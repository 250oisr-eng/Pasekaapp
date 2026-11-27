import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/voice-session.js', import.meta.url), 'utf8');

function fixture({onTranscript, failConstructor=false}={}) {
  const recognizers=[], timers=[], utterances=[], texts=[], statuses=[];
  class Speech {
    constructor(){if(failConstructor)throw Error('constructor failure');recognizers.push(this);}
    start(){}
    abort(){this.aborted=true;this.onresult?.(result('late abort transcript'));this.onend?.();}
  }
  class Utterance {constructor(text){this.text=text;}}
  const synthesis={cancel(){utterances.at(-1)?.onend?.();},speak(u){utterances.push(u);}};
  const windowRef={SpeechRecognition:Speech,speechSynthesis:synthesis};
  const factory=new Function('window',source+'\nreturn window.PasekaVoiceSession.createApiaryVoiceSession;')(windowRef);
  const session=factory({windowRef,getElement:()=>null,getUtterance:Utterance,onStatus:m=>statuses.push(m),onTranscript:t=>{texts.push(t);onTranscript?.(session,t);},setTimer:fn=>timers.push(fn)});
  return {session,recognizers,timers,utterances,texts,statuses};
}
function result(...texts){return {resultIndex:0,results:texts.map(t=>Object.assign([{transcript:t}],{isFinal:true}))};}

test('stop invalidates synchronous and delayed final results and ends',()=>{
  const f=fixture();f.session.start();const first=f.recognizers[0];f.session.stop();
  first.onresult(result('Пасека слушай подтверждаю'));first.onend();
  assert.equal(first.aborted,true);assert.deepEqual(f.texts,[]);assert.equal(f.timers.length,0);assert.equal(f.session.state.active,false);
});
test('old recognizer cannot affect newly started session',()=>{
  const f=fixture();f.session.start();const first=f.recognizers[0];f.session.stop();f.session.start();
  first.onerror({error:'not-allowed'});first.onend();first.onresult(result('stale'));
  assert.equal(f.session.state.recognition,f.recognizers[1]);assert.equal(f.session.state.active,true);assert.deepEqual(f.texts,[]);
});
test('old restart timer does not resurrect microphone during later session',()=>{
  const f=fixture();f.session.start();f.recognizers[0].onend();assert.equal(f.timers.length,1);
  f.session.stop();f.session.start();f.recognizers[1].onend();
  f.timers[0]();assert.equal(f.recognizers.length,2);
  f.timers[1]();assert.equal(f.recognizers.length,3);
});
test('old TTS completion cannot resume microphone during new utterance',()=>{
  const f=fixture();f.session.start();f.session.speak('первый');const first=f.utterances[0];
  f.session.speak('второй');first.onend();first.onerror();
  assert.equal(f.session.state.speaking,true);assert.equal(f.session.state.recognition,null);assert.deepEqual(f.texts,[]);
  f.utterances[1].onend();assert.equal(f.session.state.speaking,false);assert.equal(f.recognizers.length,2);
});
test('fatal browser error without onend releases recognizer and preserves reason',()=>{
  const f=fixture();f.session.start();f.recognizers[0].onerror({error:'network'});
  assert.equal(f.session.state.active,false);assert.equal(f.recognizers[0].aborted,true);assert.equal(f.timers.length,0);assert.match(f.statuses.at(-1),/network/);
});
test('stop during one result prevents dispatch of further results in same event',()=>{
  const f=fixture({onTranscript:session=>session.stop()});f.session.start();
  f.recognizers[0].onresult(result('стоп пасека','Пасека слушай подтверждаю'));
  assert.deepEqual(f.texts,['стоп пасека']);assert.equal(f.session.state.active,false);
});
test('start constructor failure stops cleanly; repeated start is idempotent',()=>{
  const bad=fixture({failConstructor:true});assert.equal(bad.session.start(),false);assert.match(bad.statuses.at(-1),/constructor failure/);
  const f=fixture();f.session.start();f.session.start();assert.equal(f.recognizers.length,1);
});
