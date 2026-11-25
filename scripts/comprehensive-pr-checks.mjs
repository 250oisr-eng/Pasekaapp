// Read-only GitHub draft evidence. No merges, installations, deploys, keys or user files.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SHA=/^[a-f0-9]{40}$/;
const CHECK_NAMES=new Set(['build','governance','windows-offline-kit']);

export function validateTrackedDrafts(spec){
 assert.equal(spec?.schemaVersion,1);
 assert.equal(spec.repository,'250oisr-eng/Pasekaapp');
 assert.equal(spec.phoneActionsRequiredNow,0);
 assert.ok(Array.isArray(spec.targetPulls)&&spec.targetPulls.length>=7);
 const numbers=new Set();
 for(const item of spec.targetPulls){
  assert.ok(Number.isSafeInteger(item.number)&&item.number>0);
  assert.ok(!numbers.has(item.number),'duplicate watched PR');
  numbers.add(item.number);
  assert.match(item.scope,/^[A-Za-z0-9_-]+$/);
  assert.ok(Array.isArray(item.requiredChecks)&&item.requiredChecks.length);
  assert.equal(new Set(item.requiredChecks).size,item.requiredChecks.length);
  for(const name of item.requiredChecks)assert.ok(CHECK_NAMES.has(name));
 }
 return true;
}

export function assessExactChecks(checkRuns,required,sha){
 if(!SHA.test(sha)||!Array.isArray(checkRuns))return {status:'NOT_VERIFIED',checks:[]};
 const states=required.map(name=>{
  const matches=checkRuns.filter(c=>c.name===name);
  let status='ABSENT';
  if(matches.length){
   if(matches.some(c=>c.head_sha!==sha))status='SHA_MISMATCH';
   else if(matches.some(c=>c.status!=='completed'))status='PENDING';
   else if(matches.some(c=>c.conclusion!=='success'))status='FAILED_OR_UNVERIFIED';
   else status='SUCCESS';
  }
  return {name,status};
 });
 const result=states.every(x=>x.status==='SUCCESS')?'EXACT_SHA_CI_SUCCESS_ONLY':
  states.some(x=>x.status==='SHA_MISMATCH'||x.status==='FAILED_OR_UNVERIFIED')
   ?'FAILED_OR_UNVERIFIED':'REVIEW_REQUIRED';
 return {status:result,checks:states};
}

export async function auditTrackedDrafts(spec,reader,{sourceSha=null}={}){
 validateTrackedDrafts(spec);
 assert.equal(typeof reader,'function');
 const rows=await Promise.all(spec.targetPulls.map(async item=>{
  try{
   const pr=await reader('/pulls/'+item.number);
   const head=pr?.head?.sha;
   if(!SHA.test(head)||pr.number!==item.number||
      pr.state!=='open'||pr.draft!==true){
    return {number:item.number,scope:item.scope,headSha:null,
      status:'PR_NOT_OPEN_DRAFT_OR_METADATA_INVALID',checks:[]};
   }
   const result=await reader('/commits/'+head+'/check-runs?per_page=100');
   if(!Array.isArray(result?.check_runs)||result.total_count>result.check_runs.length){
    return {number:item.number,scope:item.scope,headSha:head,
      status:'CHECKS_INCOMPLETE',checks:[]};
   }
   const assessment=assessExactChecks(result.check_runs,item.requiredChecks,head);
   return {number:item.number,scope:item.scope,headSha:head,...assessment};
  }catch{
   return {number:item.number,scope:item.scope,headSha:null,
     status:'REMOTE_EVIDENCE_NOT_VERIFIED',checks:[]};
  }
 }));
 return {
  schema:'paseka-qa-draft-evidence-v1',
  asOfSourceSha:SHA.test(sourceSha||'')?sourceSha:null,
  repository:spec.repository,
  status:rows.every(r=>r.status==='EXACT_SHA_CI_SUCCESS_ONLY')
    ?'ALL_WATCHED_DRAFT_CODE_CI_VERIFIED_NOT_RELEASE'
    :'REVIEW_REQUIRED',
  prs:rows,
  crossPrRuntimeIntegration:'NOT_PROVEN_BY_INDIVIDUAL_CI',
  physicalDeviceVerified:false,
  fullOriginalRecoveryVerified:false,
  noAutomaticMerge:true,
  releaseAuthorized:false
 };
}

async function githubReader(relative,repository,token){
 const headers={'Accept':'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Paseka-QA-ReadOnly'};
 if(token)headers.Authorization='Bearer '+token;
 const response=await fetch('https://api.github.com/repos/'+repository+relative,{
   method:'GET',headers,signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw new Error('READ_ONLY_GITHUB_STATUS_UNAVAILABLE');
 return response.json();
}

async function main(){
 const spec=JSON.parse(readFileSync(join(ROOT,'qa/tracked-drafts.json'),'utf8'));
 const report=await auditTrackedDrafts(spec,
  path=>githubReader(path,spec.repository,process.env.GITHUB_TOKEN),
  {sourceSha:process.env.GITHUB_SHA});
 const dest=join(ROOT,'qa-results/draft-checks.json');
 mkdirSync(dirname(dest),{recursive:true});
 writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 // Output only statuses and public PR numbers, not API bodies or token.
 console.log('PASEKA_DRAFT_CI '+JSON.stringify({
  status:report.status,prs:report.prs.map(p=>({
    number:p.number,headSha:p.headSha,status:p.status
  })),releaseAuthorized:false
 }));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{
  // Network/API unavailable means no proof, not permission to integrate.
  console.error('PASEKA_DRAFT_EVIDENCE_NOT_VERIFIED');
  process.exitCode=1;
 });
}
