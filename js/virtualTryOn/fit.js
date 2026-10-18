// Keep the complete garment photo intact. Arms and legs never reshape the cloth.
const median = values => { const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]; };
const visible = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x>=0 && point.x<=1 && point.y>=0 && point.y<=1 && (point.visibility ?? 1) >= .5;
const point = (p,w,h) => ({x:(1-p.x)*w,y:p.y*h});

function silhouette(image,category) {
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>4096||height>4096)throw new Error('옷 사진의 크기를 확인해 주세요.');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,width,height);
  const pixels=ctx.getImageData(0,0,width,height).data;
  const opaque=(x,y)=>pixels[(y*width+x)*4+3]>8;
  let left=width,right=-1,top=height,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<left||bottom<top)throw new Error('옷 사진이 비어 있어요. 다른 사진을 선택해 주세요.');
  const bounds={x:left,y:top,w:right-left+1,h:bottom-top+1},center=Math.floor((left+right)/2),spans=[];
  const from=category==='top'?.48:.03,to=category==='top'?.82:.16;
  for(let i=0;i<25;i++){
    const y=Math.min(bottom,Math.round(top+bounds.h*(from+(to-from)*i/24)));
    if(!opaque(center,y))continue;
    let a=center,b=center;while(a>left&&opaque(a-1,y))a--;while(b<right&&opaque(b+1,y))b++;
    if(b-a+1>=bounds.w*.2)spans.push({left:a,right:b+1});
  }
  const bodyLeft=spans.length?median(spans.map(s=>s.left)):left+bounds.w*(category==='top'?.24:0);
  const bodyRight=spans.length?median(spans.map(s=>s.right)):right+1-bounds.w*(category==='top'?.24:0);
  return {bounds,referenceWidth:Math.max(1,bodyRight-bodyLeft),anchor:{x:(bodyLeft+bodyRight)/2,y:top+bounds.h*(category==='top'?.09:.025)}};
}

export function prepareTexture(record,image) {
  if(!record||!['top','pants'].includes(record.category))throw new Error('상의와 하의만 입어볼 수 있어요.');
  return {...record,image,geometry:silhouette(image,record.category),mode:'whole-image'};
}

function drawGarment(ctx,texture,landmarks,w,h,settings,indices,widthFactor) {
  if(!Array.isArray(landmarks)||!indices.every(i=>visible(landmarks[i]))||!Number.isFinite(w)||!Number.isFinite(h)||w<20||h<20)return false;
  const joints=indices.map(i=>point(landmarks[i],w,h)).sort((a,b)=>a.x-b.x);
  const [left,right]=joints,width=Math.hypot(right.x-left.x,right.y-left.y);
  if(width<15)return false;
  const fit=Number(settings?.fit??1),offsetX=Number(settings?.x??0),offsetY=Number(settings?.y??0);
  if(!Number.isFinite(fit)||fit<=0||!Number.isFinite(offsetX)||!Number.isFinite(offsetY))return false;
  const {bounds,anchor,referenceWidth}=texture.geometry,angle=Math.atan2(right.y-left.y,right.x-left.x),cos=Math.cos(angle),sin=Math.sin(angle);
  const requestedScale=width*widthFactor*fit/referenceWidth,padding=Math.max(2,Math.min(w,h)*.015);
  const rotatedWidth=Math.abs(cos)*bounds.w+Math.abs(sin)*bounds.h,rotatedHeight=Math.abs(sin)*bounds.w+Math.abs(cos)*bounds.h;
  const scale=Math.min(requestedScale,(w-2*padding)/rotatedWidth,(h-2*padding)/rotatedHeight);
  const corners=[[bounds.x,bounds.y],[bounds.x+bounds.w,bounds.y],[bounds.x+bounds.w,bounds.y+bounds.h],[bounds.x,bounds.y+bounds.h]].map(([x,y])=>{
    const dx=(x-anchor.x)*scale,dy=(y-anchor.y)*scale;return {x:dx*cos-dy*sin,y:dx*sin+dy*cos};
  });
  const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
  const topOffset=texture.category==='top'?width*.06:0;
  const desiredX=(left.x+right.x)/2+sin*topOffset+offsetX*w,desiredY=(left.y+right.y)/2-cos*topOffset+offsetY*h;
  const x=Math.max(padding-minX,Math.min(w-padding-maxX,desiredX)),y=Math.max(padding-minY,Math.min(h-padding-maxY,desiredY));
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.drawImage(texture.image,-anchor.x,-anchor.y);ctx.restore();
  return {mode:'whole-image',scale,angle,bounds:{x:x+minX,y:y+minY,w:maxX-minX,h:maxY-minY},fittedToFrame:scale<requestedScale-.0001,shiftedToFrame:Math.abs(x-desiredX)>.5||Math.abs(y-desiredY)>.5};
}

export function drawTop(ctx,texture,landmarks,w,h,settings) {
  return drawGarment(ctx,texture,landmarks,w,h,settings,[11,12],1.18);
}

export function drawBottom(ctx,texture,landmarks,w,h,settings) {
  return drawGarment(ctx,texture,landmarks,w,h,settings,[23,24],1.4);
}
