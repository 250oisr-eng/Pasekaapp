import {fileURLToPath} from 'node:url';

// Read-only structural evidence. No branch or PR can be automatically declared safe to delete.
export function analyzePrBranchGraph(prs, branches, {main='main'}={}) {
  if (!Array.isArray(prs) || !Array.isArray(branches)) throw Error('Complete PR and branch lists required');
  const names=new Set(), numbers=new Set(), heads=new Set(), bases=new Set(), byHead=new Map();
  for(const name of branches) {
    if(typeof name!=='string'||!name||names.has(name)) throw Error('Invalid/duplicate branch');
    names.add(name);
  }
  if(!names.has(main)) throw Error('Main branch missing from inventory');
  for(const p of prs) {
    if(!Number.isSafeInteger(p?.number)||p.number<1||numbers.has(p.number)||
       typeof p.head?.ref!=='string'||!p.head.ref||typeof p.base?.ref!=='string'||!p.base.ref||
       p.state!=='open') throw Error('Invalid/duplicate open PR metadata');
    numbers.add(p.number); heads.add(p.head.ref); bases.add(p.base.ref);
    if(!byHead.has(p.head.ref)) byHead.set(p.head.ref,[]);
    byHead.get(p.head.ref).push(p.number);
  }
  const missingLocalHeads=prs.filter(p=>!names.has(p.head.ref)).map(p=>p.number);
  const missingLocalBases=prs.filter(p=>!names.has(p.base.ref)).map(p=>({number:p.number,base:p.base.ref}));
  const externalBases=prs.filter(p=>p.base.ref!==main&&!heads.has(p.base.ref))
    .map(p=>({number:p.number,base:p.base.ref,baseExists:names.has(p.base.ref)}));
  const unreferenced=branches.filter(name=>name!==main&&!heads.has(name)&&!bases.has(name)).sort();
  const edges=new Map();
  for(const p of prs) edges.set(p.number,(byHead.get(p.base.ref)||[]).filter(n=>n!==p.number));
  const cycles=[]; const visited=new Set(),active=new Set(),path=[];
  function walk(n) {
    if(active.has(n)) {cycles.push([...path.slice(path.indexOf(n)),n]);return;}
    if(visited.has(n)) return;
    visited.add(n);active.add(n);path.push(n);
    for(const parent of edges.get(n)||[]) walk(parent);
    path.pop();active.delete(n);
  }
  for(const p of prs) walk(p.number);
  return {
    proof:'STRUCTURAL_ONLY_NOT_MERGE_OR_DELETE_SAFETY',
    openPrs:prs.length,mainBased:prs.filter(p=>p.base.ref===main).length,
    stacked:prs.filter(p=>p.base.ref!==main).length,
    branchCount:branches.length,unreferencedBranchCount:unreferenced.length,
    unreferencedBranches:unreferenced,missingLocalHeads,missingLocalBases,
    stackedWithoutOpenParentPr:externalBases,cycles,
    warning:'Unreferenced is not obsolete; check branch commits, merged/closed PR, unique diff, CI, backup and downstream references before any deletion.'
  };
}

async function listAll(fetchPage,{pageSize=100,maxPages=30}={}) {
  const all=[];
  for(let page=1;page<=maxPages;page++) {
    const data=await fetchPage(page,pageSize);
    if(!Array.isArray(data)||data.length>pageSize)throw Error('Malformed page '+page);
    all.push(...data);
    if(data.length<pageSize)return all;
  }
  throw Error('Pagination incomplete: refusing to report an exact total');
}

export async function collectGraph(fetchPage) {
  const [prs, branches]=await Promise.all([
    listAll((page,size)=>fetchPage('pulls',page,size)),
    listAll((page,size)=>fetchPage('branches',page,size))
  ]);
  return analyzePrBranchGraph(prs,branches.map(b=>b.name));
}

async function fetchPage(repo,token,kind,page,size) {
  const endpoint=kind==='pulls'?'pulls?state=open&':'branches?';
  const response=await fetch('https://api.github.com/repos/'+repo+'/'+endpoint+
    'per_page='+size+'&page='+page,{
    method:'GET',headers:{Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      ...(token?{Authorization:'Bearer '+token}:{})},
    signal:AbortSignal.timeout(20000)
  });
  if(!response.ok) throw Error('GitHub '+kind+' HTTP '+response.status+' page '+page);
  return response.json();
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const repo=process.env.GITHUB_REPOSITORY||'250oisr-eng/Pasekaapp';
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    console.error('INVALID_REPOSITORY');process.exitCode=1;
  } else {
    try {
      const result=await collectGraph((kind,page,size)=>
        fetchPage(repo,process.env.GITHUB_TOKEN,kind,page,size));
      console.log(JSON.stringify({repository:repo,asOfUtc:new Date().toISOString(),...result},null,2));
    } catch(e) {console.error('GRAPH_NOT_VERIFIED: '+e.message);process.exitCode=1;}
  }
}
