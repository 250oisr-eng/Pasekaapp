(function(root){
'use strict';
// Geometry-only staging: does not detect or track bees or calibrate the entrance.
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const validPoint=p=>p&&finite(p.x)&&finite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
const no=reason=>({ok:false,reason,direction:'unknown',directionVerified:false,
  recognitionSucceeded:false,cleanupAuthorized:false});
function classifyCrossing(points,calibration){
 if(!calibration||!validPoint(calibration.a)||!validPoint(calibration.b)||
    !['positive','negative'].includes(calibration.insideSide)||
    !finite(calibration.tolerance)||calibration.tolerance<0||calibration.tolerance>0.2)
   return no('calibration_required');
 const ax=calibration.a.x,ay=calibration.a.y,dx=calibration.b.x-ax,dy=calibration.b.y-ay;
 const length=Math.hypot(dx,dy);
 if(length<0.05)return no('calibration_line_too_short');
 if(!Array.isArray(points)||points.length<3||points.length>100||
    points.some(p=>!validPoint(p)||!finite(p.timeSec)||p.timeSec<0))
   return no('track_points_invalid');
 for(let i=1;i<points.length;i++)if(points[i].timeSec<=points[i-1].timeSec)
   return no('track_time_not_monotonic');
 const side=p=>(dx*(p.y-ay)-dy*(p.x-ax))/length;
 const signs=points.map(p=>{
  const v=side(p);return Math.abs(v)<=calibration.tolerance?0:v>0?1:-1;
 });
 if(signs.includes(0))return no('track_too_close_to_boundary');
 const transitions=signs.slice(1).filter((v,i)=>v!==signs[i]).length;
 if(transitions===0)return {ok:true,direction:'unknown',reason:'no_crossing',
    directionVerified:false,recognitionSucceeded:false,cleanupAuthorized:false};
 if(transitions!==1)return no('ambiguous_multiple_crossings');
 const entered=calibration.insideSide==='positive'?signs[signs.length-1]===1:signs[signs.length-1]===-1;
 return {ok:true,direction:entered?'in':'out',reason:null,
    directionVerified:false,reviewRequired:true,recognitionSucceeded:false,
    cleanupAuthorized:false,stage:'untrusted_calibrated_crossing'};
}
root.PasekaVideoCrossingEvidence=Object.freeze({classifyCrossing});
})(typeof window!=='undefined'?window:globalThis);
