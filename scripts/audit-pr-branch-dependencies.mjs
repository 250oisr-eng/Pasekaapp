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
  // A cycle invalidates any claimed longest path; report null, not an invented number.
  const depths=new Map();
  function depth(n) {
    if(depths.has(n))return depths.get(n);
    const parents=edges.get(n)||[];
    const value=1+Math.max(0,...parents.map(depth));
    depths.set(n,value);
    return value;
  }
  const maxOpenPrChainDepth=cycles.length?null:Math.max(0,...prs.map(p=>depth(p.number)));
  const duplicateHeads=[...byHead.entries()].filter(([,numbers])=>numbers.length>1)
    .map(([head,numbers])=>({head,prs:[...numbers].sort((a,b)=>a-b)}))
    .sort((a,b)=>a.head.localeCompare(b.head));
  return {
    proof:'STRUCTURAL_ONLY_NOT_MERGE_OR_DELETE_SAFETY',
    openPrs:prs.length,mainBased:prs.filter(p=>p.base.ref===main).length,
    stacked:prs.filter(p=>p.base.ref!==main).length,
    branchCount:branches.length,unreferencedBranchCount:unreferenced.length,
    unreferencedBranches:unreferenced,missingLocalHeads,missingLocalBases,
    stackedWithoutOpenParentPr:externalBases,cycles,maxOpenPrChainDepth,duplicateHeads,
    warning:'Unreferenced is not obsolete; check branch commits, merged/closed PR, unique diff, CI, backup and downstream references before any deletion.'
  };
}


/**
 * A branch name missing from open PR heads/bases is not deletion evidence.
 * Closed PR metadata is useful for review priority only; no ref is mutated.
 * Optional compare evidence must be explicitly supplied from a live main...branch
 * comparison, never inferred from a merged flag.
 */
export function analyzeBranchHistory(graph, closedPrs, comparisons={}) {
  if(graph?.proof!=='STRUCTURAL_ONLY_NOT_MERGE_OR_DELETE_SAFETY' ||
     !Array.isArray(graph.unreferencedBranches) || !Array.isArray(closedPrs) ||
     !comparisons || typeof comparisons!=='object' || Array.isArray(comparisons))
    throw Error('Complete structural graph, closed PR list and comparison map required');
  const numbers=new Set(), byHead=new Map();
  let mergedClosed=0;
  for(const p of closedPrs){
    if(p?.state!=='closed'||!Number.isSafeInteger(p.number)||p.number<1||
       numbers.has(p.number)||typeof p.head?.ref!=='string'||!p.head.ref||
       !(p.merged_at===null||p.merged_at===undefined||typeof p.merged_at==='string'))
      throw Error('Invalid/duplicate closed PR metadata');
    numbers.add(p.number);
    if(p.merged_at)mergedClosed++;
    const list=byHead.get(p.head.ref)||[];
    list.push(p);
    byHead.set(p.head.ref,list);
  }
  const groups={mergedOnly:[],closedUnmergedOnly:[],mixedClosedStates:[],noClosedPr:[]};
  const verifiedComparisons=[];
  for(const name of graph.unreferencedBranches){
    const history=byHead.get(name)||[];
    const hasMerged=history.some(p=>Boolean(p.merged_at));
    const hasUnmerged=history.some(p=>!p.merged_at);
    const group=!history.length?'noClosedPr':hasMerged&&hasUnmerged?'mixedClosedStates':
      hasMerged?'mergedOnly':'closedUnmergedOnly';
    groups[group].push(name);
    if(Object.hasOwn(comparisons,name)){
      const c=comparisons[name];
      if(!c||!Number.isSafeInteger(c.ahead_by)||c.ahead_by<0||
         !Number.isSafeInteger(c.behind_by)||c.behind_by<0||
         !['ahead','behind','diverged','identical'].includes(c.status)||
         (c.status==='ahead'&&c.behind_by!==0)||
         (c.status==='behind'&&c.ahead_by!==0)||
         (c.status==='identical'&&(c.ahead_by!==0||c.behind_by!==0))||
         (c.status==='diverged'&&(!c.ahead_by||!c.behind_by)))
        throw Error('Invalid compare evidence for '+name);
      verifiedComparisons.push({
        branch:name,group,aheadBy:c.ahead_by,behindBy:c.behind_by,
        status:c.status,
        verdict:c.ahead_by===0?'ANCESTOR_ONLY_REVIEW_NO_DELETE':'UNIQUE_COMMITS_REVIEW_NO_DELETE'
      });
    }
  }
  return {
    proof:'CLOSED_PR_HISTORY_AND_OPTIONAL_ANCESTRY_NO_DELETE_AUTHORIZATION',
    closedPrCount:closedPrs.length,mergedClosedPrCount:mergedClosed,
    unmergedClosedPrCount:closedPrs.length-mergedClosed,
    groupCounts:Object.fromEntries(Object.entries(groups).map(([key,items])=>[key,items.length])),
    groups,verifiedComparisons,
    warning:'Merged PR, missing open references and ahead=0 are separate evidence. None alone authorizes branch deletion.'
  };
}

export async function collectPortfolio(fetchPage) {
  const [graph,closed]=await Promise.all([
    collectGraph(fetchPage),
    listAll((page,size)=>fetchPage('closed',page,size))
  ]);
  return {...graph,closedPrHistory:analyzeBranchHistory(graph,closed)};
}


/**
 * A complete, independently supplied changed-file list can reveal collision
 * candidates, not textual or semantic merge conflicts. No GitHub writes here.
 */
export function analyzeRootFileOverlaps(entries,{base='main'}={}) {
  if(!Array.isArray(entries))throw Error('Complete PR file inventories required');
  const seen=new Set(), roots=[];
  for(const entry of entries){
    if(!Number.isSafeInteger(entry?.number)||entry.number<1||seen.has(entry.number)||
       typeof entry.base!=='string'||!entry.base||entry.complete!==true||
       !Array.isArray(entry.paths)||entry.paths.some(path=>
         typeof path!=='string'||!path||path.startsWith('/')||
         path.includes('\\')||path.split('/').includes('..'))||
       new Set(entry.paths).size!==entry.paths.length)
      throw Error('Incomplete or invalid PR file inventory');
    seen.add(entry.number);
    if(entry.base===base)roots.push(entry);
  }
  roots.sort((a,b)=>a.number-b.number);
  const isCritical=path=>/^(?:index\.html$|sw\.js$|package(?:-lock)?\.json$|js\/|scripts\/|android\/|android-native\/|\.github\/workflows\/)/.test(path);
  const pairs=[];
  for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++){
    const a=roots[i],b=roots[j],their=new Set(b.paths);
    const shared=a.paths.filter(path=>their.has(path)).sort();
    const critical=shared.filter(isCritical);
    if(critical.length)pairs.push({
      left:a.number,right:b.number,sharedCritical:critical,
      sharedTests:shared.filter(path=>path.startsWith('tests/')).length,
      sharedGovernance:shared.filter(path=>path==='PROJECT_STATUS.md'||path.startsWith('docs/')).length
    });
  }
  return {
    proof:'COMPLETE_PATH_OVERLAP_ONLY_NOT_SEMANTIC_MERGE_CONFLICT',
    reviewedRootPrs:roots.length,criticalPairCount:pairs.length,pairs,
    warning:'Same filename does not prove a merge conflict or justify closing, merging or rebasing a PR.'
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
  if(!['pulls','closed','branches'].includes(kind))throw Error('Unknown GitHub inventory endpoint');
  const endpoint=kind==='pulls'?'pulls?state=open&':kind==='closed'?'pulls?state=closed&':'branches?';
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
      const result=await collectPortfolio((kind,page,size)=>
        fetchPage(repo,process.env.GITHUB_TOKEN,kind,page,size));
      console.log(JSON.stringify({repository:repo,asOfUtc:new Date().toISOString(),...result},null,2));
    } catch(e) {console.error('GRAPH_NOT_VERIFIED: '+e.message);process.exitCode=1;}
  }
}
