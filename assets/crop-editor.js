(function(root,factory){const api=factory(root.LPClubImageCrop);if(typeof module==='object'&&module.exports)module.exports=api;else root.LPClubCropEditor=api;})(typeof window==='object'?window:globalThis,function(geometry){
  'use strict';
  function open({src,kind,crop,onApply,parent,document:doc=document,label=key=>key}){
    const savedFocus=doc.activeElement,dialog=doc.createElement('dialog');
    const e=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let value={x:crop?.x??.5,y:crop?.y??.5,zoom:crop?.zoom??1},start=null,ready=false;
    const l=key=>e(label(key));
    dialog.className='crop-editor';dialog.setAttribute('aria-label',label('调整图片'));
    dialog.innerHTML='<header class="crop-heading"><h2>'+l('调整图片')+'</h2><span>'+l(kind==='portrait'?'头像 · 固定 5:6':'Logo · 固定 2:1')+'</span></header><p>'+l('拖动矩形框调整位置，拖动四角等比例缩放；框内就是官网展示范围。')+'</p><div class="crop-workspace"><div class="crop-stage"><div class="crop-surface"><img alt="'+l('原图')+'" draggable="false"><div class="crop-frame" tabindex="0" role="group" aria-label="'+l('裁剪框，方向键移动，缩放滑块调整大小')+'">'+['nw','ne','sw','se'].map(c=>'<span class="crop-handle crop-'+c+'" data-crop-corner="'+c+'" aria-hidden="true"></span>').join('')+'</div></div></div><aside class="crop-result"><h3>'+l('官网展示预览')+'</h3><canvas></canvas><label class="crop-zoom-label">'+l('缩放')+' <output>1.00×</output><input type="range" min="1" max="8" step="0.01" value="'+value.zoom+'" aria-label="'+l('缩放')+'"></label><button type="button" data-crop-reset>'+l('重置取景')+'</button><p>'+l('应用后进入草稿，保存展示柜后才更新官网。')+'</p></aside></div><p class="crop-error" role="status"></p><footer class="crop-actions"><button type="button" data-crop-cancel>'+l('取消')+'</button><button type="button" class="primary" data-crop-apply disabled>'+l('应用取景')+'</button></footer>';
    (parent||doc.body).append(dialog);
    const find=s=>dialog.querySelector(s),image=find('img'),surface=find('.crop-surface'),stage=find('.crop-stage'),frame=find('.crop-frame'),slider=find('input'),canvas=find('canvas'),apply=find('[data-crop-apply]');
    canvas.width=kind==='portrait'?250:420;canvas.height=kind==='portrait'?300:210;
    function paint(){
      if(!ready)return;
      const w=image.naturalWidth,h=image.naturalHeight,r=geometry.cropRect(w,h,kind,value),size=stage.getBoundingClientRect();
      const scale=Math.min((size.width-32)/w,(size.height-32)/h);
      surface.style.width=w*scale+'px';surface.style.height=h*scale+'px';
      Object.assign(frame.style,{left:r.left/w*100+'%',top:r.top/h*100+'%',width:r.width/w*100+'%',height:r.height/h*100+'%'});
      const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,r.left,r.top,r.width,r.height,0,0,canvas.width,canvas.height);
      slider.value=String(value.zoom);find('output').textContent=value.zoom.toFixed(2)+'×';
    }
    function finish(accept){if(accept&&!ready)return;observer.disconnect();dialog.close();dialog.remove();if(accept)onApply({...value});if(savedFocus?.isConnected)savedFocus.focus();}
    const observer=new ResizeObserver(paint);
    find('[data-crop-cancel]').onclick=()=>finish(false);apply.onclick=()=>finish(true);
    dialog.oncancel=event=>{event.preventDefault();finish(false);};
    find('[data-crop-reset]').onclick=()=>{value={x:.5,y:.5,zoom:1};paint();};
    slider.oninput=()=>{if(ready){value=geometry.zoomCrop(image.naturalWidth,image.naturalHeight,kind,value,Number(slider.value));paint();}};
    frame.onpointerdown=event=>{
      if(!ready||event.button!==0)return;event.preventDefault();
      const bounds=surface.getBoundingClientRect();
      start={crop:{...value},x:event.clientX,y:event.clientY,scale:image.naturalWidth/bounds.width,bounds,corner:event.target.closest('[data-crop-corner]')?.dataset.cropCorner};
      frame.setPointerCapture(event.pointerId);
    };
    frame.onpointermove=event=>{
      if(!start)return;
      value=start.corner?geometry.resizeCrop(image.naturalWidth,image.naturalHeight,kind,start.crop,start.corner,(event.clientX-start.bounds.left)*start.scale,(event.clientY-start.bounds.top)*start.scale):geometry.moveCrop(image.naturalWidth,image.naturalHeight,kind,start.crop,(event.clientX-start.x)*start.scale,(event.clientY-start.y)*start.scale);
      paint();
    };
    frame.onpointerup=frame.onpointercancel=frame.onlostpointercapture=()=>{start=null;};
    frame.onkeydown=event=>{
      const dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},d=dirs[event.key];if(!d||!ready)return;
      event.preventDefault();const step=event.shiftKey ? .05 : .01;value=geometry.moveCrop(image.naturalWidth,image.naturalHeight,kind,value,d[0]*image.naturalWidth*step,d[1]*image.naturalHeight*step);paint();
    };
    image.onload=()=>{ready=true;apply.disabled=false;observer.observe(stage);paint();};
    image.onerror=()=>{find('.crop-error').textContent=label('预览暂不可用');};
    dialog.showModal();image.src=src;find('[data-crop-cancel]').focus();
    return {close:()=>finish(false)};
  }
  return {open};
});
