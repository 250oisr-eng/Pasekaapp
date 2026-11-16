(() => {
'use strict';

const EVENT_LABELS = Object.freeze({
 split: 'Разделение семьи',
 merge: 'Объединение семей',
 alternative_wintering_configured: 'Альтернативная зимовка',
 placement_changed: 'Перемещение семьи',
 queen_identity_confirmed: 'Подтверждение матки',
 early_honey_harvest_completed: 'Ранний медосбор',
 offshoot_created: 'Создание отводка'
});
const familyStatus = family => family?.recordStatus === 'historical' ? 'historical' : 'active';
const familyName = (state, id) => {
 const family = (Array.isArray(state?.families) ? state.families : []).find(row => row?.id === id);
 return family?.name || family?.code || (id ? 'Семья ' + id : 'Семья не указана');
};
const queenName = (state, id) => {
 const queen = (Array.isArray(state?.queens) ? state.queens : []).find(row => row?.id === id);
 return queen?.code || (id ? 'Матка ' + id : 'Матка не указана');
};
function getPendingConfirmations(state) {
 const families = Array.isArray(state?.families) ? state.families : [];
 const queens = Array.isArray(state?.queens) ? state.queens : [];
 const events = Array.isArray(state?.familyEvents) ? state.familyEvents : [];
 const result = [];
 for (const family of families) {
  if (!family || familyStatus(family) !== 'active' || family.currentQueenId || family.queenIdentityStatus !== 'unresolved') continue;
  const sourceEvent = events.slice().reverse().find(event =>
   Array.isArray(event?.resultFamilyIds) && event.resultFamilyIds.includes(family.id) &&
   Array.isArray(event.candidateQueenIds) && event.candidateQueenIds.length
  );
  if (!sourceEvent) continue;
  const candidates = sourceEvent.candidateQueenIds
   .map(id => queens.find(queen => queen?.id === id))
   .filter(queen => queen && !families.some(other =>
    other?.id !== family.id && familyStatus(other) === 'active' && other.currentQueenId === queen.id
   ));
  if (!candidates.length) continue;
  result.push({familyId:family.id,familyName:family.name||family.code||family.id,sourceEvent,candidates:candidates.map(queen=>({
   queenId:queen.id,code:queen.code||null,originFamilyId:queen.originFamilyId||queen.familyId||null
  }))});
 }
 return result;
}
function describeEvent(state, event) {
 const sources = (Array.isArray(event?.sourceFamilyIds) ? event.sourceFamilyIds : []).map(id => familyName(state,id));
 const results = (Array.isArray(event?.resultFamilyIds) ? event.resultFamilyIds : []).map(id => familyName(state,id));
 const families = (Array.isArray(event?.familyIds) ? event.familyIds : []).map(id => familyName(state,id));
 switch (event?.type) {
  case 'split': return sources.join(', ') + ' → ' + results.join(', ');
  case 'merge': return sources.join(', ') + ' → ' + results.join(', ') + '. Идентичность матки результата не определена';
  case 'alternative_wintering_configured': {
   const positions = (Array.isArray(event.layout) ? event.layout : []).map(row =>
    (row.position === 'lower' ? 'нижняя' : row.position === 'middle' ? 'средняя' : row.position === 'upper' ? 'верхняя' : 'неизвестная') +
    ': ' + familyName(state,row.familyId) + ' (' + String(row.bodyCount ?? '?') + ' корпуса)'
   );
   return families.join(', ') + (positions.length ? '. ' + positions.join('; ') : '');
  }
  case 'placement_changed':
   return familyName(state,event.familyId) + ': ' + String(event.from?.position||'позиция не указана') +
    ' → ' + String(event.to?.position||'позиция не указана') +
    (event.to?.bottomItemId ? '; дно ' + event.to.bottomItemId : '');
  case 'queen_identity_confirmed':
   return familyName(state,event.familyId) + ': ' + queenName(state,event.queenId);
  case 'early_honey_harvest_completed':
   return families.join(', ') + '. Гнездо после отбора: ' + String(event.nestBodiesAfterHarvest ?? 'не указано') + ' корпуса';
  case 'offshoot_created':
   return families.join(', ') || results.join(', ') || sources.join(', ');
  default:
   return 'Событие семейной истории';
 }
}
function buildOverview(state) {
 const families = Array.isArray(state?.families) ? state.families : [];
 const events = Array.isArray(state?.familyEvents) ? state.familyEvents : [];
 const orderedEvents = events.map((event,index)=>({event,index})).sort((a,b)=>{
  const at=Date.parse(a.event?.occurredAt||a.event?.createdAt||'')||0;
  const bt=Date.parse(b.event?.occurredAt||b.event?.createdAt||'')||0;
  return bt-at||b.index-a.index;
 }).map(row=>({
  id:row.event?.id||'event-'+row.index,
  type:row.event?.type||'unknown',
  label:EVENT_LABELS[row.event?.type]||'Событие',
  date:row.event?.occurredAt||row.event?.createdAt||null,
  operationId:row.event?.operationId||null,
  description:describeEvent(state,row.event),
  candidateQueenNames:(Array.isArray(row.event?.candidateQueenIds)?row.event.candidateQueenIds:[]).map(id=>queenName(state,id))
 }));
 const active = families.filter(row=>row&&familyStatus(row)==='active');
 const historical = families.filter(row=>row&&familyStatus(row)==='historical');
 const unresolved = active.filter(row=>row.queenIdentityStatus==='unresolved'||(!row.currentQueenId&&row.queenIdentityStatus==null));
 return {
  activeCount:active.length,
  historicalCount:historical.length,
  unresolvedCount:unresolved.length,
  pendingConfirmations:getPendingConfirmations(state),
  events:orderedEvents
 };
}
function node(doc,tag,className,text) {
 const el=doc.createElement(tag);
 if(className)el.className=className;
 if(text!==undefined&&text!==null)el.textContent=String(text);
 return el;
}
let confirmDialog=null;
function ensureConfirmDialog(doc) {
 if(confirmDialog&&confirmDialog.ownerDocument===doc)return confirmDialog;
 const dialog=node(doc,'dialog');dialog.id='familyLineageConfirmDialog';
 const title=node(doc,'h2','', 'Подтверждение матки');
 const explanation=node(doc,'p','muted','Выбирай только матку, которую фактически определил в этой семье. Если идентичность пока неизвестна, закрой окно: запись останется неопределённой.');
 const form=node(doc,'form');
 const familyLabel=node(doc,'label','', 'Семья');
 const familyText=node(doc,'p','');familyText.id='familyLineageConfirmFamily';
 const queenLabel=node(doc,'label','', 'Фактически обнаруженная матка');
 const select=node(doc,'select');select.required=true;select.id='familyLineageConfirmQueen';
 const dateLabel=node(doc,'label','', 'Дата фактического определения');
 const date=node(doc,'input');date.type='date';date.required=true;date.id='familyLineageConfirmDate';
 const feedback=node(doc,'p','muted');feedback.id='familyLineageConfirmFeedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const actions=node(doc,'div','row');
 const cancel=node(doc,'button','', 'Отмена');cancel.type='button';cancel.addEventListener('click',()=>dialog.close());
 const submit=node(doc,'button','primary','Подтвердить');submit.type='submit';
 actions.append(cancel,submit);
 form.append(familyLabel,familyText,queenLabel,select,dateLabel,date,feedback,actions);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const familyId=dialog.dataset.familyId||'';
  const queenId=select.value;
  const actualDate=date.value;
  const status=dialog.querySelector('#familyLineageConfirmFeedback');
  if(!familyId||!queenId||!actualDate){status.textContent='Выбери семью, матку и фактическую дату.';return}
  if(typeof S==='undefined'||!Array.isArray(S.families)||!window.PasekaFamilyLineage){status.textContent='Модель семейной истории недоступна.';return}
  const pending=getPendingConfirmations(S).find(row=>row.familyId===familyId);
  const candidate=pending?.candidates.find(row=>row.queenId===queenId);
  if(!pending||!candidate){status.textContent='Кандидат больше не доступен. Обнови экран и проверь историю.';return}
  let previous;
  try{previous=typeof structuredClone==='function'?structuredClone(S):JSON.parse(JSON.stringify(S))}
  catch(error){status.textContent='Не удалось подготовить безопасную копию: '+(error.message||error);return}
  const occurredAt=new Date(actualDate+'T12:00:00').toISOString();
  const result=window.PasekaFamilyLineage.confirmQueenIdentity(S,{
   familyId,queenId,date:actualDate,occurredAt,
   operationId:pending.sourceEvent.operationId||null,
   scenario:pending.sourceEvent.scenario||null,
   techProcessId:pending.sourceEvent.techProcessId||null
  },uid,occurredAt);
  if(!result?.ok){status.textContent='Подтверждение отклонено: '+String(result?.error||'ошибка проверки');return}
  logAudit('family_lineage_queen_identity_confirmed',{
   hiveId:result.family.hive,familyId,queenId,techProcessId:pending.sourceEvent.techProcessId||null
  });
  status.textContent='Сохраняем подтверждение…';
  try{
   const saved=await saveFamilyMutation(previous);
   if(!saved){status.textContent='Сохранение не подтверждено. Исходное состояние восстановлено.';return}
   dialog.close();
   render();
  }catch(error){
   S=previous;render();
   status.textContent='Ошибка сохранения: '+(error.message||error);
  }
 });
 dialog.append(title,explanation,form);
 doc.body.append(dialog);
 confirmDialog=dialog;
 return dialog;
}
function openConfirmDialog(state,familyId,doc) {
 const pending=getPendingConfirmations(state).find(row=>row.familyId===familyId);
 if(!pending)return false;
 const dialog=ensureConfirmDialog(doc);
 dialog.dataset.familyId=familyId;
 dialog.querySelector('#familyLineageConfirmFamily').textContent=pending.familyName;
 const select=dialog.querySelector('#familyLineageConfirmQueen');
 select.replaceChildren();
 for(const candidate of pending.candidates){
  const option=node(doc,'option','',candidate.code||candidate.queenId);
  option.value=candidate.queenId;
  select.append(option);
 }
 dialog.querySelector('#familyLineageConfirmDate').value='';
 dialog.querySelector('#familyLineageConfirmFeedback').textContent='';
 if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
 return true;
}
function renderHistory(state,doc=typeof document!=='undefined'?document:null) {
 if(!doc)return null;
 const anchor=doc.getElementById('queenRegistryList');
 if(!anchor?.parentElement)return null;
 let root=doc.getElementById('familyLineageHistory');
 if(!root){
  root=node(doc,'section','card');root.id='familyLineageHistory';
  anchor.parentElement.insertAdjacentElement('afterend',root);
 }
 root.replaceChildren();
 const overview=buildOverview(state);
 const header=node(doc,'div','row');
 header.append(node(doc,'b','', 'История семей и маток'));
 header.append(node(doc,'span','pill', 'Действующие: '+overview.activeCount+' · исторические: '+overview.historicalCount));
 root.append(header);
 root.append(node(doc,'p','muted','Разделение и объединение — это записи происхождения. Они не подтверждают физическую перестановку корпусов. Неизвестная матка остаётся неизвестной до фактического определения.'));
 root.append(node(doc,'p','muted','Матки не определены: '+overview.unresolvedCount));
 if(overview.pendingConfirmations.length){
  root.append(node(doc,'h3','', 'Матки-кандидаты'));
  for(const pending of overview.pendingConfirmations){
   const item=node(doc,'div','queen-registry-item');
   item.append(node(doc,'b','',pending.familyName));
   item.append(node(doc,'p','muted','Кандидаты: '+pending.candidates.map(candidate=>candidate.code||candidate.queenId).join(', ')));
   const button=node(doc,'button','', 'Подтвердить фактически определённую матку');
   button.type='button';button.addEventListener('click',()=>openConfirmDialog(state,pending.familyId,doc));
   item.append(button);
   root.append(item);
  }
 }
 root.append(node(doc,'h3','', 'События'));
 if(!overview.events.length)root.append(node(doc,'p','muted','Событий семейной истории пока нет.'));
 else{
  const list=node(doc,'div','queen-event-list');
  for(const event of overview.events){
   const item=node(doc,'div','queen-event');
   const date=event.date&&Number.isFinite(Date.parse(event.date))?new Date(event.date).toLocaleDateString('ru-RU'):'дата не указана';
   item.append(node(doc,'b','',event.label));
   item.append(node(doc,'span','muted',' · '+date+(event.operationId?' · '+event.operationId:'')));
   item.append(node(doc,'div','',event.description));
   if(event.candidateQueenNames.length)item.append(node(doc,'div','muted','Матки-кандидаты: '+event.candidateQueenNames.join(', ')));
   list.append(item);
  }
  root.append(list);
 }
 return root;
}
window.PasekaFamilyLineageUI=Object.freeze({buildOverview,getPendingConfirmations,describeEvent,renderHistory});
if(typeof window.renderQueenRegistry==='function'){
 const original=window.renderQueenRegistry;
 window.renderQueenRegistry=function(...args){
  const result=original.apply(this,args);
  try{window.PasekaFamilyLineageUI.renderHistory(S,document)}catch(error){console.error('Не удалось обновить историю семей:',error)}
  return result;
 };
}
})();