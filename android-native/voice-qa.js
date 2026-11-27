(()=>{
  // Generated QA asset only. It never routes recognition into the AI handler.
  function appendDraft(previous,addition){
    const text=String(addition||'').trim();
    if(!text)return null;
    const before=String(previous||''),next=before?before+(before.endsWith('\n')?'':'\n')+text:text;
    return next.length<=12000?next:null;
  }
  window.PasekaVoiceQa={appendDraft};
  const get=id=>document.getElementById(id);
  const api=window.Capacitor?.Plugins?.PasekaOfflineSpeech;
  const panel=get('qaVoicePanel');
  if(!panel||!api)return;
  panel.hidden=false;
  const note=get('qaVoiceText'),status=get('qaVoiceStatus'),start=get('qaVoiceStart'),stop=get('qaVoiceStop'),install=get('qaVoiceInstall');
  let active='',starting=false,stopping=false,stopFailed=false,installed=false,installing=false,listenersReady=false;
  function paint(message){
    if(message)status.textContent=message;
    start.disabled=!installed||!!active||starting||stopping||stopFailed||installing||!listenersReady;
    stop.disabled=stopping||(!active&&!starting&&!stopFailed);
    install.disabled=installed||installing||!!active||starting||stopping||stopFailed;
    get('qaVoiceToDraft').disabled=!!active||starting||stopping||stopFailed;
  }
  async function end(message){
    if(stopping)return;
    active='';starting=false;stopping=true;paint('Останавливаю микрофон…');
    try{await api.stop();stopFailed=false;paint(message||'Сеанс остановлен. Проверь распознанный текст.');}
    catch(e){stopFailed=true;paint('Остановка не подтверждена. Повтори «Стоп» или закрой QA приложение.');}
    finally{stopping=false;paint();}
  }
  async function refresh(){
    try{const s=await api.getStatus();installed=s.modelInstalled===true;paint(installed?'Модель готова. Для теста отключи интернет.':'Модель включена в QA APK. Установи её без интернета.');}
    catch(e){paint('Не удалось проверить модель.');}
  }
  Promise.all([
    api.addListener('result',event=>{
      if(!active||event.token!==active)return;
      const next=appendDraft(note.value,event.text);
      if(next===null){void end('Предел текста или пустой результат; сеанс остановлен.');return;}
      note.value=next;
    }),
    api.addListener('error',event=>{if(active&&event.token===active)void end(event.message||'Ошибка распознавания.');})
  ]).then(()=>{listenersReady=true;paint();return refresh();}).catch(()=>paint('Не удалось подключить локальный микрофон.'));
  install.onclick=async()=>{
    if(installing||active||starting||stopping||stopFailed||installed)return;
    installing=true;paint('Установка модели из APK. Сеть не используется.');
    try{await api.installModel();await refresh();}
    catch(e){paint('Ошибка установки: '+String(e.message||e));}
    finally{installing=false;paint();}
  };
  start.onclick=async()=>{
    if(!installed||active||starting||stopping||stopFailed||installing||!listenersReady)return;
    const token='qa-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    active=token;starting=true;paint('Запускаю локальный микрофон…');
    try{
      const answer=await api.start({token});
      if(active!==token)return;
      if(answer.started!==true||answer.token!==token)throw Error('Неверный ответ запуска');
      starting=false;paint('Слушаю локально. Нажми «Стоп» перед записью в журнал.');
    }catch(e){if(active===token)await end('Микрофон не запущен: '+String(e.message||e));}
  };
  stop.onclick=()=>void end();
  get('qaVoiceToDraft').onclick=()=>{
    if(active||starting||stopping||stopFailed){paint('Сначала дождись подтверждения остановки микрофона.');return;}
    const field=get('aiJournalDraftInput'),next=field?appendDraft(field.value,note.value):null;
    if(next===null){paint('Нет текста или превышен лимит заметки.');return;}
    field.value=next;note.value='';field.focus();paint('Текст добавлен в черновик. Выбери улей и открой запись; ничего не сохранено.');
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(active||starting))void end('Сеанс остановлен при уходе с экрана.');});
  window.addEventListener('pagehide',()=>{if(active||starting)void end();});
  paint();
})();
