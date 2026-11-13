(function(root){
'use strict';
const VERSION='entrance-analysis-core-v1';
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const median=values=>{const a=values.filter(finite).slice().sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
function assessVideoMetadata(input={}){
 const errors=[],warnings=[];
 const duration=Number(input.durationSec),width=Number(input.width),height=Number(input.height),bytes=Number(input.bytes);
 if(!finite(duration)||duration<20||duration>90)errors.push({code:'duration_out_of_range',message:'Для анализа требуется видео продолжительностью от 20 до 90 секунд; целевая длительность — около 60 секунд.'});
 if(!finite(width)||!finite(height)||width<320||height<240)errors.push({code:'resolution_too_low',message:'Не удалось получить подходящее разрешение видео.'});
 else if(width<640||height<360)warnings.push({code:'resolution_limited',message:'Разрешение низкое: распознавание мелких объектов может быть ненадёжным.'});
 if(!finite(bytes)||bytes<=0||bytes>250*1024*1024)errors.push({code:'file_size_invalid',message:'Файл пустой или превышает допустимый размер 250 МБ.'});
 if(input.mimeType&&!/^video\/(mp4|webm|quicktime|3gpp|x-matroska)/i.test(String(input.mimeType)))errors.push({code:'unsupported_video_type',message:'Формат видео не поддерживается.'});
 return {ok:errors.length===0,errors,warnings,metadata:{durationSec:finite(duration)?duration:null,width:finite(width)?width:null,height:finite(height)?height:null,bytes:finite(bytes)?bytes:null,mimeType:String(input.mimeType||'')},stage:'metadata_only',note:'Проверены только свойства файла. Тряска, резкость, засветка и видимость летка ещё не оценены.'};
}
function assessFrameQuality(samples=[]){
 if(!Array.isArray(samples)||samples.length<3)return {status:'unknown',score:null,flags:['insufficient_samples']};
 const usable=samples.filter(x=>x&&finite(x.brightness)&&finite(x.sharpness)&&finite(x.motion));
 if(usable.length<3)return {status:'unknown',score:null,flags:['invalid_samples']};
 const brightness=median(usable.map(x=>x.brightness)),sharpness=median(usable.map(x=>x.sharpness)),motion=median(usable.map(x=>x.motion)),coverage=median(usable.map(x=>finite(x.entranceCoverage)?x.entranceCoverage:1));
 const flags=[];
 if(brightness<0.08)flags.push('underexposed');
 if(brightness>0.94)flags.push('overexposed');
 if(sharpness<35)flags.push('blurred');
 if(motion>0.22)flags.push('camera_shake');
 if(coverage<0.9)flags.push('entrance_out_of_frame');
 const score=clamp((brightness>=0.08&&brightness<=0.94?0.25:0)+(sharpness>=35?0.25:0)+(motion<=0.22?0.25:0)+(coverage>=0.9?0.25:0),0,1);
 return {status:score>=0.75?'good':score>=0.5?'limited':'poor',score,flags,measured:{brightness,sharpness,motion,entranceCoverage:coverage}};
}
function computeMetrics(tracks=[],durationSec=60,options={}){
 const errors=[];
 if(!Array.isArray(tracks)||!finite(Number(durationSec))||Number(durationSec)<=0)return {ok:false,errors:[{code:'invalid_analysis_input'}]};
 const threshold=finite(options.confidenceThreshold)?clamp(options.confidenceThreshold,0.1,0.99):0.6;
 const unique=new Map();
 for(const track of tracks){
  if(!track||typeof track.id!=='string'||!track.id)continue;
  const old=unique.get(track.id);
  if(!old||Number(track.confidence||0)>Number(old.confidence||0))unique.set(track.id,track);
 }
 const rows=[...unique.values()],accepted=rows.filter(t=>finite(Number(t.confidence))&&Number(t.confidence)>=threshold);
 const incoming=accepted.filter(t=>t.direction==='in'&&t.className==='bee');
 const outgoing=accepted.filter(t=>t.direction==='out'&&t.className==='bee');
 const pollen=incoming.filter(t=>t.pollen===true||finite(t.pollenConfidence)&&t.pollenConfidence>=threshold);
 const pollenNegative=incoming.filter(t=>t.pollen===false||finite(t.pollenConfidence)&&t.pollenConfidence>=threshold&&!t.pollen);
 const wasps=accepted.filter(t=>['wasp','hornet','large_wasp_like'].includes(t.className));
 const drones=accepted.filter(t=>t.className==='drone');
 const dead=accepted.filter(t=>t.className==='dead_bee');
 const fights=Array.isArray(options.events)?options.events.filter(e=>e&&e.type==='fight'&&finite(e.confidence)&&e.confidence>=threshold).length:0;
 const duration=Number(durationSec),coverage=finite(options.trackingCoverage)?clamp(options.trackingCoverage,0,1):null,crowding=finite(options.crowdingScore)?clamp(options.crowdingScore,0,1):null;
 const poorTracking=coverage!==null&&coverage<0.65,tooCrowded=crowding!==null&&crowding>0.35;
 const incomingClassified=pollen.length+pollenNegative.length;
 const countReliable=!poorTracking&&!tooCrowded&&accepted.length>0;
 return {ok:true,version:VERSION,durationSec:duration,counts:{incomingPerMinute:incoming.length*60/duration,outgoingPerMinute:outgoing.length*60/duration,returningBeeTracks:incoming.length,departingBeeTracks:outgoing.length,pollenCarriers:pollen.length,pollenNegative:pollenNegative.length,pollenUnclassified:Math.max(0,incoming.length-incomingClassified),pollenShare:incomingClassified?pollen.length/incomingClassified:null,waspLike:wasps.length,drones:drones.length,deadBees:dead.length,fightEvents:fights},quality:{countReliable,trackingCoverage:coverage,crowdingScore:crowding,acceptedTracks:accepted.length,detectedTracks:rows.length,confidenceThreshold:threshold,flags:[...(poorTracking?['low_tracking_coverage']:[]),...(tooCrowded?['crowded_flow']:[])]},interpretation:{pollenShareBasis:'only_confidently_classified_returning_bees',diagnosticLimit:'video_observations_do_not_confirm_queen_loss_poisoning_or_robbing'}};
}
function summarizeBaseline(history,key){
 const values=(Array.isArray(history)?history:[]).filter(x=>x&&x.quality?.countReliable!==false&&finite(x.metrics?.[key])).map(x=>x.metrics[key]);
 if(values.length<5)return {ready:false,samples:values.length,median:null,mad:null};
 const center=median(values),mad=median(values.map(x=>Math.abs(x-center)));
 return {ready:true,samples:values.length,median:center,mad};
}
function detectAnomalies(current,history=[],context={}){
 const alerts=[];
 if(!current||!current.metrics)return {alerts,baseline:{},suppressed:['missing_current_metrics']};
 if(current.quality?.countReliable===false||current.quality?.status==='poor')return {alerts,baseline:{},suppressed:['video_quality_or_tracking_insufficient']};
 const rules=[
  {key:'incomingPerMinute',id:'activity_drop',label:'Снижение входящего потока',direction:'down',ratio:0.5,summary:'Входящий поток заметно ниже обычного уровня этого улья.'},
  {key:'pollenShare',id:'pollen_share_drop',label:'Снижение доли пыльценосов',direction:'down',ratio:0.5,summary:'Доля пыльценосов снизилась относительно обычного уровня.'},
  {key:'waspLike',id:'wasp_activity_rise',label:'Рост активности осоподобных насекомых',direction:'up',ratio:3,summary:'Появлений осоподобных насекомых стало значительно больше.'},
  {key:'deadBees',id:'dead_bees_rise',label:'Рост числа неподвижных или погибших пчёл',direction:'up',ratio:3,summary:'На видео заметно больше неподвижных или погибших пчёл.'},
  {key:'drones',id:'drone_share_rise',label:'Изменение доли трутней',direction:'up',ratio:3,summary:'Доля распознанных трутней выросла относительно обычного уровня.'}
 ];
 const baselines={};
 for(const rule of rules){
  const baseline=summarizeBaseline(history,rule.key);baselines[rule.key]=baseline;
  const value=current.metrics[rule.key];
  if(!baseline.ready||!finite(value)||baseline.median===null)continue;
  const reference=baseline.median;
  const changed=rule.direction==='down'?reference>0&&value<=reference*rule.ratio:reference===0?value>=3:value>=reference*rule.ratio;
  if(!changed)continue;
  alerts.push({id:rule.id,severity:rule.id==='wasp_activity_rise'?'warning':'attention',title:rule.label,observation:rule.summary,measured:value,baseline:reference,possibleCauses:rule.id==='pollen_share_drop'?['изменение пыльцевой базы','изменение потребности в пыльце','изменение состояния расплода']:rule.id==='activity_drop'?['погодные условия','изменение взятка','ослабление активности семьи','возможная проблема у летка']:rule.id==='wasp_activity_rise'?['рост активности ос или похожих насекомых']:rule.id==='dead_bees_rise'?['естественная гибель','санитарное удаление','возможное воздействие токсичных веществ']:['сезонное изменение соотношения рабочих пчёл и трутней'],recommendedAction:rule.id==='wasp_activity_rise'?'Повторить наблюдение, осмотреть леток и оценить необходимость его сужения.':rule.id==='dead_bees_rise'?'Осмотреть прилётную доску и территорию перед ульем; при подозрении на отравление сохранить образцы.':rule.id==='pollen_share_drop'?'Повторить съёмку в сопоставимых условиях и проверить семью при ближайшем осмотре.':rule.id==='activity_drop'?'Повторить съёмку при сопоставимой погоде и проверить леток и семью.':'Сопоставить с сезоном и повторить наблюдение.',diagnosis:false,requiresHumanCheck:true});
 }
 if(context.weatherComparable===false)alerts.forEach(a=>a.contextWarning='Погодные условия отличаются от базовых наблюдений; сравнение ограничено.');
 if(context.peerMedian&&finite(context.peerMedian.pollenShare)&&finite(current.metrics.pollenShare)&&current.metrics.pollenShare<context.peerMedian.pollenShare*0.45&&!alerts.some(a=>a.id==='pollen_share_drop'))alerts.push({id:'pollen_share_peer_gap',severity:'attention',title:'Пыльценосная активность ниже соседних семей',observation:'Доля пыльценосов заметно ниже медианы сопоставимых семей пасеки.',measured:current.metrics.pollenShare,baseline:context.peerMedian.pollenShare,possibleCauses:['различия в потребности семей','локальные условия','изменение состояния расплода'],recommendedAction:'Повторить наблюдение и проверить семью при ближайшем осмотре.',diagnosis:false,requiresHumanCheck:true});
 return {alerts,baseline:baselines,suppressed:[]};
}
root.PasekaEntranceAnalysis=Object.freeze({VERSION,assessVideoMetadata,assessFrameQuality,computeMetrics,summarizeBaseline,detectAnomalies});
})(typeof window!=='undefined'?window:globalThis);
