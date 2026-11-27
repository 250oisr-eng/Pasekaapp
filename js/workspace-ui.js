(function(root){
'use strict';
const seasons=Object.freeze({
 spring:Object.freeze({label:'Весна',topics:Object.freeze(['Облёт и развитие','Расплод и расширение'])}),
 summer:Object.freeze({label:'Лето',topics:Object.freeze(['Медосбор','Роевое состояние и корпуса'])}),
 autumn:Object.freeze({label:'Осень',topics:Object.freeze(['Кормовые запасы','Подготовка к зимовке'])}),
 winter:Object.freeze({label:'Зима',topics:Object.freeze(['Наблюдения за зимовкой','Микроклимат и состояние семей'])})
});
const modes=Object.freeze({field:'Полевой',home:'Домашний',night:'Ночной'});
const groups=Object.freeze([
 {id:'home',label:'Обзор',routes:['home']},
 {id:'hives',label:'Ульи',routes:['hives','entrance','varroa']},
 {id:'ai',label:'ИИ-помощник',routes:['ai']},
 {id:'journal',label:'Журнал',routes:['journal','planning','forage']},
 {id:'settings',label:'Ещё',routes:['settings','incidents','deadout']}
].map(group=>Object.freeze({...group,routes:Object.freeze(group.routes)})));
const labels=Object.freeze({home:'Главная',hives:'Ульи',entrance:'Лёток',journal:'Журнал',planning:'План работ',forage:'Медоносы',varroa:'Клещ',incidents:'Инциденты',deadout:'Потери',settings:'Настройки',ai:'ИИ-помощник'});
function has(object,key){return typeof key==='string'&&Object.prototype.hasOwnProperty.call(object,key);}
function calendarSeason(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const [year,month,day]=date.split('-').map(Number);
 const parsed=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.getUTCFullYear()!==year||parsed.getUTCMonth()+1!==month||parsed.getUTCDate()!==day)return null;
 return month<=2||month===12?'winter':month<=5?'spring':month<=8?'summer':'autumn';
}
function localDate(date=new Date()){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return null;
 return String(date.getFullYear()).padStart(4,'0')+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
function seasonalContext(date,override='auto'){
 const season=has(seasons,override)?override:calendarSeason(date);
 return Object.freeze({season,label:season?seasons[season].label:'Сезон не определён',topics:season?seasons[season].topics:Object.freeze([]),source:has(seasons,override)?'manual':season?'calendar':'unknown',note:'Ориентир для средней полосы России. Фактическое состояние семей, погода и местные условия имеют приоритет.'});
}
function normalizeMode(mode){return has(modes,mode)?mode:'home';}
function routeGroup(route){return route==='ai'?'ai':groups.find(group=>group.routes.includes(route))?.id||null;}
function mountControls(host,{date=()=>localDate(),mode='home',season='auto',onMode=()=>{},onSeason=()=>{}}={}){
 if(!host||typeof host.replaceChildren!=='function')throw new TypeError('Нужен DOM-контейнер');
 const d=host.ownerDocument;
 let currentMode=normalizeMode(mode),currentSeason=has(seasons,season)?season:'auto';
 function el(tag,text){const node=d.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
 const title=el('h2','Рабочий режим'),modeLabel=el('label','Оформление'),modeSelect=el('select');
 modeSelect.setAttribute('aria-label','Рабочий режим');
 Object.entries(modes).forEach(([value,label])=>{const option=el('option',label);option.value=value;modeSelect.append(option);});
 modeLabel.append(modeSelect);
 const seasonLabel=el('label','Сезон'),seasonSelect=el('select');
 seasonSelect.setAttribute('aria-label','Сезон пасеки');
 [['auto','Автоматически по календарю'],...Object.entries(seasons).map(([key,value])=>[key,value.label])].forEach(([value,label])=>{const option=el('option',label);option.value=value;seasonSelect.append(option);});
 seasonLabel.append(seasonSelect);
 const summary=el('p'),note=el('p'),topicList=el('ul');
 summary.setAttribute('aria-live','polite');note.className='workspace-note';
 function render(){
  const info=seasonalContext(date(),currentSeason);
  modeSelect.value=currentMode;seasonSelect.value=currentSeason;
  summary.textContent=info.label+(info.source==='manual'?' · выбран вручную':info.source==='calendar'?' · календарный ориентир':'');
  topicList.replaceChildren(...info.topics.map(topic=>el('li',topic)));
  note.textContent=info.note;
 }
 modeSelect.addEventListener('change',()=>{currentMode=normalizeMode(modeSelect.value);render();onMode(currentMode);});
 seasonSelect.addEventListener('change',()=>{currentSeason=has(seasons,seasonSelect.value)?seasonSelect.value:'auto';render();onSeason(currentSeason);});
 host.replaceChildren(title,modeLabel,seasonLabel,summary,topicList,note);render();
 return Object.freeze({refresh:render,getMode:()=>currentMode,getSeason:()=>currentSeason});
}
root.PasekaWorkspaceUI=Object.freeze({seasons,modes,groups,labels,calendarSeason,localDate,seasonalContext,normalizeMode,routeGroup,mountControls});
})(typeof window!=='undefined'?window:globalThis);
