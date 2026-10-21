(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LPClubImageCrop=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const MAX_ZOOM=8;
  const bound=(v,min,max)=>Math.max(min,Math.min(max,v));
  const ratio=kind=>kind==='portrait'?5/6:5/3;
  function validateCrop(value){
    if(!value||Array.isArray(value)||!['x','y'].every(key=>Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1)||value.zoom!==undefined&&(!Number.isFinite(value.zoom)||value.zoom<1||value.zoom>MAX_ZOOM))throw Object.assign(Error('Invalid crop position or zoom'),{statusCode:400});
    return {x:value.x,y:value.y,...(value.zoom===undefined?{}:{zoom:value.zoom})};
  }
  function cropRect(width,height,kind,value={x:.5,y:.5}){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!['portrait','logo'].includes(kind))throw Error('Invalid crop image');
    const crop=validateCrop(value),base=Math.min(width,height*ratio(kind)),w=base/(crop.zoom||1),h=w/ratio(kind);
    return {left:(width-w)*crop.x,top:(height-h)*crop.y,width:w,height:h};
  }
  function fromRect(width,height,kind,left,top,w){
    const base=Math.min(width,height*ratio(kind)),h=w/ratio(kind);
    return {x:width-w>1e-8?bound(left/(width-w),0,1):.5,y:height-h>1e-8?bound(top/(height-h),0,1):.5,zoom:bound(base/w,1,MAX_ZOOM)};
  }
  function moveCrop(width,height,kind,value,dx,dy){const r=cropRect(width,height,kind,value);return fromRect(width,height,kind,r.left+dx,r.top+dy,r.width);}
  function zoomCrop(width,height,kind,value,zoom){
    const r=cropRect(width,height,kind,value),w=Math.min(width,height*ratio(kind))/bound(zoom,1,MAX_ZOOM),h=w/ratio(kind);
    return fromRect(width,height,kind,r.left+r.width/2-w/2,r.top+r.height/2-h/2,w);
  }
  function resizeCrop(width,height,kind,value,corner,px,py){
    const r=cropRect(width,height,kind,value),aspect=ratio(kind),sx=corner.includes('e')?1:-1,sy=corner.includes('s')?1:-1;
    const ax=sx>0?r.left:r.left+r.width,ay=sy>0?r.top:r.top+r.height,base=Math.min(width,height*aspect);
    const max=Math.min(base,sx>0?width-ax:ax,(sy>0?height-ay:ay)*aspect);
    const w=bound(((px-ax)*sx+(py-ay)*sy/aspect)/(1+1/(aspect*aspect)),base/MAX_ZOOM,max);
    return fromRect(width,height,kind,sx>0?ax:ax-w,sy>0?ay:ay-w/aspect,w);
  }
  return {MAX_ZOOM,ratio,validateCrop,cropRect,moveCrop,zoomCrop,resizeCrop};
});
