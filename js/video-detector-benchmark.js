(function(root){
'use strict';
// Isolated evaluation only: does not contain or invoke an AI detector.
// A score on synthetic fixtures is not evidence of real-world model accuracy.
const classes=new Set(['bee','drone','wasp','hornet','dead_bee','unknown']);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const fail=reason=>({ok:false,reason,modelValidated:false,cleanupAuthorized:false});
function validBox(b){return Array.isArray(b)&&b.length===4&&b.every(v=>finite(v)&&v>=0&&v<=1)&&b[2]>0&&b[3]>0&&b[0]+b[2]<=1&&b[1]+b[3]<=1}
function validLabel(o,detected){return o&&typeof o==='object'&&classes.has(o.className)&&validBox(o.box)&&(!detected||(finite(o.confidence)&&o.confidence>=0&&o.confidence<=1))}
function overlap(a,b){
 const x1=Math.max(a[0],b[0]),y1=Math.max(a[1],b[1]);
 const x2=Math.min(a[0]+a[2],b[0]+b[2]),y2=Math.min(a[1]+a[3],b[1]+b[3]);
 const area=Math.max(0,x2-x1)*Math.max(0,y2-y1);
 return area===0?0:area/(a[2]*a[3]+b[2]*b[3]-area);
}
function evaluateDetector(frames,options={}){
 const iou=options.iou===undefined?0.5:options.iou,confidence=options.confidence===undefined?0.5:options.confidence;
 if(!finite(iou)||iou<=0||iou>1||!finite(confidence)||confidence<0||confidence>1||
   !Array.isArray(frames)||frames.length===0||frames.length>100)return fail('benchmark_input_invalid');
 const ids=new Set(),byClass={};let totalTp=0,totalFp=0,totalFn=0;
 for(const frame of frames){
  if(!frame||typeof frame.id!=='string'||frame.id.length<1||frame.id.length>120||
     ids.has(frame.id)||!Array.isArray(frame.groundTruth)||!Array.isArray(frame.predicted)||
     frame.groundTruth.length>500||frame.predicted.length>500||
     !frame.groundTruth.every(x=>validLabel(x,false))||!frame.predicted.every(x=>validLabel(x,true)))
   return fail('benchmark_frame_invalid');
  ids.add(frame.id);
  const accepted=frame.predicted.filter(x=>x.confidence>=confidence);
  const classNames=new Set([...frame.groundTruth.map(x=>x.className),...accepted.map(x=>x.className)]);
  for(const category of classNames){
   const gt=frame.groundTruth.filter(x=>x.className===category);
   const predictions=accepted.filter(x=>x.className===category);
   // Greedy maximum-IoU one-to-one matching; never double-count a ground-truth object.
   const pairs=[];
   for(let p=0;p<predictions.length;p++)for(let g=0;g<gt.length;g++){
    const score=overlap(predictions[p].box,gt[g].box);
    if(score>=iou)pairs.push({p,g,score});
   }
   pairs.sort((a,b)=>b.score-a.score||a.p-b.p||a.g-b.g);
   const usedPred=new Set(),usedGt=new Set();
   for(const pair of pairs){if(!usedPred.has(pair.p)&&!usedGt.has(pair.g)){usedPred.add(pair.p);usedGt.add(pair.g)}}
   const tp=usedPred.size,fp=predictions.length-tp,fn=gt.length-tp;
   const row=byClass[category]||{tp:0,fp:0,fn:0};
   row.tp+=tp;row.fp+=fp;row.fn+=fn;byClass[category]=row;
   totalTp+=tp;totalFp+=fp;totalFn+=fn;
  }
 }
 const summary=(tp,fp,fn)=>({
  tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null
 });
 const scored={};for(const [key,x]of Object.entries(byClass))scored[key]=summary(x.tp,x.fp,x.fn);
 return {ok:true,stage:'detector_benchmark_only',frames:frames.length,iouThreshold:iou,
  confidenceThreshold:confidence,overall:summary(totalTp,totalFp,totalFn),
  classes:scored,modelValidated:false,trackingValidated:false,
  pollenValidated:false,cleanupAuthorized:false};
}
root.PasekaVideoDetectorBenchmark=Object.freeze({evaluateDetector,overlap});
})(typeof window!=='undefined'?window:globalThis);
