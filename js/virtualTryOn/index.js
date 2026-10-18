import { LandmarkSmoother } from './filters.js';
import { drawTop,drawBottom,prepareTexture } from './fit.js';
import { loadVision } from './vision.js';

let current=null;
export function closeVirtualTryOn(){current?.close();}

export function openVirtualTryOn(items,{owner,isActive=()=>true,visionLoader=loadVision}={}) {
  closeVirtualTryOn();
  const dialog=document.createElement('dialog');dialog.className='virtual-tryon';
  dialog.innerHTML=`<div class="tryon-header"><h3>가상으로 입어보기</h3><button type="button" data-close aria-label="가상 입어보기 닫기">닫기 ✕</button></div>
    <p data-names></p><p>카메라 영상은 브라우저에서 처리하며 서버에 저장하거나 전송하지 않아요. 처음에는 인식 모델을 내려받기 위해 인터넷이 필요해요.</p>
    <div class="tryon-stage"><video playsinline muted hidden></video><canvas width="960" height="720" aria-label="가상 입어보기 영상"></canvas><p data-hint>카메라 켜기를 누르고 정면으로 서 주세요.</p></div>
    <p data-status role="status">옷 사진을 준비하고 있어요.</p><p class="tryon-note">옷의 어깨와 소매가 잘리지 않도록 사진 전체를 원래 비율로 보여줘요. 팔을 움직여도 옷 모양은 바뀌지 않아요.</p>
    <div class="tryon-actions"><button type="button" data-start disabled>카메라 켜기</button><button type="button" data-stop disabled>카메라 끄기</button><button type="button" data-capture disabled>사진 저장</button></div>
    <div class="tryon-controls"><label>조절할 옷<select data-layer></select></label><label>옷 크기<input data-adjust="fit" type="range" min="0.45" max="1.6" step="0.01" value="1"></label><label>좌우 위치<input data-adjust="x" type="range" min="-0.2" max="0.2" step="0.005" value="0"></label><label>위아래 위치<input data-adjust="y" type="range" min="-0.2" max="0.2" step="0.005" value="0"></label></div>
    <p class="tryon-note">사진을 몸에 겹쳐 보는 참고 화면이에요. 실제 사이즈와 착용감을 보장하지 않아요. 상의는 양쪽 어깨, 하의는 골반이 보이게 서 주세요.</p>`;
  document.body.append(dialog);dialog.showModal();
  const find=selector=>dialog.querySelector(selector),video=find('video'),canvas=find('canvas'),ctx=canvas.getContext('2d');
  const start=find('[data-start]'),stop=find('[data-stop]'),capture=find('[data-capture]'),status=find('[data-status]'),hint=find('[data-hint]'),layerSelect=find('[data-layer]');
  const abort=new AbortController(),smoother=new LandmarkSmoother();
  let closed=false,ready=false,running=false,starting=false,stream,vision,frame=0,lastTime=-1,textures=[],records=[],selection=0,settings=[],cameraVersion=0;
  const valid=()=>!closed&&isActive()&&(!owner||owner.isConnected&&!owner.closest('[hidden]'));
  const setStatus=text=>{if(!closed)status.textContent=text;};
  function stopCamera(message='카메라를 껐어요. 다시 켤 수 있어요.') {
    cameraVersion++;
    running=false;cancelAnimationFrame(frame);stream?.getTracks().forEach(track=>track.stop());stream=null;video.pause();video.srcObject=null;
    start.disabled=starting||!ready;stop.disabled=true;capture.disabled=true;smoother.reset();lastTime=-1;
    ctx.clearRect(0,0,canvas.width,canvas.height);hint.textContent='카메라가 꺼져 있어요.';setStatus(message);
  }
  function close(){if(closed)return;closed=true;abort.abort();stopCamera();vision?.pose.close();vision?.segmenter?.close();observer?.disconnect();document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',close);dialog.remove();if(current===controller)current=null;}
  const controller={close,dialog};current=controller;
  // Watch the document so removing/hiding an owning card or closing its detail
  // dialog is observed even when the virtual camera dialog is a sibling.
  const observer=owner?new MutationObserver(changes=>{
    if(changes.every(change=>dialog.contains(change.target)))return;
    if(!valid())close();
  }):null;
  if(owner)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-module','hidden','open']});
  const onVisibility=()=>{if(document.hidden)stopCamera('화면을 벗어나 카메라를 껐어요. 돌아오면 다시 켜 주세요.');};
  document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',close);
  find('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',close);dialog.addEventListener('cancel',()=>dialog.close());
  stop.onclick=()=>stopCamera();
  layerSelect.onchange=()=>{selection=Number(layerSelect.value);dialog.querySelectorAll('[data-adjust]').forEach(input=>{input.value=settings[selection][input.dataset.adjust];});};
  dialog.querySelectorAll('[data-adjust]').forEach(input=>input.oninput=()=>{if(settings[selection])settings[selection][input.dataset.adjust]=Number(input.value);});
  const layer=document.createElement('canvas'),lctx=layer.getContext('2d');
  function renderFrame() {
    if(!valid()){close();return;}if(!running)return;
    try {
      if(video.readyState>=2&&video.currentTime!==lastTime){
        lastTime=video.currentTime;const now=performance.now();
        ctx.save();ctx.translate(canvas.width,0);ctx.scale(-1,1);ctx.drawImage(video,0,0,canvas.width,canvas.height);ctx.restore();
        const result=vision.pose.detectForVideo(video,now),raw=result?.landmarks?.[0];
        if(raw){
          const landmarks=smoother.apply(raw,now/1000);let shown=0,contained=false;
          for(let i=0;i<textures.length;i++){
            const texture=textures[i],s=settings[i];
            const drawn=(texture.category==='top'?drawTop:drawBottom)(lctx,texture,landmarks,canvas.width,canvas.height,s);
            if(drawn?.fittedToFrame||drawn?.shiftedToFrame)contained=true;
            shown+=drawn?1:0;
          }
          ctx.drawImage(layer,0,0);lctx.clearRect(0,0,layer.width,layer.height);
          hint.textContent=shown!==textures.length?'상의는 양쪽 어깨, 하의는 골반이 화면 안에 보이게 서 주세요.':contained?'옷 전체가 보이도록 크기와 위치를 맞췄어요. 크기를 줄이거나 조금 뒤로 서서 조절해 보세요.':'옷 전체의 크기와 위치를 조절해 보세요.';
        }else{lctx.clearRect(0,0,layer.width,layer.height);smoother.reset();hint.textContent='사람을 찾고 있어요. 정면에서 조금 뒤로 서 주세요.';}
      }
      frame=requestAnimationFrame(renderFrame);
    }catch{stopCamera('인식 중 문제가 생겼어요. 카메라를 다시 켜 주세요.');}
  }
  start.onclick=async()=>{
    if(starting||running||!ready)return;
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){setStatus('카메라는 localhost 또는 HTTPS 주소에서 사용할 수 있어요.');return;}
    starting=true;start.disabled=true;
    const version=++cameraVersion;
    try{
      setStatus('관절 인식 모델을 준비하고 있어요. 처음에는 시간이 걸릴 수 있어요.');
      if(!vision){const loaded=await visionLoader();if(!valid()){loaded.pose.close();loaded.segmenter?.close();return;}vision=loaded;}
      if(!valid()||document.hidden||version!==cameraVersion)return;
      setStatus('카메라 사용을 허용해 주세요.');
      const acquired=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:960},height:{ideal:720},facingMode:'user'},audio:false});
      if(!valid()||document.hidden||version!==cameraVersion){acquired.getTracks().forEach(track=>track.stop());return;}
      stream=acquired;video.srcObject=stream;await video.play();
      if(!valid()||document.hidden||version!==cameraVersion){stopCamera();return;}
      canvas.width=layer.width=video.videoWidth;canvas.height=layer.height=video.videoHeight;
      running=true;stop.disabled=false;capture.disabled=false;setStatus('옷 전체의 모양을 유지해서 입어보고 있어요.');
      stream.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{if(running)stopCamera('카메라 연결이 종료됐어요. 다시 켜 주세요.');},{once:true}));
      frame=requestAnimationFrame(renderFrame);
    }catch(error){stopCamera(({NotAllowedError:'카메라 권한을 허용한 뒤 다시 시도해 주세요.',NotFoundError:'카메라를 찾지 못했어요.',NotReadableError:'다른 프로그램이 카메라를 사용 중인지 확인해 주세요.'})[error.name]||'모델 또는 카메라를 준비하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');}
    finally{starting=false;if(!closed)start.disabled=running||!ready;}
  };
  capture.onclick=()=>{if(!running)return;const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download='FitShare-가상입어보기.png';link.click();};
  async function load(){
    try{
      if(!Array.isArray(items)||!items.length||items.length>2)throw new Error('입어볼 옷을 다시 선택해 주세요.');
      records=await Promise.all(items.map(async item=>{
        const response=await fetch('/api/garments/'+encodeURIComponent(item.id),{cache:'no-store',signal:abort.signal});
        if(!response.ok)throw new Error('선택한 옷이 삭제되었거나 정보를 읽지 못했어요. 추천 목록을 다시 열어 주세요.');
        const record=await response.json();if(!['top','pants'].includes(record.category))throw new Error('상의와 하의만 입어볼 수 있어요.');return record;
      }));
      if(records.length===2&&records[0].category===records[1].category)throw new Error('상의와 하의 한 벌씩 선택해 주세요.');
      records.sort((a,b)=>(a.category==='pants'?0:1)-(b.category==='pants'?0:1));
      textures=await Promise.all(records.map(async record=>{
        const response=await fetch(`/api/garments/${encodeURIComponent(record.id)}/tryon-photo`,{cache:'no-store',signal:abort.signal});
        if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'옷 사진을 준비하지 못했어요.');}
        const url=URL.createObjectURL(await response.blob());
        try{const image=new Image();image.src=url;await image.decode();return prepareTexture(record,image);}finally{URL.revokeObjectURL(url);}
      }));
      if(!valid())return;
      find('[data-names]').textContent=records.map(record=>record.name).join(' + ');
      records.forEach((record,i)=>{const option=document.createElement('option');option.value=i;option.textContent=record.name;layerSelect.append(option);});
      settings=records.map(()=>({fit:1,x:0,y:0}));ready=true;start.disabled=false;setStatus('준비됐어요. 카메라 켜기를 눌러 주세요.');
    }catch(error){if(!closed){setStatus(error.message||'옷 정보를 불러오지 못했어요.');hint.textContent='창을 닫고 옷을 다시 선택해 주세요.';}}
  }
  load();return controller;
}
