// Only the versioned Paseka application shell may be cached offline.
const CACHE='paseka-shell-v327';
const CACHE_PREFIX='paseka-shell-';
const FILES=['./','./index.html','./manifest.webmanifest','./icons/paseka.svg','./js/voice-command-parser.js','./js/voice-session.js','./js/hive-model.js','./js/equipment-labels.js','./js/equipment-bodies.js','./js/equipment-inventory.js','./js/equipment-items.js','./js/sectional-physical-layout.js','./js/family-lineage.js','./js/sectional-operation-coordinator.js','./js/sectional-technology-catalog.js','./js/sectional-queen-outcome.js','./js/sectional-op02-feeding.js','./js/sectional-op02-course.js','./js/sectional-entrance-operations.js','./js/sectional-op03-body-swap.js','./js/sectional-season-ledger-v2.js','./js/sectional-season-evidence-v2.js','./js/sectional-season-operation-rules-v2.js','./js/sectional-season-dual-read-v2.js','./js/sectional-season-migration-v2.js','./js/sectional-season-transaction-v2.js','./js/sectional-season-dashboard-v2.js','./js/sectional-season-operations-wizard-v2.js','./js/sectional-op10-honey-removal.js','./js/disaster-archive.js','./js/sectional-season-archive-replay-v2.js','./js/sectional-op09-entrances.js','./js/sectional-op08-honey.js','./js/equipment-reconciliation.js','./js/equipment-reconciliation-voice.js','./js/entrance-analysis.js','./js/varroa-monitor.js','./js/pesticide-incident.js','./js/season-planning.js','./js/deadout-review.js'];
const SCOPE=new URL(self.registration.scope);
const SHELL_PATHS=new Set(FILES.map(file=>new URL(file,SCOPE).pathname));

function cacheableResponse(response){
  return response.ok &&
    (response.type==='basic'||response.type==='default') &&
    !/\b(?:no-store|private)\b/i.test(response.headers?.get('cache-control')||'');
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key))))
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
