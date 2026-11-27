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

test('numeric labels cannot be rewritten via separators or negative legacy-digit aliases',()=>{
 for(const bad of ['-245','2-4-5','2 4 5','Р--245'])assert.equal(L.normalizeCode(bad,'frame'),null,bad);
 assert.equal(L.normalizeCode('Р-245','frame'),'245');
});
test('mixed numeric/legacy speech accepts complete labels and refuses incomplete historical fragment',()=>{
 for(const [text,expected] of [['7КМ, Р-7',['7КМ','7']],['семь ка эм, сто тридцать семь',['7КМ','137']],['сто тридцать семь, 7КМ',['137','7КМ']]]){
  const result=V.normalizeSpokenFrameCodes(text);assert.equal(result.canNormalize,true,text);assert.deepEqual(result.codes,expected,text);
 }
 assert.equal(V.normalizeSpokenFrameCodes('семь, ка, 137').canNormalize,false);
 assert.equal(V.parseSpokenNumber('тысяч'),null);
});
test('manual standardized identity reservation advances durable highwater and rejects reuse',()=>{
 const s={families:[],queens:[]};
 assert.equal(L.nextIdentityCode(s,'queen',true,'М-8'),'М-8');
 assert.equal(s.meta.nextQueenNumber,9);
 assert.throws(()=>L.nextIdentityCode(s,'queen',true,'М-8'),/зарезервирован/);
 assert.equal(L.nextIdentityCode(JSON.parse(JSON.stringify(s)),'queen',true),'М-9');
});
test('standardized family and queen duplicate identifiers are integrity errors; legacy remains unchanged',()=>{
 const s={families:[{id:'a',name:'С-2'},{id:'b',code:'С-2'},{id:'c',name:'26-1'},{id:'d',name:'26-1'}],queens:[{id:'q1',code:'М-3'},{id:'q2',code:'М-3'}]};
 assert.deepEqual(L.inspectIdentityMarking(s).map(x=>x.code),['duplicate_family_numeric_label','duplicate_queen_numeric_label']);
 assert.deepEqual(L.inspectLabelIntegrity(s).map(x=>x.code),['duplicate_family_numeric_label','duplicate_queen_numeric_label']);
 assert.equal(L.sectionLabel('middle','ALTERNATIVE_WINTERING_COLUMN'),'средняя');
 assert.equal(L.sectionLabel('middle','UNKNOWN'),'Позиция не указана');
});

test('typed and spoken lookup resolves exact local decimal identities, no prefix/substring guess',()=>{
 const s={hives:[{id:'h',number:3}],families:[{id:'f',name:'С-12',hive:'h',currentQueenId:'q'}],queens:[{id:'q',familyId:'f',code:'М-18',status:'current'}],layouts:{h:{corpusIds:{1:'b'},boxes:{1:{frames:[{frameId:'x',labelCode:'1137'},{frameId:'y',labelCode:'137'}]}}}},equipmentLabels:{bodies:{b:'24'}}};
 const before=JSON.stringify(s);
 for(const [query,kind,code] of [['где рамка сто тридцать семь','frame','137'],['Р-137','frame','137'],['семья двенадцать','family','12'],['К-24','body','24'],['матка 18','queen','18'],['улей три','hive','3']]){
  const parsed=V.parseMarkingLookup(query);assert.deepEqual(parsed,{kind,code});assert.equal(L.lookupMarking(s,kind,code).status,'found');
 }
 assert.match(L.lookupMarking(s,'frame','137').message,/К-24.*месте 2/);
 assert.equal(L.lookupMarking(s,'frame','37').status,'missing');
 assert.equal(V.parseMarkingLookup('переставь рамку 137'),null);
 assert.equal(V.parseMarkingLookup('где рамка сто сто').code,null);
 assert.equal(JSON.stringify(s),before);
});
test('lookup includes retired/stored frames and refuses duplicate physical codes',()=>{
 const s={hives:[],equipmentInventory:{bodies:{b:{storageLocation:'Стеллаж 2',frames:[{frameId:'x',labelCode:'137'}]}},retiredFrames:{'138':{frame:{frameId:'retired',labelCode:'138',lifecycle:'retired'}}}},equipmentLabels:{bodies:{b:'24'}}};
 assert.match(L.lookupMarking(s,'frame','137').message,/Стеллаж 2/);assert.match(L.lookupMarking(s,'frame','138').message,/списана/);
 s.equipmentInventory.bodies.b.frames.push({frameId:'other',labelCode:'137'});assert.equal(L.lookupMarking(s,'frame','137').status,'ambiguous');
});
