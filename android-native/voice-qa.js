(()=>{
  // Generated QA asset only. It never routes recognition into the AI handler.
  function appendDraft(previous,addition){
    const text=String(addition||'').trim();
    if(!text)return null;
    const before=String(previous||''),next=before?before+(before.endsWith('\n')?'':'\n')+text:text;
    return next.length<=12000?next:null;
  }

  const norm=value=>String(value??'').normalize('NFC').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ');
  const numberWords=['','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать','двадцать'];
  function hiveNumber(value){
    const s=norm(value);
    if(/^[1-9]\d{0,5}$/.test(s))return Number(s);
    const n=numberWords.indexOf(s);if(n>0)return n;
    return null;
  }
  function parseCommand(raw){
    const original=String(raw??'').trim();
    // Every command needs its own wake word; punctuation is optional.
    const m=/^пасека(?:[,\s:]+слушай)?[,\s:]+(.+)$/iu.exec(original);
    if(!m)return {kind:'ignore'};
    const command=m[1].trim(),key=norm(command).replace(/[.!?]+$/,'').trim();
    if(key==='стоп'||key==='заверши сеанс')return {kind:'stop'};
    if(key==='отмена'||key==='отмени черновик')return {kind:'cancel'};
    if(key==='повтори'||key==='повтори черновик')return {kind:'repeat'};
    if(key==='подтверждаю черновик')return {kind:'confirm'};
    let match=/^(?:выбери|открой) улей(?: номер)? (.+)$/.exec(key);
    if(match)return {kind:'hive',number:hiveNumber(match[1])};
    match=/^выбери семью (.+)$/.exec(key);
    if(match)return {kind:'family',name:match[1]};
    if(key==='без семьи')return {kind:'noFamily'};
    match=/^запиши (осмотр|заметку|подкормку|обработку)[\s,:]+(.+)$/iu.exec(command);
    if(match){const types={'осмотр':'Осмотр','заметку':'Заметка','подкормку':'Подкормка','обработку':'Обработка'};
      return {kind:'draft',type:types[norm(match[1])],text:match[2].trim()};}
    return {kind:'unknown'};
  }
  function commandSession(readState,now=()=>Date.now()){
    let hive=null,family=null,explicitNoFamily=false,pending=null;
    const validId=x=>typeof x==='string'&&x.trim()!=='';
    const rows=()=>{const s=readState()||{};return {hives:Array.isArray(s.hives)?s.hives:[],families:Array.isArray(s.families)?s.families:[]}};
    function findHive(id){const matches=rows().hives.filter(h=>h?.id===id);return matches.length===1?matches[0]:null;}
    function findFamily(id){const matches=rows().families.filter(f=>f?.id===id);return matches.length===1?matches[0]:null;}
    function target(){
      if(!hive)return null;
      const h=findHive(hive.id);
      if(!h||Number(h.number)!==hive.number||rows().hives.filter(x=>x&&Number(x.number)===hive.number).length!==1)return null;
      if(family){const f=findFamily(family.id);
        if(!f||f.hive!==hive.id||norm(f.name)!==family.name||rows().families.filter(x=>x?.hive===hive.id&&norm(x.name)===family.name).length!==1)return null;
        return {hiveId:hive.id,hiveNumber:hive.number,familyId:family.id,familyName:String(f.name)};
      }
      return explicitNoFamily?{hiveId:hive.id,hiveNumber:hive.number,familyId:'',familyName:''}:null;
    }
    const label=t=>'Улей '+t.hiveNumber+(t.familyId?', семья '+t.familyName:', без семьи');
    const summary=p=>label(p)+'. '+p.type+'. '+p.text+'. Для открытия формы скажи: Пасека, подтверждаю черновик.';
    const result=(message,extra={})=>({message,...extra});
    function reset(){hive=null;family=null;explicitNoFamily=false;pending=null;}
    function receive(raw){
      const c=parseCommand(raw);
      if(c.kind==='ignore')return null;
      if(c.kind==='stop'){pending=null;return result('Сеанс завершён.',{stop:true});}
      if(c.kind==='cancel'){pending=null;return result('Черновик отменён. Ничего не сохранено.');}
      if(pending&&now()>pending.expires){pending=null;return result('Подтверждение просрочено. Повтори команду записи.');}
      if(c.kind==='repeat')return result(pending?summary(pending):'Ожидающего черновика нет.');
      if(c.kind==='confirm'){
        if(!pending)return result('Нет черновика для подтверждения.');
        const t=target(),p=pending;pending=null;
        if(!t||t.hiveId!==p.hiveId||t.hiveNumber!==p.hiveNumber||t.familyId!==p.familyId||t.familyName!==p.familyName)
          return result('Улей или семья изменились. Повтори выбор и запись.');
        return result('Открываю черновик. Проверь поля и сохрани вручную.',{draft:{...p}});
      }
      if(pending)return result('Сначала подтверди или отмени текущий черновик.');
      if(c.kind==='hive'){
        reset();
        if(!c.number)return result('Не удалось однозначно распознать номер улья.');
        const matches=rows().hives.filter(h=>h&&Number(h.number)===c.number);
        if(matches.length!==1||!validId(matches[0].id)||!findHive(matches[0].id))return result('Улей не найден или номер неоднозначен.');
        hive={id:matches[0].id,number:c.number};
        return result('Выбран улей '+c.number+'. Назови точное имя семьи или скажи: Пасека, без семьи.');
      }
      if(c.kind==='family'||c.kind==='noFamily'){
        family=null;explicitNoFamily=false;
        if(!hive||!findHive(hive.id))return result('Сначала выбери улей.');
        if(c.kind==='noFamily'){explicitNoFamily=true;return result('Улей '+hive.number+'. Запись без семьи, только заметка.');}
        const matches=rows().families.filter(f=>f?.hive===hive.id&&norm(f.name)===c.name);
        if(matches.length!==1||!validId(matches[0].id)||!findFamily(matches[0].id))return result('Семья не найдена или имя неоднозначно. Назови точное уникальное имя.');
        family={id:matches[0].id,name:c.name};return result('Выбрана семья '+matches[0].name+' в улье '+hive.number+'.');
      }
      if(c.kind==='draft'){
        const t=target();
        if(!t)return result('Выбери улей и семью заново. Для общей заметки явно скажи: Пасека, без семьи.');
        if(!t.familyId&&c.type!=='Заметка')return result('Для этой записи выбери конкретную семью.');
        if(!c.text||c.text.length>300)return result('Диктуй содержание записи не длиннее трёхсот символов.');
        pending={...t,type:c.type,text:c.text,expires:now()+60000};
        return result(summary(pending),{pending:{...pending}});
      }
      return result('Команда не распознана. Назови улей, семью или запись.');
    }
    function revalidate(p){
      const t=target();return !!t&&!!p&&now()<=p.expires&&t.hiveId===p.hiveId&&t.hiveNumber===p.hiveNumber&&t.familyId===p.familyId&&t.familyName===p.familyName;
    }
    return {receive,reset,revalidate};
  }

  window.PasekaVoiceQa={appendDraft,parseCommand,commandSession};
  const get=id=>document.getElementById(id);
  const api=window.Capacitor?.Plugins?.PasekaOfflineSpeech;
  const panel=get('qaVoicePanel');
  if(!panel||!api)return;
  panel.hidden=false;
  const note=get('qaVoiceText'),status=get('qaVoiceStatus'),start=get('qaVoiceStart'),stop=get('qaVoiceStop'),install=get('qaVoiceInstall');
  const mode=get('qaVoiceCommandMode');
  const commands=commandSession(()=>typeof S==='undefined'?{}:S);
  let active='',starting=false,stopping=false,stopFailed=false,installed=false,installing=false,listenersReady=false;
  let talking=false,openingDraft=false,dialogue=0;
  const visible=()=>!document.hidden&&(!panel.closest||panel.closest('.panel')?.classList.contains('active')!==false);
  function invalidateDialogue(){dialogue++;commands.reset();}
  function paint(message){
    if(message)status.textContent=message;
    start.disabled=!installed||!!active||starting||stopping||stopFailed||installing||talking||!listenersReady;
    stop.disabled=!talking&&(stopping||(!active&&!starting&&!stopFailed));
    install.disabled=installed||installing||!!active||starting||stopping||stopFailed||talking;
    if(mode)mode.disabled=!!active||starting||stopping||talking||stopFailed;
    get('qaVoiceToDraft').disabled=!!active||starting||stopping||stopFailed||talking||!!mode?.checked;
  }
  async function end(message){
    if(stopping)return false;
    active='';starting=false;stopping=true;paint('Останавливаю микрофон…');
    try{await api.stop();stopFailed=false;paint(message||'Сеанс остановлен. Проверь распознанный текст.');return true;}
    catch(e){stopFailed=true;paint('Остановка не подтверждена. Повтори «Стоп» или закрой QA приложение.');return false;}
    finally{stopping=false;paint();}
  }
  async function refresh(){
    try{const s=await api.getStatus();installed=s.modelInstalled===true;paint(installed?'Модель готова. Для теста отключи интернет.':'Модель включена в QA APK. Установи её без интернета.');}
    catch(e){paint('Не удалось проверить модель.');}
  }
  Promise.all([
    api.addListener('result',event=>{
      if(!active||event.token!==active)return;
      if(mode?.checked){if(!talking)void handleCommand(event.text);return;}
      const next=appendDraft(note.value,event.text);
      if(next===null){void end('Предел текста или пустой результат; сеанс остановлен.');return;}
      note.value=next;
    }),
    api.addListener('error',event=>{if(active&&event.token===active){invalidateDialogue();void end(event.message||'Ошибка распознавания.');}})
  ]).then(()=>{listenersReady=true;paint();return refresh();}).catch(()=>paint('Не удалось подключить локальный микрофон.'));
  install.onclick=async()=>{
    if(installing||active||starting||stopping||stopFailed||installed)return;
    installing=true;paint('Установка модели из APK. Сеть не используется.');
    try{await api.installModel();await refresh();}
    catch(e){paint('Ошибка установки: '+String(e.message||e));}
    finally{installing=false;paint();}
  };
  async function begin(){
    if(!visible()||!installed||active||starting||stopping||stopFailed||installing||talking||!listenersReady)return;
    const token='qa-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    active=token;starting=true;paint('Запускаю локальный микрофон…');
    try{
      const answer=await api.start({token});
      if(active!==token)return;
      if(answer.started!==true||answer.token!==token)throw Error('Неверный ответ запуска');
      starting=false;paint(mode?.checked?'Слушаю локальные команды. Каждую начинай со слова «Пасека».':'Слушаю локально. Нажми «Стоп» перед записью в журнал.');
    }catch(e){if(active===token)await end('Микрофон не запущен: '+String(e.message||e));}
  }
  start.onclick=()=>{invalidateDialogue();return begin();};
  stop.onclick=()=>{invalidateDialogue();if(!stopping)void end();};
  if(mode)mode.onchange=()=>{invalidateDialogue();paint();};
  get('qaVoiceToDraft').onclick=()=>{
    if(active||starting||stopping||stopFailed||talking||mode?.checked){paint('Сначала останови сеанс и выбери диктовку.');return;}
    const field=get('aiJournalDraftInput'),next=field?appendDraft(field.value,note.value):null;
    if(next===null){paint('Нет текста или превышен лимит заметки.');return;}
    field.value=next;note.value='';field.focus();paint('Текст добавлен в черновик. Выбери улей и открой запись; ничего не сохранено.');
  };
  function openDraft(p){
    // Use existing dialog/form, no direct data mutations or automatic save.
    if(!commands.revalidate(p)||typeof startupWriteGate==='undefined'||startupWriteGate.ready!==true||
       get('recordDlg')?.open||!visible()||get('aiJournalDraftInput')?.value?.trim())return false;
    try{
      activeJournalHive=p.hiveId;
      showTab('journal');newRecord();
      if(!get('recordDlg')?.open||get('rhive')?.value!==p.hiveId)return false;
      get('rtype').value=p.type;toggleOccupancy();
      get('rfamily').value=p.familyId;
      if(get('rfamily').value!==p.familyId)return false;
      get('rtext').value=p.text;
      const notice=get('aiJournalExtractNotice');
      if(notice){notice.textContent='Голосовой черновик: проверь семью, дату, тип, текст и фактические показатели. Ничего не сохранено.';notice.style.display='block';}
      return true;
    }catch(e){return false;}
  }
  async function handleCommand(raw){
    const reply=commands.receive(raw);
    if(!reply)return;
    const cycle=dialogue;
    talking=true;paint();
    const stopped=await end('Микрофон остановлен для ответа.');
    if(!stopped||cycle!==dialogue||!visible()){talking=false;paint();return;}
    let message=reply.message,opened=false;
    // Confirm only after the microphone is known stopped, check live IDs again.
    if(reply.draft){
      openingDraft=true;opened=openDraft(reply.draft);
      if(!opened)message='Черновик не открыт. Проверь текущую форму, данные и выбор. Ничего не сохранено.';
    }
    if(reply.pending)note.value=reply.pending.text;
    if(opened)note.value='';
    paint(message);
    try{if(typeof api.speakLocal==='function')await api.speakLocal({text:message});else throw Error('Нет локального голоса');}
    catch(e){paint(message+' Озвучивание недоступно: нужен установленный русский голос Android.');}
    finally{talking=false;openingDraft=false;paint();}
    if(cycle===dialogue&&!reply.stop&&!reply.draft&&visible()&&!stopFailed)await begin();
  }
  function leave(){
    if(active||starting||stopping||talking){invalidateDialogue();if(!stopping)void end('Сеанс остановлен при уходе с экрана.');}
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();});
  window.addEventListener('pagehide',leave);
  if(typeof MutationObserver!=='undefined'&&panel.closest){
    const host=panel.closest('.panel');
    if(host)new MutationObserver(()=>{if(!openingDraft&&!visible()&&(active||starting||stopping||talking))leave();}).observe(host,{attributes:true,attributeFilter:['class']});
  }
  paint();
})();
