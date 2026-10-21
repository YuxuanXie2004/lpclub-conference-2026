'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const crop=()=>require('../assets/image-crop');
test('crop rectangles keep the published aspect and remain inside the image at every edge and zoom',()=>{
 const {cropRect}=crop();
 for(const kind of ['portrait','logo'])for(const [width,height]of [[1200,800],[400,1400],[800,400]])for(const x of [0,.5,1])for(const y of [0,1])for(const zoom of [1,2,8]){
  const r=cropRect(width,height,kind,{x,y,zoom});
  assert(Math.abs(r.width/r.height-(kind==='portrait'?5/6:5/3))<1e-9);
  assert(r.left>=-1e-8&&r.top>=-1e-8&&r.left+r.width<=width+1e-8&&r.top+r.height<=height+1e-8);
 }
});
test('moving, zooming and corner resizing preserve the frame and clamp to the original image',()=>{
 const {cropRect,moveCrop,zoomCrop,resizeCrop}=crop();
 const initial={x:.5,y:.5,zoom:2},before=cropRect(1000,700,'logo',initial);
 const moved=cropRect(1000,700,'logo',moveCrop(1000,700,'logo',initial,10000,-10000));
 assert.equal(moved.width,before.width);assert.equal(moved.left+moved.width,1000);assert.equal(moved.top,0);
 const zoomed=cropRect(1000,700,'logo',zoomCrop(1000,700,'logo',initial,4));
 assert(Math.abs(zoomed.left+zoomed.width/2-(before.left+before.width/2))<1e-8);
 const resized=cropRect(1000,700,'logo',resizeCrop(1000,700,'logo',initial,'se',before.left+before.width*.8,before.top+before.height*.8));
 assert(Math.abs(resized.left-before.left)<1e-8);assert(Math.abs(resized.top-before.top)<1e-8);assert(resized.width<before.width);
});
test('crop validation accepts legacy focal points and rejects malformed values and excessive zoom',()=>{
 const {validateCrop}=crop();
 assert.deepEqual(validateCrop({x:.2,y:.8}),{x:.2,y:.8});
 assert.deepEqual(validateCrop({x:.2,y:.8,zoom:3}),{x:.2,y:.8,zoom:3});
 for(const value of [null,[],{x:NaN,y:.5},{x:1.1,y:.5},{x:.5,y:.5,zoom:0},{x:.5,y:.5,zoom:9},{x:.5,y:.5,zoom:'2'}])assert.throws(()=>validateCrop(value));
});
test('portrait and logo derivatives use the selected zoomed region instead of the full source',async()=>{
 const {derivative}=require('../server/materials-images');
 const source=await sharp({create:{width:420,height:180,channels:3,background:'#ff0000'}}).composite([{input:await sharp({create:{width:210,height:180,channels:3,background:'#0000ff'}}).png().toBuffer(),left:210,top:0}]).png().toBuffer();
 for(const kind of ['portrait','logo']){
  const result=await derivative(source,kind,{x:1,y:.5,zoom:3});const {data,info}=await sharp(result.buffer).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,kind==='portrait'?500:840);assert.equal(info.height,kind==='portrait'?600:504);
  for(let p=0;p<data.length;p+=info.channels)assert(data[p+2]>data[p]+100,'The selected right-hand blue region fills the result');
 }
});
