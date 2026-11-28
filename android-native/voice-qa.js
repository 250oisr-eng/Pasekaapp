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
        if(!f||f.recordStatus==='historical'||f.hive!==hive.id||norm(f.name)!==family.name||rows().families.filter(x=>x?.hive===hive.id&&norm(x.name)===family.name).length!==1)return null;
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
        const matches=rows().families.filter(f=>f?.recordStatus!=='historical'&&f?.hive===hive.id&&norm(f.name)===c.name);
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


  // Natural diary: bounded local slot extraction, not an unrestricted language model.
  // Keep the original account of events; resolve identities only against current data.
  function naturalSession(readState,now=()=>Date.now()){
    let hive=null,family=null,noFamily=false,parts=[],type='',pending=null,ask='hive',ambiguousType=false,confirmed=false,deferredName='';
    const tokens=s=>norm(s).match(/[а-яa-z0-9]+/gu)||[];
    const ordinals=['','перв','втор','трет','четверт','пят','шест','седьм','восьм','девят','десят','одиннадцат','двенадцат','тринадцат','четырнадцат','пятнадцат','шестнадцат','семнадцат','восемнадцат','девятнадцат','двадцат'];
    function nword(s){
      const n=hiveNumber(s);if(n!==null)return n;
      if(s==='одна'||s==='одну')return 1;
      const i=ordinals.findIndex((stem,i)=>i>0&&new RegExp('^'+stem+'(?:ый|ой|ий|ая|ое|ую|ого|ому|ом|ем|им|ей|ю|ьего|ьем|ью|ьи|ьей|ья|ье)$').test(s));
      return i>0?i:null;
    }
    const sharedNumber=value=>{const n=window.PasekaReconciliationVoice?.parseSpokenNumber?.(value);return n&&/^[1-9]\d{0,5}$/.test(n)?Number(n):null;};
    function numberAt(w,start){
      let best=null;
      for(let end=start+1;end<=Math.min(w.length,start+9);end++){
        const n=sharedNumber(w.slice(start,end).join(' '));
        if(n!==null)best={n,end};
      }
      if(!best&&nword(w[start])!==null)best={n:nword(w[start]),end:start+1};
      return best;
    }
    const anotherNumber=(w,i)=>nword(w[i])!==null||numberAt(w,i)!==null;
    const multi=(w,i)=>anotherNumber(w,i)||(['или','либо','и'].includes(w[i])&&(anotherNumber(w,i+1)||w[i+1]==='с'&&anotherNumber(w,i+2)));
    const numericFamily=f=>/^с-[1-9]\d{0,5}$/u.test(norm(f?.name))?norm(f.name):/^с-[1-9]\d{0,5}$/u.test(norm(f?.code))?norm(f.code):'';
    const familyKey=f=>numericFamily(f)||norm(f?.name);
    const active=f=>f&&f.recordStatus!=='historical';
    const rows=()=>{const s=readState()||{};return {hives:Array.isArray(s.hives)?s.hives:[],families:Array.isArray(s.families)?s.families:[]}};
    const validId=s=>typeof s==='string'&&s.trim()!=='';
    const hiveByNumber=n=>{const h=rows().hives.filter(x=>x&&Number(x.number)===n);
      return h.length===1&&validId(h[0].id)&&rows().hives.filter(x=>x?.id===h[0].id).length===1?h[0]:null;};
    const familyByName=(h,name)=>{
      const numeric=/^с-[1-9]\d{0,5}$/u.test(name);
      const f=rows().families.filter(x=>(numeric||x?.hive===h.id)&&familyKey(x)===name);
      if(f.length!==1||!active(f[0])||f[0].hive!==h.id||!validId(f[0].id)||rows().families.filter(x=>x?.id===f[0].id).length!==1)return null;
      if(numeric){
        const found=window.PasekaLabels?.lookupMarking?.(readState(),'family',name.slice(2));
        if(found?.status!=='found'||found.target?.id!==f[0].id||found.target?.hiveId!==h.id)return null;
      }
      return f[0];
    };
    function target(){
      if(!hive)return null;
      const h=hiveByNumber(hive.number);
      if(!h||h.id!==hive.id)return null;
      if(family){const f=familyByName(h,family.name);if(!f||f.id!==family.id)return null;
        return {hiveId:h.id,hiveNumber:hive.number,familyId:f.id,familyName:String(f.name||f.code)};}
      return noFamily?{hiveId:h.id,hiveNumber:hive.number,familyId:'',familyName:''}:null;
    }
    function reset(){hive=null;family=null;noFamily=false;parts=[];type='';pending=null;ask='hive';ambiguousType=false;confirmed=false;deferredName='';}
    const reply=(message,extra={})=>({message,...extra});
    const label=p=>'Улей '+p.hiveNumber+(p.familyId?', семья '+p.familyName:', без семьи');
    const readback=p=>label(p)+'. '+p.type+'. '+p.text+'. Всё верно?';
    function revalidate(p){
      const t=target();return !!t&&!!p&&now()<=p.expires&&t.hiveId===p.hiveId&&t.hiveNumber===p.hiveNumber&&t.familyId===p.familyId&&t.familyName===p.familyName;
    }
    function prompt(){
      if(!hive){ask='hive';return reply('Какой улей? Назови его номер.');}
      if(!hiveByNumber(hive.number)||hiveByNumber(hive.number).id!==hive.id){reset();return reply('Улей изменился. Начни запись заново.');}
      if(!family&&!noFamily){
        ask='family';const h=rows().families.filter(x=>active(x)&&x.hive===hive.id&&typeof x.name==='string');
        const names=[...new Set(h.map(x=>x.name))].slice(0,5).join(', ');
        return reply('Улей '+hive.number+'. Какая семья?'+(names?' '+names+'.':'')+' Можно сказать «без семьи» для общей заметки.');
      }
      if(ambiguousType){ask='type';return reply('Это осмотр, подкормка, обработка или заметка?');}
      if(!parts.length){ask='text';return reply((family?'Выбрана семья '+(target()?.familyName||''):'Улей '+hive.number)+'. Что записать? Расскажи своими словами.');}
      const t=target();if(!t){reset();return reply('Улей или семья изменились. Начни запись заново.');}
      const kind=type||'Заметка';
      if(!t.familyId&&kind!=='Заметка'){ask='family';noFamily=false;return prompt();}
      pending={...t,type:kind,text:parts.join('\n'),expires:now()+120000};ask='confirm';
      return reply(readback(pending),{pending:{...pending}});
    }
    function receive(raw){
      const original=String(raw??'').trim();
      if(!original)return null;
      if(confirmed)return reply('Черновик уже подтверждён. Начни новый сеанс.');
      const clean=original.replace(/^пасека(?:[,\s:]+слушай)?[,\s:]+/iu,'').trim(),key=norm(clean).replace(/[.!?]+$/,'').trim();
      if(/^(?:стоп|закончили|закончили на сегодня|заверши сеанс|хватит слушать|выключи микрофон)$/.test(key)){reset();return reply('Сеанс завершён.',{stop:true});}
      if(/^(?:отмена|отмени(?: черновик| запись)?|не надо|начнем заново|начать заново|нет отмена)$/.test(key)){reset();return reply('Черновик отменён. Расскажи о следующей записи.');}
      if(pending&&now()>pending.expires){reset();return reply('Время подтверждения истекло. Расскажи запись заново.');}
      if(/^(?:повтори(?: черновик| запись)?|что записал|прочитай еще раз)$/.test(key))return pending?reply(readback(pending)):prompt();
      if(/^(?:да|верно|правильно|все верно|все правильно|подтверждаю(?: черновик| запись)?|открой(?: черновик| запись)?|да открывай|да все верно)$/.test(key)){
        if(!pending)return prompt();
        const p=pending;pending=null;
        if(!revalidate(p)){reset();return reply('Улей или семья изменились. Начни запись заново.');}
        confirmed=true;return reply('Открываю черновик. Проверь и сохрани вручную.',{draft:{...p}});
      }
      if(/^(?:нет|неверно|неправильно|не так|не подтверждаю)$/.test(key)){reset();return reply('Хорошо, ничего не сохранено. Расскажи исправленный вариант.');}
      if(/^(?:где(?: находится)?|найди|покажи местоположение)\s/u.test(key)){
        pending=null;
        const query=window.PasekaReconciliationVoice?.parseMarkingLookup?.(clean);
        const found=query&&window.PasekaLabels?.lookupMarking?.(readState(),query.kind,query.code);
        return reply((found?.message||'Назови один вид объекта и точный номер для поиска.')+(parts.length?' Черновик не подтверждён. Скажи «повтори», чтобы проверить запись заново.':''));
      }
      // Any non-confirmation turn invalidates the previously read-back proposal.
      pending=null;
      if(clean.length>500){reset();return reply('Фраза слишком длинная. Расскажи запись короткими частями.');}
      const w=tokens(clean),used=new Set();
      const mark=(...indices)=>indices.forEach(i=>{if(i>=0&&i<w.length)used.add(i);});
      const hiveWord=/^(?:улей|улье|улья|улью|ульем|ульи|ульев|ульях)$/;
      const familyWord=/^(?:семья|семью|семьи|семье|семьей)$/;
      const none=/^(?:без семьи|весь улей|для всего улья|общая заметка)$/.test(key);
      let numbers=[],hiveMention=false,numberAmbiguous=false;
      if(!none&&w.some((v,i)=>v==='не'&&(hiveWord.test(w[i+1])||familyWord.test(w[i+1])||nword(w[i+1])!==null))){reset();return reply('Есть отрицание или исправление адресата. Назови один улей и одну семью заново.');}
      for(let i=0;i<w.length;i++)if(!none&&hiveWord.test(w[i])){
        hiveMention=true;mark(i);
        let after=i+1;if(w[after]==='номер'){mark(after);after++;}
        const span=numberAt(w,after),n=span?.n??null,before=nword(w[i-1]);
        const beforeOrdinal=before!==null&&hiveNumber(w[i-1])===null;
        const quantityAfter=/^(?:рамок|рамки|рамка|рамку|килограмм|килограмма|грамм|грамма|литр|литра|литров|корпуса|корпусов)$/.test(w[span?.end??after+1]||'');
        if(/^(?:ульи|ульев|ульях)$/.test(w[i])||before!==null&&!beforeOrdinal)numberAmbiguous=true;
        if(beforeOrdinal&&n!==null&&!quantityAfter)numberAmbiguous=true;
        if(n!==null&&!(beforeOrdinal&&quantityAfter)){numbers.push(n);for(let k=after;k<span.end;k++)mark(k);
          if(multi(w,span.end))numberAmbiguous=true;
        }
        else if(beforeOrdinal){numbers.push(before);mark(i-1);if(nword(w[i-2])!==null||(['или','либо','и'].includes(w[i-2])&&nword(w[i-3])!==null))numberAmbiguous=true;}
      }
      if(ask==='hive'&&!hiveMention){const start=['номер','это'].includes(w[0])?1:0,span=numberAt(w,start);if(span&&span.end===w.length){numbers.push(span.n);w.forEach((v,i)=>mark(i));}}
      const uniqueNumbers=[...new Set(numbers)];
      let hCandidate=null;
      if(hiveMention||numbers.length){
        if(numberAmbiguous||uniqueNumbers.length!==1||!(hCandidate=hiveByNumber(uniqueNumbers[0]))){
          reset();return reply('Номер улья неоднозначен или не найден. Назови один номер и повтори наблюдение.');
        }
        if(hive&&(hive.id!==hCandidate.id||hive.number!==uniqueNumbers[0])){reset();return reply('Это другой улей. Старый черновик отменён. Расскажи запись для нового улья заново.');}
        hive={id:hCandidate.id,number:uniqueNumbers[0]};
      }
      const candidates=rows().families.filter(f=>active(f)&&(!hive||f.hive===hive.id)&&familyKey(f));
      const familyMarks=none?[]:w.map((v,i)=>familyWord.test(v)?i:-1).filter(i=>i>=0);
      const matches=[];
      for(const i of familyMarks){
        mark(i);
        let start=i+1;if(w[start]==='номер'){mark(start);start++;}
        const prefixed=w[start]==='с';if(prefixed){mark(start);start++;}
        const span=numberAt(w,start);
        const legacy=candidates.filter(f=>!numericFamily(f)&&tokens(f.name).length&&tokens(f.name).every((x,k)=>w[i+1+k]===x));
        if(span){
          const key='с-'+span.n,found=candidates.filter(f=>familyKey(f)===key);
          if(prefixed||found.length||!legacy.length){
            if(multi(w,span.end)||['или','либо'].includes(w[span.end])||legacy.length||found.length!==1){reset();return reply('Семья с таким номером не найдена однозначно. Назови один номер и повтори наблюдение.');}
            matches.push(found[0]);for(let k=start;k<span.end;k++)mark(k);
            continue;
          }
        }
        const found=candidates.map(f=>({f,t:tokens(f.name)})).filter(({t})=>t.length&&t.every((v,k)=>w[i+1+k]===v)).sort((a,b)=>b.t.length-a.t.length);
        if(found.length){const max=found[0].t.length;for(const m of found.filter(x=>x.t.length===max)){matches.push(m.f);for(let k=1;k<=max;k++)mark(i+k);}
          if(['или','либо','и'].includes(w[i+max+1])){const j=i+max+2;if(candidates.some(f=>tokens(f.name).every((v,k)=>w[j+k]===v))){reset();return reply('Назови одну семью, не несколько, и повтори наблюдение.');}}
        }
        else {reset();return reply('Не нашёл семью по этому имени. Назови её точное имя и повтори наблюдение.');}
      }
      if(ask==='family'&&hive&&!familyMarks.length&&!none){
        const short=key.replace(/^(?:номер\s+|с[-\s]+)/u,''),number=sharedNumber(short),wanted=number===null?key:'с-'+number;
        const exact=candidates.filter(f=>familyKey(f)===wanted||!numericFamily(f)&&norm(f.name)===key);
        if(exact.length){matches.push(...exact);w.forEach((v,i)=>mark(i));}
      }
      if(none){if(family||deferredName){reset();return reply('Старый черновик отменён. Начни общую заметку заново.');}noFamily=true;w.forEach((v,i)=>mark(i));}
      if(matches.length){
        const names=[...new Set(matches.map(f=>familyKey(f)))];
        if(names.length!==1||deferredName&&deferredName!==names[0]){reset();return reply('Имя семьи неоднозначно. Начни запись заново.');}
        deferredName=names[0];noFamily=false;
      }
      if(hive&&deferredName){
        const h=hiveByNumber(hive.number),f=h?familyByName(h,deferredName):null;
        if(!f){reset();return reply('В выбранном улье не нашёл единственную семью с таким именем. Уточни адрес и повтори наблюдение.');}
        if(family&&family.id!==f.id){reset();return reply('Это другая семья. Старый черновик отменён. Расскажи запись заново.');}
        family={id:f.id,name:deferredName};
      }
      const kinds=new Set();
      for(let i=0;i<w.length;i++){
        const v=w[i];if(used.has(i))continue;
        if(/^(?:осмотр|осмотрел|осмотрела|осматривал|проверил|проверила)$/.test(v)){kinds.add('Осмотр');mark(i);}
        if(/^(?:подкормка|подкормку|подкормил|подкормила|покормил|покормила)$/.test(v)){kinds.add('Подкормка');mark(i);}
        if(/^(?:обработка|обработку|обработал|обработала)$/.test(v)){kinds.add('Обработка');mark(i);}
        if(/^(?:заметка|заметку|наблюдение)$/.test(v)){kinds.add('Заметка');mark(i);}
      }
      if(kinds.size>1||type&&kinds.size===1&&!kinds.has(type)&&ask!=='type')ambiguousType=true;
      else if(kinds.size===1){type=[...kinds][0];ambiguousType=false;}
      const filler=/^(?:в|у|на|для|и|а|номер|выбери|открой|запиши|записать|добавь|запись|сегодня|пожалуйста|значит|так|вот|еще)$/;
      const narrative=w.some((v,i)=>!used.has(i)&&!filler.test(v));
      if(narrative){
        if(parts.join('\n').length+clean.length+1>600){reset();return reply('Черновик слишком длинный. Раздели рассказ на две записи.');}
        parts.push(clean);
      }
      if(!narrative&&!hiveMention&&!numbers.length&&!matches.length&&!none&&!kinds.size)return prompt();
      pending=null;
      return prompt();
    }
    return {receive,reset,revalidate};
  }

  window.PasekaVoiceQa={appendDraft,parseCommand,commandSession,naturalSession};
  const get=id=>document.getElementById(id);
  const api=window.Capacitor?.Plugins?.PasekaOfflineSpeech;
  const panel=get('qaVoicePanel');
  if(!panel||!api)return;
  panel.hidden=false;
  const note=get('qaVoiceText'),status=get('qaVoiceStatus'),start=get('qaVoiceStart'),stop=get('qaVoiceStop'),install=get('qaVoiceInstall');
  const mode=get('qaVoiceCommandMode'),feedback=get('qaVoiceFeedback'),manualDraft=get('aiJournalDraftCard');
  function showFeedback(message){if(feedback)feedback.textContent=message;else paint(message);}
  const naturalMode=!!get('qaVoiceNatural');
  const commands=(naturalMode?naturalSession:commandSession)(()=>typeof S==='undefined'?{}:S);
  let active='',starting=false,stopping=false,stopFailed=false,installed=false,installing=false,listenersReady=false;
  let talking=false,openingDraft=false,dialogue=0,phraseTimer=null,phrases=[];
  function clearPhrase(){if(phraseTimer!==null){clearTimeout(phraseTimer);phraseTimer=null;}phrases=[];}
  const visible=()=>!document.hidden&&(!panel.closest||panel.closest('.panel')?.classList.contains('active')!==false);
  function invalidateDialogue(){dialogue++;clearPhrase();commands.reset();}
  function paint(message){
    if(message)status.textContent=message;
    start.disabled=!installed||!!active||starting||stopping||stopFailed||installing||talking||!listenersReady;
    stop.disabled=!talking&&(stopping||(!active&&!starting&&!stopFailed));
    install.disabled=installed||installing||!!active||starting||stopping||stopFailed||talking;
    if(mode){mode.disabled=!!active||starting||stopping||talking||stopFailed;note.hidden=mode.checked;get('qaVoiceToDraft').hidden=mode.checked;}
    get('qaVoiceToDraft').disabled=!!active||starting||stopping||stopFailed||talking||!!mode?.checked;
  }
  async function end(message){
    if(stopping)return false;
    clearPhrase();active='';starting=false;stopping=true;paint('Останавливаю микрофон…');
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
      if(mode?.checked){
        if(talking)return;
        if(!naturalMode){void handleCommand(event.text);return;}
        const token=active,cycle=dialogue,text=String(event.text||'').trim();
        if(!text)return;
        phrases.push(text);
        // Keep the live buffer bounded even during prolonged ambient speech.
        if(phrases.join(' ').length>500){clearPhrase();invalidateDialogue();void end('Слишком длинная фраза. Начни запись заново.');return;}
        if(phraseTimer!==null)clearTimeout(phraseTimer);
        phraseTimer=setTimeout(()=>{const text=phrases.join(' ');clearPhrase();if(active===token&&dialogue===cycle&&visible()&&!talking)void handleCommand(text);},1300);
        return;
      }
      const next=appendDraft(note.value,event.text);
      if(next===null){void end('Предел текста или пустой результат; сеанс остановлен.');return;}
      note.value=next;
    }),
    api.addListener('error',event=>{if(active&&event.token===active){invalidateDialogue();void end(event.message||'Ошибка распознавания.');}})
  ]).then(()=>{listenersReady=true;paint();return refresh();}).catch(()=>paint('Не удалось подключить локальный микрофон.'));
  install.onclick=async()=>{
    if(installing||active||starting||stopping||stopFailed||talking||installed)return;
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
      starting=false;paint(mode?.checked?(naturalMode?'Слушаю. Расскажи, что произошло, обычными словами.':'Слушаю локальные команды. Каждую начинай со слова «Пасека».'):'Слушаю локально. Нажми «Стоп» перед записью в журнал.');
    }catch(e){if(active===token)await end('Микрофон не запущен: '+String(e.message||e));}
  }
  start.onclick=()=>{if(active||starting||stopping||talking||stopFailed||installing)return;invalidateDialogue();if(mode?.checked)showFeedback(naturalMode?'Расскажи о работе. Уточню только недостающее.':'Назови улей и семью.');return begin();};
  stop.onclick=()=>{invalidateDialogue();showFeedback('Сеанс отменён. Ничего не сохранено автоматически.');if(!stopping)void end();};
  if(mode)mode.onchange=()=>{if(active||starting||stopping||talking||stopFailed)return;invalidateDialogue();showFeedback(mode.checked?(naturalMode?'Говори свободно, без обязательных команд.':'Команды начинай со слова Пасека.'):'Диктовка: текст можно перенести в ручной черновик.');paint();};
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
    const previous=activeJournalHive;
    let complete=false;
    try{
      activeJournalHive=p.hiveId;
      newRecord();
      if(!get('recordDlg')?.open||get('rhive')?.value!==p.hiveId)return false;
      get('rtype').value=p.type;
      if(get('rtype').value!==p.type)return false;
      toggleOccupancy();
      get('rfamily').value=p.familyId;
      if(get('rfamily').value!==p.familyId)return false;
      get('rtext').value=p.text;
      const notice=get('aiJournalExtractNotice');
      if(notice){notice.textContent='Голосовой черновик: проверь семью, дату, тип, текст и фактические показатели. Ничего не сохранено.';notice.style.display='block';}
      showTab('journal');complete=true;
      return true;
    }catch(e){return false;}
    finally{
      if(!complete){activeJournalHive=previous;
        if(get('recordDlg')?.open){try{get('recordDlg').close();}catch(e){}}
        if(get('rhive'))get('rhive').disabled=false;
      }
    }
  }
  async function handleCommand(raw){
    const reply=commands.receive(raw);
    if(!reply)return;
    const cycle=dialogue;
    talking=true;paint();
    const stopped=await end('Микрофон остановлен для ответа.');
    if(!stopped||cycle!==dialogue||!visible()){if(!stopped)invalidateDialogue();talking=false;paint();return;}
    let message=reply.message,opened=false;
    // Confirm only after the microphone is known stopped, check live IDs again.
    if(reply.draft){
      openingDraft=true;opened=openDraft(reply.draft);
      if(!opened)message='Черновик не открыт. Проверь текущую форму, данные и выбор. Ничего не сохранено.';
    }
    // Keep command readback separate from any untransferred raw dictation.
    showFeedback(message);paint(message);
    try{if(typeof api.speakLocal==='function')await api.speakLocal({text:message});else throw Error('Нет локального голоса');}
    catch(e){if(cycle===dialogue)showFeedback(message+' Озвучивание недоступно: нужен установленный русский голос Android.');}
    finally{talking=false;openingDraft=false;paint();}
    if(cycle===dialogue&&!reply.stop&&!reply.draft&&visible()&&!stopFailed)await begin();
  }
  function leave(){
    if(active||starting||stopping||talking){invalidateDialogue();showFeedback('Сеанс остановлен при уходе с экрана. Черновик команды отменён.');if(!stopping)void end('Сеанс остановлен при уходе с экрана.');}
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();});
  window.addEventListener('pagehide',leave);
  if(typeof MutationObserver!=='undefined'&&panel.closest){
    const host=panel.closest('.panel');
    if(host)new MutationObserver(()=>{if(!openingDraft&&!visible()&&(active||starting||stopping||talking))leave();}).observe(host,{attributes:true,attributeFilter:['class']});
  }
  paint();
})();
