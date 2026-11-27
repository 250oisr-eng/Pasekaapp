import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePrBranchGraph,analyzeBranchHistory,analyzeRootFileOverlaps,collectGraph,collectPortfolio} from '../scripts/audit-pr-branch-dependencies.mjs';
const p=(number,head,base='main')=>({number,state:'open',head:{ref:head},base:{ref:base}});
test('detects stacked links, unreferenced branches and bases without an open parent',()=>{
 const r=analyzePrBranchGraph([p(1,'feature-a'),p(2,'feature-b','feature-a'),p(3,'feature-c','closed-parent')],['main','feature-a','feature-b','feature-c','closed-parent','old-work']);
 assert.equal(r.openPrs,3); assert.equal(r.mainBased,1);assert.equal(r.stacked,2);
 assert.deepEqual(r.unreferencedBranches,['old-work']);
 assert.deepEqual(r.stackedWithoutOpenParentPr,[{number:3,base:'closed-parent',baseExists:true}]);
 assert.deepEqual(r.missingLocalBases,[]);
 assert.equal(r.proof,'STRUCTURAL_ONLY_NOT_MERGE_OR_DELETE_SAFETY');
 assert.equal(r.maxOpenPrChainDepth,2);
 assert.deepEqual(r.duplicateHeads,[]);
});
test('reports genuinely missing branches without equating them with deleted code',()=>{
 const r=analyzePrBranchGraph([p(1,'unknown-head','unknown-base')],['main']);
 assert.deepEqual(r.missingLocalHeads,[1]);
 assert.deepEqual(r.missingLocalBases,[{number:1,base:'unknown-base'}]);
 assert.equal(r.stackedWithoutOpenParentPr[0].baseExists,false);
});
test('rejects duplicates, malformed input, missing main',()=>{
 assert.throws(()=>analyzePrBranchGraph([],['main','main']),/duplicate/);
 assert.throws(()=>analyzePrBranchGraph([p(1,'a'),p(1,'b')],['main']),/duplicate/);
 assert.throws(()=>analyzePrBranchGraph([],['other']),/Main branch/);
 assert.throws(()=>analyzePrBranchGraph(null,[]),/Complete/);
});
test('fails closed on full last page and incomplete remote results',async()=>{
 await assert.rejects(collectGraph(async(kind,page,size)=>kind==='pulls'?Array.from({length:size},(_,i)=>p((page-1)*size+i+1,'a'+((page-1)*size+i+1))):[{name:'main'}]),/Pagination incomplete/);
});
test('collects paginated branches and pull requests with no write calls',async()=>{
 const calls=[];const fetcher=async(kind,page,size)=>{
   calls.push([kind,page,size]);
   if(kind==='pulls')return page===1?[p(1,'a')]:[];
   return page===1?[{name:'main'},{name:'a'}]:[];
 };
 const r=await collectGraph(fetcher);
 assert.equal(r.openPrs,1);assert.equal(r.branchCount,2);
 assert.equal(calls.length,2);
});
test('finds cyclic parent links for human review only',()=>{
 const r=analyzePrBranchGraph([p(1,'a','b'),p(2,'b','a')],['main','a','b']);
 assert.equal(r.cycles.length,1);
 assert.equal(r.maxOpenPrChainDepth,null);
});

test('reports duplicate PR heads separately from identical base/unique-commit evidence',()=>{
 const r=analyzePrBranchGraph([
  p(1,'root'),p(2,'child','root'),p(3,'grandchild','child'),
  p(14,'shared-archive','main'),p(13,'shared-archive','root')
 ],['main','root','child','grandchild','shared-archive']);
 assert.equal(r.maxOpenPrChainDepth,3);
 assert.deepEqual(r.duplicateHeads,[{head:'shared-archive',prs:[13,14]}]);
 assert.equal(r.cycles.length,0);
 assert.equal(r.missingLocalHeads.length,0);
 // The two PRs can have different diffs because their target bases differ.
 assert.equal(r.proof,'STRUCTURAL_ONLY_NOT_MERGE_OR_DELETE_SAFETY');
});
test('empty open graph has depth zero, never an imagined dependency',()=>{
 const r=analyzePrBranchGraph([],['main']);
 assert.equal(r.maxOpenPrChainDepth,0);
 assert.deepEqual(r.duplicateHeads,[]);
});

const closed=(number,head,merged=false)=>({
 number,state:'closed',head:{ref:head},merged_at:merged?'2026-11-27T00:00:00Z':null
});

test('classifies all unreferenced branches by closed PR history without authorizing delete',()=>{
 const graph=analyzePrBranchGraph([p(9,'still-open')],[
  'main','still-open','merged-branch','abandoned-branch','untouched-branch','mixed-branch']);
 const history=analyzeBranchHistory(graph,[
  closed(10,'merged-branch',true),closed(11,'abandoned-branch'),
  closed(12,'mixed-branch',true),closed(13,'mixed-branch'),
  closed(14,'still-open',true)
 ]);
 assert.deepEqual(history.groupCounts,{
  mergedOnly:1,closedUnmergedOnly:1,mixedClosedStates:1,noClosedPr:1
 });
 assert.deepEqual(history.groups.noClosedPr,['untouched-branch']);
 assert.equal(history.closedPrCount,5);
 assert.equal(history.mergedClosedPrCount,3);
 assert.deepEqual(history.verifiedComparisons,[]);
 assert.equal(history.proof,'CLOSED_PR_HISTORY_AND_OPTIONAL_ANCESTRY_NO_DELETE_AUTHORIZATION');
});

test('ahead=0 on an unreferenced branch is not an automatic deletion approval',()=>{
 const graph=analyzePrBranchGraph([],['main','merged-branch','unique-branch']);
 const comparisons={
  'merged-branch':{status:'behind',ahead_by:0,behind_by:5},
  'unique-branch':{status:'diverged',ahead_by:12,behind_by:6}
 };
 const result=analyzeBranchHistory(graph,[closed(4,'merged-branch',true)],comparisons);
 assert.deepEqual(result.verifiedComparisons.map(x=>x.verdict),[
  'ANCESTOR_ONLY_REVIEW_NO_DELETE','UNIQUE_COMMITS_REVIEW_NO_DELETE'
 ]);
 assert.equal(result.groupCounts.mergedOnly,1);
 assert.equal(result.groupCounts.noClosedPr,1);
});

test('rejects invalid compare evidence and duplicated closed PR numbers',()=>{
 const graph=analyzePrBranchGraph([],['main','old']);
 assert.throws(()=>analyzeBranchHistory(graph,[closed(2,'old'),closed(2,'old')]),/duplicate/);
 assert.throws(()=>analyzeBranchHistory(graph,[p(2,'old')]),/Invalid\/duplicate closed/);
 assert.throws(()=>analyzeBranchHistory(graph,[closed(2,'old')],{'old':{
  status:'behind',ahead_by:1,behind_by:2
 }}),/Invalid compare evidence/);
 assert.throws(()=>analyzeBranchHistory(graph,[closed(2,'old')],{'old':{
  status:'diverged',ahead_by:0,behind_by:2
 }}),/Invalid compare evidence/);
 assert.throws(()=>analyzeBranchHistory(null,[]),/Complete structural graph/);
});

test('portfolio exhaustively fetches closed PR pages, without mutation',async()=>{
 const calls=[];const fetcher=async(kind,page,size)=>{
  calls.push([kind,page,size]);
  if(kind==='pulls')return page===1?[p(1,'active')]:[];
  if(kind==='branches')return page===1?[{name:'main'},{name:'active'},{name:'old'}]:[];
  if(kind==='closed')return page===1?[closed(3,'old',true)]:[];
  throw Error('unexpected network endpoint');
 };
 const audit=await collectPortfolio(fetcher);
 assert.equal(audit.closedPrHistory.closedPrCount,1);
 assert.deepEqual(audit.closedPrHistory.groups.mergedOnly,['old']);
 assert.equal(calls.length,3);
});

test('portfolio refuses to claim full closed PR census when pagination is incomplete',async()=>{
 await assert.rejects(collectPortfolio(async(kind,page,size)=>{
  if(kind==='pulls')return [p(1,'active')];
  if(kind==='branches')return [{name:'main'},{name:'active'}];
  return Array.from({length:size},(_,i)=>closed((page-1)*size+i+1000,'closed-'+page+'-'+i));
 }),/Pagination incomplete/);
});

const changed=(number,paths,base='main')=>({number,base,paths,complete:true});

test('root-level changed-file collisions are evidence of possible overlap only',()=>{
 const result=analyzeRootFileOverlaps([
  changed(647,['index.html','js/sectional-op02-feeding.js','PROJECT_STATUS.md','tests/journal.test.mjs']),
  changed(648,['index.html','sw.js','PROJECT_STATUS.md','tests/journal.test.mjs']),
  changed(651,['sw.js','js/equipment-labels.js']),
  changed(653,['PROJECT_STATUS.md','docs/PR-BRANCH-DEPENDENCY-AUDIT-2026-11-28.md']),
  changed(639,['index.html'],'parent-stacked')
 ]);
 assert.equal(result.reviewedRootPrs,4);
 assert.equal(result.criticalPairCount,2);
 assert.deepEqual(result.pairs.map(x=>[x.left,x.right,x.sharedCritical]),[
  [647,648,['index.html']],[648,651,['sw.js']]
 ]);
 assert.equal(result.pairs[0].sharedTests,1);
 assert.equal(result.proof,'COMPLETE_PATH_OVERLAP_ONLY_NOT_SEMANTIC_MERGE_CONFLICT');
});

test('docs-only simultaneous edits are not runtime collisions',()=>{
 const result=analyzeRootFileOverlaps([
  changed(1,['PROJECT_STATUS.md','docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md']),
  changed(2,['PROJECT_STATUS.md','docs/ЖУРНАЛ-ИЗМЕНЕНИЙ.md'])
 ]);
 assert.equal(result.criticalPairCount,0);
 assert.deepEqual(result.pairs,[]);
});

test('overlap guard refuses partial PR file lists, duplicate or unsafe paths',()=>{
 assert.throws(()=>analyzeRootFileOverlaps([{number:1,base:'main',paths:['index.html']}]),/Incomplete/);
 assert.throws(()=>analyzeRootFileOverlaps([changed(1,['sw.js','sw.js'])]),/Incomplete/);
 assert.throws(()=>analyzeRootFileOverlaps([changed(1,['../hidden'])]),/Incomplete/);
 assert.throws(()=>analyzeRootFileOverlaps([changed(1,['/absolute/file'])]),/Incomplete/);
 assert.throws(()=>analyzeRootFileOverlaps([changed(1,['index.html']),changed(1,['sw.js'])]),/Incomplete/);
 assert.throws(()=>analyzeRootFileOverlaps(null),/Complete PR file inventories/);
});
