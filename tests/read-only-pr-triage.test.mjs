import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {collectOpenPulls,summarizeOpenPulls} from '../scripts/read-only-pr-triage.mjs';

const sha='a'.repeat(40);
const make=(number,base='main')=>({
 number,title:'PR '+number,state:'open',draft:true,head:{sha},
 base:{ref:base},updated_at:'2026-11-25T00:00:00Z'
});

test('B08 paginates all open PR pages before reporting any total and never infers merge readiness',async()=>{
 const pages=[[make(1),make(2,'stack-A')],[make(3),make(4,'stack-A')],[make(5)]];
 const calls=[];
 const result=await collectOpenPulls(async (page,size)=>{calls.push([page,size]);return pages[page-1]}, {pageSize:2,maxPages:4});
 assert.deepEqual(calls,[[1,2],[2,2],[3,2]]);
 const summary=summarizeOpenPulls(result);
 assert.equal(summary.totalOpen,5);
 assert.equal(summary.directMainBase,3);
 assert.equal(summary.otherBase,2);
 assert.deepEqual(summary.baseCounts,[{base:'main',count:3},{base:'stack-A',count:2}]);
 assert.deepEqual(summary.directMainCandidates.map(x=>x.number),[1,3,5]);
 for(const x of result){
   assert.equal(x.reviewStatus,'REVIEW_REQUIRED');
   assert.equal(x.ancestry,'NOT_CHECKED');
   assert.equal(x.ciStatus,'NOT_CHECKED');
 }
});

test('B08 rejects incomplete last full page rather than claiming an exhaustive count',async()=>{
 const fake=async page=>[make(page*2-1),make(page*2)];
 await assert.rejects(collectOpenPulls(fake,{pageSize:2,maxPages:2}),/Pagination limit reached/);
});

test('B08 rejects invalid metadata, duplicates, non-open status and page overflow',async()=>{
 await assert.rejects(collectOpenPulls(async()=>[make(1),make(1)],{pageSize:2}),/Duplicate/);
 await assert.rejects(collectOpenPulls(async()=>[{...make(1),head:{sha:'bad'}}],{pageSize:2}),/invalid PR metadata/);
 await assert.rejects(collectOpenPulls(async()=>[{...make(1),state:'closed'}],{pageSize:2}),/invalid PR metadata/);
 await assert.rejects(collectOpenPulls(async()=>[make(1),make(2),make(3)],{pageSize:2}),/malformed/);
});

test('B08 propagates HTTP/network failures without partial success',async()=>{
 await assert.rejects(collectOpenPulls(async page=>{
   if(page===2)throw Error('HTTP 403');
   return [make(1),make(2)];
 },{pageSize:2}),/HTTP 403/);
});

test('B08 tool is read-only and has no mutation or automatic PR merge/close actions',async()=>{
 const source=await readFile(new URL('../scripts/read-only-pr-triage.mjs',import.meta.url),'utf8');
 assert.match(source,/method:'GET'/);
 assert.doesNotMatch(source,/\bmethod\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i);
 assert.doesNotMatch(source,/\/merge\b|\/issues\/\d+\/comments|\/pulls\/\d+\/reviews/i);
 assert.match(source,/reviewStatus:'REVIEW_REQUIRED'/);
 assert.match(source,/B08_INVENTORY_NOT_VERIFIED/);
});
