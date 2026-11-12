import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function extractFunction(name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(html);
  assert.ok(match, 'Function not found: ' + name);
  const start = match.index;
  const next = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  next.lastIndex = match.index + match[0].length;
  const endMatch = next.exec(html);
  return html.slice(start, endMatch ? endMatch.index : html.indexOf('</script>', start));
}
function loadFunction(name, globals = {}) {
  const source = extractFunction(name);
  return new Function('deps', 'with (deps) { return (' + source + '); }')(globals);
}

test('family lineage accepts live and archived parents', () => {
  const inspect = loadFunction('inspectFamilyLineage');
  assert.deepEqual(inspect([{id:'p',origin:'swarm'},{id:'c',origin:'offshoot',parentFamilyId:'p'}]), []);
  assert.deepEqual(inspect([{id:'c',origin:'offshoot',parentFamilyId:'p',parentFamilySnapshot:{id:'p'}}]), []);
});
test('family lineage rejects missing parents and cycles', () => {
  const inspect = loadFunction('inspectFamilyLineage');
  assert.ok(inspect([{id:'c',origin:'offshoot',parentFamilyId:'missing'}]).some(x=>x.code==='family_parent_missing'));
  assert.ok(inspect([{id:'a',parentFamilyId:'b'},{id:'b',parentFamilyId:'a'}]).some(x=>x.code==='family_lineage_cycle'));
});
test('family establishment date must be a real calendar date', () => {
  const inspect = loadFunction('inspectFamilyLineage');
  assert.deepEqual(inspect([{id:'p'},{id:'c',origin:'offshoot',parentFamilyId:'p',stage:'independent',establishedAt:'2024-02-29'}]), []);
  assert.ok(inspect([{id:'p'},{id:'c',origin:'offshoot',parentFamilyId:'p',stage:'independent',establishedAt:'2026-02-30'}]).some(x=>x.code==='invalid_family_established_date'));
});
test('task lifecycle accepts only supported states and real dates', () => {
  const inspect = loadFunction('inspectTaskIntegrity');
  assert.deepEqual(inspect([{status:'pending',date:'2026-11-12'},{status:'suggested',date:'2024-02-29'},{status:'done'},{status:'dismissed'}]), []);
  const errors = inspect([{id:'bad-date',status:'pending',date:'2026-02-30'},{id:'bad-state',status:'complete',date:'2026-11-12'}]);
  assert.ok(errors.some(x=>x.code==='invalid_task_date' && x.details.taskId==='bad-date'));
  assert.ok(errors.some(x=>x.code==='invalid_task_status' && x.details.taskId==='bad-state'));
});

function makeBoxes(families = {}, frames = {}) {
  return Object.fromEntries([1,2,3,4,5,6].map(n=>[n,{family:families[n]||'',frames:frames[n]||[]}]));
}
function transferFixture() {
  return {
    hives:[{id:'h1',number:1},{id:'h2',number:2}],
    families:[{id:'fam',name:'26-1',hive:'h1',box:1,origin:'offshoot',parentFamilyId:'parent'},{id:'parent',name:'26-0',hive:'h1',box:3}],
    records:[{id:'record-1',family:'fam',hive:'h1'}],
    layouts:{
      h1:{mode:'summer',installedBoxes:[1,2,3],honeyFrames:[[],[]],boxes:makeBoxes({1:'fam',3:'parent'},{1:[{frameId:'1',location:'1',history:[]},{frameId:'2',location:'1',history:[]}]})},
      h2:{mode:'summer',installedBoxes:[1,2,3],honeyFrames:[[],[]],boxes:makeBoxes({}, {2:[{frameId:'1',location:'2',history:[]},{frameId:'9',location:'2',history:[]}]})}
    }
  };
}
async function runTransfer(data) {
  const deps = {
    S: JSON.parse(JSON.stringify(data)),
    transferringFamilyId:'fam', selectedHiveId:'h1', activeJournalHive:'h1',
    alerts:[], audit:[],
    $: id => ({transferTargetHive:{value:'h2'},transferTargetBox:{value:'2'},familyTransferDlg:{close(){}}}[id] || {value:'',close(){}}),
    alert(message){this.alerts.push(message);}, confirm(){return true;},
    hname:id=>'Улей '+id, today:()=>'2026-11-12',
    logAudit(...args){this.audit.push(args);},
    layoutFor(id){return this.S.layouts[id];},
    frameArray(layout,key){return key==='H1'?layout.honeyFrames[0]:key==='H2'?layout.honeyFrames[1]:layout.boxes[key].frames;},
    findFamilyBox(id){for(const hive of this.S.hives)for(let n=1;n<=6;n++){const box=this.S.layouts[hive.id]?.boxes[n];if(box?.family===id)return {hiveId:hive.id,box:n,data:box,layout:this.S.layouts[hive.id]};}return null;},
    nextFrameId(layout){return String(Math.max(0,...[1,2,3,4,5,6,'H1','H2'].flatMap(k=>(this.frameArray(layout,k)||[]).map(frame=>Number(frame.frameId)||0)))+1);},
    async save(){return true;}, render(){}, showTab(){}
  };
  const fn = loadFunction('confirmFamilyTransfer', deps);
  await fn({preventDefault(){}});
  return deps;
}
test('family transfer moves family and swaps frame sets while retaining lineage', async () => {
  const result = await runTransfer(transferFixture());
  assert.equal(result.S.families[0].hive,'h2');
  assert.equal(result.S.families[0].box,2);
  assert.equal(result.S.families[0].parentFamilyId,'parent');
  assert.deepEqual(result.S.layouts.h2.boxes[2].frames.map(x=>x.frameId),['1','2']);
  assert.deepEqual(result.S.layouts.h1.boxes[1].frames.map(x=>x.frameId),['1','9']);
  assert.equal(result.S.layouts.h1.boxes[1].family,'');
  assert.equal(result.S.layouts.h2.boxes[2].family,'fam');
  assert.equal(result.audit[0][0],'family_transferred');
});
test('family transfer rejects inconsistent target frame locations without partial mutation', async () => {
  const data = transferFixture();
  data.layouts.h2.boxes[2].frames[1].location='6';
  const result = await runTransfer(data);
  assert.equal(result.S.families[0].hive,'h1');
  assert.deepEqual(result.S.layouts.h1.boxes[1].frames.map(x=>x.frameId),['1','2']);
  assert.deepEqual(result.S.layouts.h2.boxes[2].frames.map(x=>x.frameId),['1','9']);
  assert.equal(result.audit.length,0);
  assert.equal(result.alerts.length,1);
});
