import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app={};
for(const name of ['equipment-labels','equipment-reconciliation-voice','equipment-reconciliation']){
 const source=await readFile(new URL('../js/'+name+'.js',import.meta.url),'utf8');new Function('window',source)(app);
}
const L=app.PasekaLabels,V=app.PasekaReconciliationVoice;
test('numeric labels are permanent, independent and legacy labels retained without renumbering',()=>{
 const legacy={frameId:'legacy',labelCode:'7КМ'},frame={},s={layouts:{h:{boxes:{1:{frames:[legacy,frame]}}}},meta:{usedFrameLabelCodes:['9','245'],usedBodyLabelCodes:['4Н9']}};
 assert.equal(L.assignFrameCode(s,frame),'246');assert.equal(L.assignBodyCode(s,'b'),'1');
 assert.equal(legacy.labelCode,'7КМ');assert.equal(L.formatLabelCode('frame',frame.labelCode),'Р-246');
 assert.throws(()=>L.assignFrameCode(s,frame,'247'),/нельзя менять/);
 assert.throws(()=>L.assignFrameCode(s,{},'245'),/занят/);
 assert.equal(L.assignFrameCode(JSON.parse(JSON.stringify(s)),{}),'247');
 assert.deepEqual(L.inspectLabelIntegrity(s),[]);
});
test('numeric code syntax accepts optional own prefix but not malformed numeric aliases',()=>{
 for(const t of ['frame','body']){
  const prefix=t==='frame'?'Р':'К';for(const n of ['1','137','999999','245']){
   assert.equal(L.normalizeCode(n,t),n);assert.equal(L.normalizeCode(prefix+'-'+n,t),n);
  }
  for(const bad of ['0','01','1000000','-137','1-37','1.37','КК137'])assert.equal(L.normalizeCode(bad,t),null,bad);
 }
});
test('serial allocation refuses malformed counter and exhaustion without looping or reusing labels',()=>{
 assert.throws(()=>L.nextCode({meta:{nextNumericLabelNumber:{frame:0}}},'frame'),/счётчик/);
 assert.throws(()=>L.nextCode({meta:{usedFrameLabelCodes:['999999']}},'frame'),/Исчерпаны/);
});
test('family serial persists independently of year, deletion and historical snapshots',()=>{
 const s={families:[{id:'old',name:'26-1'},{id:'a',name:'С-12'}],records:[{familyNameAtTime:'С-15'}]};
 const before=JSON.stringify(s);assert.equal(L.nextIdentityCode(s,'family'),'С-16');assert.equal(JSON.stringify(s),before);
 assert.equal(L.nextIdentityCode(s,'family',true),'С-16');s.families=[];
 assert.equal(L.nextIdentityCode(JSON.parse(JSON.stringify(s)),'family',true),'С-17');
 assert.equal(L.nextIdentityCode(s,'queen',true),'М-1');
});
test('whole numbers, explicit lists and mixed older label can be dictated without three-symbol grouping',()=>{
 for(const [text,expected] of [['сто тридцать семь',['137']],['137 138 139',['137','138','139']],['сто тридцать семь и сто тридцать восемь',['137','138']],['две тысячи сто пять',['2105']],['Р-137, 7КМ',['137','7КМ']],['7КМ, Р-137',['7КМ','137']]]){
  const result=V.normalizeSpokenFrameCodes(text);assert.equal(result.canNormalize,true,text);assert.deepEqual(result.codes,expected,text);
  assert.equal(V.validateEditedFrameCodes(result.codes).ok,true);
 }
 assert.equal(V.normalizeSpokenFrameCodes('сто сто').canNormalize,false);
 assert.equal(V.normalizeSpokenFrameCodes('ноль').canNormalize,false);
 assert.equal(V.validateEditedFrameCodes(['01']).ok,false);
});
test('numeric reconciliation exact lookup and JSON roundtrip, historical labels stay searchable',()=>{
 const s={hives:[{id:'h'}],layouts:{h:{boxes:{1:{frames:[{frameId:'a',labelCode:'137'},{frameId:'b',labelCode:'7КМ'}]}}}}};
 const before=JSON.stringify(s),r=app.PasekaReconciliation.preview(JSON.parse(before),{type:'hive',hiveId:'h'},['Р-137','7КМ'],L);
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.observedCodes,['137','7КМ']);assert.equal(JSON.stringify(s),before);
});
test('QR reserve payload has no current location and is not activated in UI',async()=>{
 assert.equal(L.futureQrPayload('frame','uid-7'),'paseka:1:frame:uid-7');
 assert.equal(L.futureQrPayload('bad','uid-7'),null);
 assert.equal(L.futureQrPayload('frame',''),null);
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/futureQrPayload\s*\(/);
 assert.doesNotMatch(html,/id="[^"]*qr(?:Code|Scan|Print)[^"]*"/i);
});
test('section addresses distinguish side-by-side positions from vertical winter positions',()=>{
 assert.equal(L.sectionLabel('left'),'А · левая');assert.equal(L.sectionLabel('middle'),'Б · средняя');assert.equal(L.sectionLabel('right'),'В · правая');assert.equal(L.sectionLabel('middle','alternative_wintering_column'),'средняя');
});
