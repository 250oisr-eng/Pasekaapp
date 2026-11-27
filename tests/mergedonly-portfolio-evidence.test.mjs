import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const BASE='dcf8a7c519a4ec64e1d2c86a0cfeb72ba3497417';
const read=path=>JSON.parse(readFileSync(new URL('../docs/'+path,import.meta.url),'utf8'));
const pages=Array.from({length:5},(_,i)=>read('PR-BRANCH-LIVE-PAGES-'+(i+1)+'-2026-11-28.json'))
 .flatMap(x=>x.pages);
const corpus=read('PR-BRANCH-MERGEDONLY-CENSUS-2026-11-28.json');
const headSnapshot=read('PR-BRANCH-MERGEDONLY-HEADS-2026-11-28.json');
const triage=read('PR-BRANCH-MERGEDONLY-TRIAGE-2026-11-28.json');
const comparisons=Array.from({length:12},(_,i)=>
 read('PR-BRANCH-MERGEDONLY-COMPARES-'+String(i+1).padStart(2,'0')+'-2026-11-28.json'));

function all(kind,size) {
 const set=pages.filter(x=>x.kind===kind).sort((a,b)=>a.page-b.page);
 assert.ok(set.length>1,kind+' pagination missing');
 for(let i=0;i<set.length;i++) {
  assert.equal(set[i].page,i+1,kind+' pagination gap');
  assert.equal(set[i].count,set[i].items.length,kind+' declared count mismatch');
  assert.ok(set[i].count<=size,kind+' page overflow');
 }
 assert.equal(set.at(-1).count,0,kind+' no terminal empty page');
 const firstEmpty=set.findIndex(x=>x.count<size);
 assert.ok(firstEmpty>=0,kind+' missing partial/empty terminal page');
 assert.ok(set.slice(firstEmpty+1).every(x=>x.count===0),kind+' nonempty page after terminal');
 return set.flatMap(x=>x.items);
}

function classify(r){
 if(r.ahead===0)return 'ANCESTOR_ONLY_KEEP_PENDING_REFERENCE_REVIEW';
 const ps=r.changedPaths.map(x=>x.path);
 if(ps.every(p=>p==='PROJECT_STATUS.md'||p.startsWith('docs/')))
  return 'DOCS_ONLY_UNIQUE_SHA_CHECK_CONTENT';
 if(ps.every(p=>p==='PROJECT_STATUS.md'||p.startsWith('docs/')||p.startsWith('tests/')))
  return 'TESTS_ONLY_OR_DOCS_CHECK_CONTENT';
 if(ps.some(p=>p==='index.html'||p==='sw.js'||p.startsWith('js/')))
  return 'RUNTIME_DIFF_REVIEW_NO_WHOLESALE_PORT';
 return 'BUILD_CONFIG_REVIEW_NO_WHOLESALE_PORT';
}

test('complete REST pagination, unique refs, and 176 exact merged-only branch owners',()=>{
 const branches=all('branches',100);
 const open=all('open',20);
 const closed=all('closed',20);
 assert.equal(branches.length,674);
 assert.equal(open.length,407);
 assert.equal(closed.length,243);
 assert.equal(new Set(branches).size,branches.length);
 assert.equal(new Set(open.map(x=>x.number)).size,open.length);
 assert.equal(new Set(closed.map(x=>x.number)).size,closed.length);
 assert.equal(closed.filter(x=>x.merged).length,178);
 const active=new Set(open.flatMap(x=>[x.head,x.base]));
 const unused=branches.filter(x=>x!=='main'&&!active.has(x)).sort();
 assert.equal(unused.length,260);
 const byHead=new Map();
 for(const x of closed) {
  const values=byHead.get(x.head)||[];
  values.push(x);
  byHead.set(x.head,values);
 }
 const mergedOnly=unused.filter(b=>{
  const history=byHead.get(b)||[];
  return history.length>0&&history.every(x=>Boolean(x.merged));
 });
 assert.equal(mergedOnly.length,176);
 assert.deepEqual(mergedOnly,corpus.mergedOnlyBranches.map(x=>x.branch));
 for(const item of corpus.mergedOnlyBranches) {
  const history=byHead.get(item.branch);
  assert.deepEqual(item.closedPrs.map(x=>x.number),history.map(x=>x.number));
  assert.ok(history.every(x=>x.merged&&!active.has(x.head)));
 }
});

test('each of 176 comparisons is unique, complete, pinned to main SHA and never an authorization',()=>{
 const rows=comparisons.flatMap((x,i)=>{
  assert.equal(x.batch,i+1);
  assert.equal(x.start,i*15);
  assert.equal(x.baseSha,BASE);
  assert.match(x.kind,/NOT_SEMANTIC_OR_DELETE_PROOF/);
  return x.rows;
 });
 assert.equal(rows.length,176);
 assert.equal(new Set(rows.map(x=>x.branch)).size,176);
 assert.deepEqual(rows.map(x=>x.branch),corpus.mergedOnlyBranches.map(x=>x.branch));
 assert.equal(rows.filter(x=>x.ahead===0).length,39);
 assert.equal(rows.filter(x=>x.ahead>0).length,137);
 for(const x of rows) {
  assert.equal(x.baseSha,BASE);
  assert.equal(x.error,undefined);
  assert.ok(Number.isInteger(x.ahead)&&x.ahead>=0);
  assert.ok(Number.isInteger(x.behind)&&x.behind>=0);
  assert.ok(Array.isArray(x.changedPaths));
  assert.equal(x.tooLarge??null,null,'too-large comparison is not complete proof');
  if(x.ahead===0)assert.equal(x.changedPaths.length,0);
  assert.ok(!JSON.stringify(x).includes('SAFE_TO_DELETE'),'never invent deletion evidence');
 }
});

test('head snapshot and five review tiers cannot silently drift from source compares',()=>{
 assert.equal(headSnapshot.mainSha,BASE);
 assert.equal(headSnapshot.heads.length,176);
 assert.equal(new Set(headSnapshot.heads.map(x=>x.branch)).size,176);
 assert.equal(triage.baseSha,BASE);
 const byHead=new Map(headSnapshot.heads.map(x=>[x.branch,x.headSha]));
 const rows=comparisons.flatMap(x=>x.rows);
 const groups={};
 assert.equal(triage.rows.length,176);
 for(let i=0;i<rows.length;i++){
  const src=rows[i],item=triage.rows[i];
  assert.equal(item.branch,src.branch);
  assert.equal(item.headShaPostCompare,byHead.get(src.branch));
  assert.match(item.headShaPostCompare,/^[0-9a-f]{40}$/i);
  assert.equal(item.ahead,src.ahead);
  assert.equal(item.behind,src.behind);
  assert.deepEqual(item.files,src.changedPaths.map(x=>x.path));
  assert.deepEqual(item.mergedPrs,src.closedPrs.map(x=>x.number));
  assert.equal(item.tier,classify(src));
  groups[item.tier]=(groups[item.tier]||0)+1;
  assert.ok(!item.tier.includes('DELETE_AUTHORIZED'));
  assert.ok(!item.tier.includes('MERGE_READY'));
 }
 assert.deepEqual(groups,triage.counts);
 assert.deepEqual(groups,{
  DOCS_ONLY_UNIQUE_SHA_CHECK_CONTENT:54,
  ANCESTOR_ONLY_KEEP_PENDING_REFERENCE_REVIEW:39,
  BUILD_CONFIG_REVIEW_NO_WHOLESALE_PORT:30,
  RUNTIME_DIFF_REVIEW_NO_WHOLESALE_PORT:41,
  TESTS_ONLY_OR_DOCS_CHECK_CONTENT:12
 });
});
