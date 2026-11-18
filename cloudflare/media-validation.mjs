const MAX_MEDIA_FRAME_CHARS=470000;
const MAX_MEDIA_TOTAL_CHARS=1800000;
const SUPPORTED_MEDIA_PROFILE_IDS=new Set(['farrar-6x6-v1']);
function isPlainObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function validateMediaInput(media,context){
  if(!isPlainObject(media)||!['image','video'].includes(media.kind)||!Array.isArray(media.frames))
    return {ok:false,error:'Некорректные параметры медиа-задания.'};
  const frames=media.frames;
  if(media.kind==='image'&&frames.length!==1)
    return {ok:false,error:'Для фотографии требуется ровно один кадр.'};
  if(media.kind==='video'&&(frames.length<3||frames.length>5))
    return {ok:false,error:'Для видео требуется от 3 до 5 выбранных кадров.'};
  if(media.kind==='video'&&(!Number.isFinite(media.durationSec)||media.durationSec<20||media.durationSec>90))
    return {ok:false,error:'Длительность видео вне допустимого диапазона 20–90 секунд.'};
  const hive=context?.selectedHive,profile=hive?.constructionProfile;
  if(!isPlainObject(hive)||typeof hive.id!=='string'||!hive.id.trim()||!isPlainObject(profile))
    return {ok:false,status:409,error:'Не передан профиль выбранного улья; анализ остановлен.'};
  if(!SUPPORTED_MEDIA_PROFILE_IDS.has(profile.id)||profile.status!=='ready')
    return {ok:false,status:409,error:'Для этого профиля улья визуальный анализ ещё не настроен. Исходник сохранён локально.'};
  if(!isPlainObject(context?.modelIntegrity)||!['ok','warnings'].includes(context.modelIntegrity.status))
    return {ok:false,status:409,error:'Структура данных пасеки не подтверждена. Исправь ошибки перед визуальным анализом.'};
  let total=0,previousTime=-1;
  for(const frame of frames){
    if(!isPlainObject(frame)||typeof frame.dataUrl!=='string'||frame.dataUrl.length>MAX_MEDIA_FRAME_CHARS)
      return {ok:false,error:'Кадр отсутствует или превышает допустимый размер.'};
    const match=frame.dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
    if(!match||match[1].length%4!==0)
      return {ok:false,error:'Кадр имеет неподдерживаемый формат. Требуется JPEG base64.'};
    const padding=match[1].endsWith('==')?2:match[1].endsWith('=')?1:0;
    const bytes=Math.floor(match[1].length*3/4)-padding;
    if(bytes<=0||bytes>350*1024)return {ok:false,error:'Размер одного кадра превышает лимит.'};
    total+=frame.dataUrl.length;
    if(media.kind==='video'){
      if(!Number.isFinite(frame.timeSec)||frame.timeSec<0||frame.timeSec>media.durationSec||frame.timeSec<=previousTime)
        return {ok:false,error:'Временные отметки кадров видео некорректны.'};
      previousTime=frame.timeSec;
    }
  }
  if(total>MAX_MEDIA_TOTAL_CHARS)return {ok:false,error:'Общий размер кадров превышает безопасный лимит.'};
  return {ok:true,frames};
}

export function isMediaAIEnabled(env){return env?.MEDIA_AI_ENABLED==='true';}
