// Only the versioned Paseka application shell may be cached offline.
const CACHE='paseka-shell-v318';
const CACHE_VERSION=318;
const FILES=['./','./index.html','./manifest.webmanifest','./icons/paseka.svg','./js/voice-command-parser.js','./js/voice-session.js','./js/hive-model.js','./js/equipment-labels.js','./js/equipment-bodies.js','./js/equipment-inventory.js','./js/equipment-items.js','./js/sectional-physical-layout.js','./js/family-lineage.js','./js/sectional-operation-coordinator.js','./js/equipment-reconciliation.js','./js/equipment-reconciliation-voice.js','./js/entrance-analysis.js','./js/varroa-monitor.js','./js/pesticide-incident.js','./js/season-planning.js','./js/deadout-review.js','./js/p0-source-inventory.js','./js/disaster-archive.js'];
const SCOPE=new URL(self.registration.scope);
const SHELL_PATHS=new Set(FILES.map(file=>new URL(file,SCOPE).pathname));

// Only obsolete version-numbered application-shell caches are disposable.
// A private/user cache with a similar prefix must never be removed.
function isObsoleteShellCache(name){
  const match=/^paseka-shell-v([1-9]\d*)$/.exec(name);
  if(!match)return false;
  const version=Number(match[1]);
  return Number.isSafeInteger(version) && version<CACHE_VERSION;
}

function cacheableResponse(response){
  return response.ok &&
    (response.type==='basic'||response.type==='default') &&
    !/\b(?:no-store|private)\b/i.test(response.headers?.get('cache-control')||'');
}

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE).then(async cache=>{
      // Cache.addAll() does not enforce our private/no-store response policy.
      // Reject an incomplete or restricted shell before enabling this worker.
      for(const file of FILES){
        const asset=new URL(file,SCOPE);
        const response=await fetch(asset.href,{cache:'reload',credentials:'same-origin'});
        if(!cacheableResponse(response)){
          throw new Error('Offline shell install blocked by missing or non-cacheable asset: '+file);
        }
        await cache.put(asset.href,response);
      }
    }).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(isObsoleteShellCache).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  // Never intercept third-party traffic, other applications on this origin, or user data APIs.
  if(url.origin!==SCOPE.origin)return;
  const navigation=request.mode==='navigate';
  if(navigation){
    if(!url.pathname.startsWith(SCOPE.pathname))return;
  }else if(!SHELL_PATHS.has(url.pathname)){
    return;
  }

  const remember=response=>{
    if(cacheableResponse(response)&&SHELL_PATHS.has(url.pathname)){
      event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,response.clone())).catch(()=>{}));
    }
    return response;
  };

  if(navigation){
    // The network is authoritative online; only the app shell is an offline fallback.
    event.respondWith(
      fetch(request).then(remember).catch(()=>
        caches.open(CACHE)
          .then(cache=>cache.match(request,{ignoreSearch:true})
            .then(saved=>saved||cache.match('./index.html')))
          .then(saved=>saved||Response.error())
      )
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE)
      .then(cache=>cache.match(request,{ignoreSearch:true}))
      .then(saved=>saved||fetch(request).then(remember).catch(()=>Response.error()))
  );
});
