import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePrBranchGraph,collectGraph} from '../scripts/audit-pr-branch-dependencies.mjs';
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
