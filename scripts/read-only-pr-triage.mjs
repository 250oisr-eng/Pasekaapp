import {fileURLToPath} from 'node:url';

const SHA40=/^[a-f0-9]{40}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// Read-only inventory. No mergeability, code safety or CI readiness is inferred.
export async function collectOpenPulls(fetchPage,{pageSize=100,maxPages=20}={}){
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Invalid pageSize');
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100)throw Error('Invalid maxPages');
  const result=[],seen=new Set();
  for(let page=1;page<=maxPages;page++){
    const items=await fetchPage(page,pageSize);
    if(!Array.isArray(items)||items.length>pageSize)throw Error('Incomplete or malformed GitHub pull request page '+page);
    for(const p of items){
      if(!Number.isSafeInteger(p?.number)||p.number<1||seen.has(p.number))throw Error('Duplicate/invalid PR number');
      if(!p.base?.ref||!SHA40.test(p.head?.sha||'')||p.state!=='open')throw Error('Incomplete or invalid PR metadata '+p.number);
      seen.add(p.number);
      result.push({number:p.number,title:String(p.title||''),base:p.base.ref,
        headSha:p.head.sha,draft:p.draft===true,updatedAt:p.updated_at||null,
        // Never assert ready-for-merge from a list endpoint.
        reviewStatus:'REVIEW_REQUIRED',ciStatus:'NOT_CHECKED',ancestry:'NOT_CHECKED'});
    }
    if(items.length<pageSize)return result;
  }
  // The last full page might hide more PRs. Never produce a false total.
  throw Error('Pagination limit reached before an unambiguously complete page');
}

export function summarizeOpenPulls(items,{mainRef='main'}={}){
  if(!Array.isArray(items))throw Error('Expected complete pull-request inventory');
  const bases=new Map();
  for(const p of items)bases.set(p.base,(bases.get(p.base)||0)+1);
  const root=items.filter(p=>p.base===mainRef);
  return {
    inventoryStatus:'COMPLETE_PAGE_WALK_ONLY',
    totalOpen:items.length,
    directMainBase:root.length,
    otherBase:items.length-root.length,
    baseCounts:[...bases].map(([base,count])=>({base,count})).sort((a,b)=>b.count-a.count||a.base.localeCompare(b.base)),
    // Sorting is recency only, not relative safety or actual priority.
    directMainCandidates:[...root].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(p=>({number:p.number,title:p.title,headSha:p.headSha,draft:p.draft,
        reviewStatus:p.reviewStatus,ciStatus:p.ciStatus,ancestry:p.ancestry})),
    caveat:'Branch base, recency and commit SHA do not establish semantic safety, mergeability or exact-SHA CI'
  };
}

async function githubPage(repository,token,page,pageSize){
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Paseka-ReadOnly-PR-Triage'};
  if(token)headers.Authorization='Bearer '+token;
  const url='https://api.github.com/repos/'+repository+
    '/pulls?state=open&per_page='+pageSize+'&page='+page+'&sort=updated&direction=desc';
  const response=await fetch(url,{method:'GET',headers,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('GitHub PR inventory read failed HTTP '+response.status+' page '+page);
  return response.json();
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const repository=process.env.GITHUB_REPOSITORY||'250oisr-eng/Pasekaapp';
    if(!REPO.test(repository))throw Error('Invalid GITHUB_REPOSITORY');
    const prs=await collectOpenPulls((page,size)=>githubPage(repository,process.env.GITHUB_TOKEN,page,size));
    console.log(JSON.stringify({repository,asOfUtc:new Date().toISOString(),...summarizeOpenPulls(prs)},null,2));
  }catch(err){
    console.error('B08_INVENTORY_NOT_VERIFIED: '+err.message);
    process.exitCode=1;
  }
}
