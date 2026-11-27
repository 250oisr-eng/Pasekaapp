(function(){
'use strict';
// Isolated DOM review for synthetic QA. No production attachment or writes.
function render(host,model,labels){
 if(!host||typeof host.replaceChildren!=='function')throw Error('review_host_required');
 host.replaceChildren();
 if(!model?.visible)return;
 const doc=host.ownerDocument,add=(tag,text,parent=host)=>{const e=doc.createElement(tag);e.textContent=text;parent.append(e);return e;};
 add('h3','Медовые корпуса');
 add('p','Установлено: '+model.bodyCount+' · по 10 рамок в корпусе');
 const name=id=>String(labels?.[id]||id);
 for(const p of model.installedPairs||[])add('p','Пара: '+p.bodyIds.map(name).join(' / '));
 for(const p of model.offers||[])add('p','Доступна дополнительная пара: '+p.bodyIds.map(name).join(' / '));
 for(const p of model.pending||[])add('p','Ожидает возврата: '+p.bodyIds.map(name).join(' / '));
 if(model.canReviewExtraction)add('p','Откачка: снять все '+model.bodyCount+' медовых корпуса и обе решётки, закрыть секции крышками.');
 if(model.canReviewInstallation)add('p','Новая установка: выбрать 2 или 4 корпуса и две решётки независимо от предыдущего количества.');
 const status=add('p','Предварительный просмотр. Сохранение физической операции пока заблокировано B07.');
 status.setAttribute('role','status');
}
window.PasekaSectionalHoneyReviewUI=Object.freeze({render});
})();
