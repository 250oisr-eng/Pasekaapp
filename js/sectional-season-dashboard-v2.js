(function(){
'use strict';
// Read-only beekeeper-facing seasonal history. No completion, mutation or auto-upgrade.
const A=x=>Array.isArray(x)?x:[],S=x=>typeof x==='string'&&x.trim().length>0;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const OP=Array.from({length:14},(_,i)=>'OP-'+String(i+1).padStart(2,'0'));
function describe(state,deps={}){
 const ledger=deps.ledger,dualRead=deps.dualRead;
 if(typeof dualRead?.readView!=='function'||typeof ledger?.inspect!=='function')return {ok:false,error:'season_view_validator_missing'};
 let view;try{view=dualRead.readView(state,{ledger})}catch{return {ok:false,error:'season_view_invalid'}}
 if(!view?.ok)return {ok:false,error:'season_view_history_corrupt'};
 const hives=A(state?.hives).filter(h=>h?.profileId==='sectional-multiqueen-v1');
 const result=hives.map(h=>{
  const cycles=A(view.records).filter(c=>c?.hiveId===h.id).sort((a,b)=>a.cycleNumber-b.cycleNumber);
  const active=cycles.find(c=>c.status==='ACTIVE')||null;
  const pending=active&&['REQUIRES_RECONCILIATION','BASELINE_IMPORTED_PENDING_ACTIVATION'].includes(active.migrationStatus);
  const last=active?.events?.filter(e=>e.type==='STAGE_CONFIRMED').at(-1);
  const records=A(state.sectionalTechProcesses).filter(p=>p.hiveId===h.id);
  const known=new Set([
   ...A(active?.events).filter(e=>e.type==='STAGE_CONFIRMED').map(e=>e.evidence?.operationId),
   ...records.flatMap(r=>A(r.state?.operations).filter(x=>x.status==='DONE').map(x=>x.operationId))
  ]);
  const extras={'OP-01':A(state.sectionalEntranceObservations).some(e=>e.hiveId===h.id&&e.userConfirmed===true),
   'OP-03':A(state.sectionalBodyReorders).some(e=>e.hiveId===h.id&&e.userConfirmed===true)};
  for(const [key,v]of Object.entries(extras))if(v)known.add(key);
  const stageHistory=cycles.flatMap(c=>A(c.events).filter(e=>e.type==='STAGE_CONFIRMED').map(e=>({cycleNumber:c.cycleNumber,operationId:e.evidence.operationId,occurredAt:e.occurredAt})));
  return {hiveId:h.id,cycles:cycles.length,activeCycleNumber:active?.cycleNumber??null,activeStatus:pending?'MIGRATION_PENDING':active?'ACTIVE':'NO_ACTIVE',lastOperation:last?.evidence?.operationId||null,confirmedOperations:OP.filter(id=>known.has(id)),history:stageHistory,canStartNewCycle:!active&&cycles.length>0&&cycles.at(-1)?.status==='CLOSED'};
 });
 return {ok:true,readOnly:true,hives:result};
}
function render(host,state,deps={}){
 if(!host||typeof host.innerHTML!=='string')return {ok:false,error:'season_dashboard_host_missing'};
 const view=describe(state,deps);
 if(!view.ok){host.textContent='Сезонная история недоступна: проверка целостности не пройдена. Ничего не изменяйте до восстановления из проверенной копии.';return view}
 if(!view.hives.length){host.textContent='Трёхсекционных ульев нет. Данные Farrar не меняются.';return view}
 host.innerHTML=view.hives.map(h=>'<article class="card"><b>Улей '+esc(h.hiveId)+'</b><p>Циклов: '+h.cycles+'; активный: '+(h.activeCycleNumber??'нет')+'</p><p>'+(
  h.activeStatus==='MIGRATION_PENDING'?'Блокировка: требуется сверка миграции и полного архива.':
  h.activeStatus==='ACTIVE'?'Активный цикл. Только фактически выполненные операции отмечаются вручную.':
  'Активного цикла нет. Новый цикл требует подтверждённого окончания предыдущего.')+'</p><p>Подтверждённые этапы: '+
  (h.confirmedOperations.length?h.confirmedOperations.map(esc).join(', '):'нет')+'</p><details><summary>История сезонных переходов</summary>'+
  (h.history.length?'<ol>'+h.history.map(x=>'<li>Цикл '+x.cycleNumber+' · '+esc(x.operationId)+' · '+esc(x.occurredAt)+'</li>').join('')+'</ol>':'<p>Подтверждённых физических переходов v2 пока нет.</p>')+
  '</details></article>').join('');
 return view;
}
window.PasekaSectionalSeasonDashboardV2=Object.freeze({describe,render});
})();