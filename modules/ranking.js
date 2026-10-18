// 공개된 나눔 포인트로 친구들과 순위를 비교합니다. 개인 나눔 관리는 내페이지에서 합니다.
import {
  BADGE_ICONS, computeRanking, finalizeMonths, formatMonth, getExchangePoints,
  getMonthKey, getRecentRevealed, isRevealed
} from './rankingLogic.js';
import { avatarHtml, ensureStyle, openMemberProfileDialog, openProfileDialog } from './profile.js?v=profile-3';
import { loadState, loadViewerName, pullState, subscribe } from './rankingStore.js';

let dispose = null;
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function renderRanking(root) {
  dispose?.();
  ensureStyle();
  root.dataset.module='ranking';
  let data=finalizeMonths(loadState()),closed=false,refreshing=false;
  root.innerHTML=`
    <section class="ranking-panel ranking-comparison" data-ranking-view aria-labelledby="ranking-title">
      <div class="ranking-intro">
        <div class="module-emoji" aria-hidden="true">🏆</div>
        <div><h3 id="ranking-title">참여 랭킹 <span id="rk-month" class="rk-month"></span></h3>
        <p>이번 달 나눔에 참여한 친구들과 순위를 비교해요. 서로 점수를 모두 보내 공개된 포인트로 순위를 정해요.</p></div>
      </div>
      <div class="rk-ranking-tools"><p>예약 확인·점수 보내기·후기·아바타는 <b>내페이지</b>에서 관리해요.</p><button type="button" class="rk-ghost" id="rk-open-mypage">내페이지 열기</button></div>
      <div class="rk-overview" aria-label="이번 달 참여 현황"><p>순위 참여자 <strong id="rk-participants">0명</strong></p><p>점수가 공개된 나눔 <strong id="rk-exchanges">0회</strong></p></div>
      <div class="rk-board-heading"><h4>🏅 이번 달 전체 순위</h4><button type="button" class="rk-ghost" id="rk-refresh">새로 불러오기</button></div>
      <p id="rk-message" class="rk-message" role="status" aria-live="polite"></p>
      <p class="rk-board-note">내 순위에는 ‘나’ 표시가 있어요. 이름을 누르면 프로필을 볼 수 있어요.</p>
      <ol id="rk-board" class="rk-board" aria-label="이번 달 참여 순위"></ol>
      <details class="rk-rules"><summary>순위와 포인트는 어떻게 정하나요?</summary><p>직접 옷을 주고받은 뒤 서로 1~10점을 보내요. 두 친구가 모두 보낸 뒤 상대에게 받은 점수가 포인트에 더해져요.</p><p>포인트가 같으면 이번 달 나눔 횟수, 먼저 그 점수에 도달한 순서, 이름순으로 정해요. 순위는 매달 새로 시작하며 지난달 1·2·3위 배지는 프로필에 남아요.</p></details>
      <section class="rk-box rk-community" aria-labelledby="rk-recent-title"><h4 id="rk-recent-title">🎉 최근 공개된 나눔 포인트</h4><p class="rk-board-note">최근 공개 순서로 최대 5건을 보여줘요.</p><ul id="rk-recent" class="rk-recent"></ul></section>
    </section>`;
  const panel=root.querySelector('[data-ranking-view]');
  const $=selector=>panel.querySelector(selector);
  const active=()=>!closed&&root.isConnected&&root.dataset.module==='ranking'&&root.querySelector('[data-ranking-view]')===panel;
  const message=(text,error=false)=>{if(!active())return;$('#rk-message').textContent=text;$('#rk-message').classList.toggle('is-error',error);};
  const events=new AbortController();
  const viewerIdNow=()=>{
    const name=loadViewerName().toLowerCase();
    return data.users.find(user=>user.name.toLowerCase()===name)?.id||'';
  };
  function refresh(){
    if(!active())return;
    const month=getMonthKey(new Date()),viewerId=viewerIdNow();
    const ranking=computeRanking(data,month),users=new Map(data.users.map(user=>[user.id,user]));
    const nameOf=id=>escapeHtml(users.get(id)?.name||'알 수 없는 친구');
    const focused=$('#rk-board').contains(document.activeElement)?document.activeElement.closest('[data-profile]')?.dataset.profile:null;
    $('#rk-month').textContent=formatMonth(month);
    $('#rk-participants').textContent=ranking.length+'명';
    $('#rk-exchanges').textContent=data.exchanges.filter(item=>isRevealed(item)&&getMonthKey(item.revealedAt)===month).length+'회';
    $('#rk-board').innerHTML=ranking.length?ranking.map(row=>{
      const mine=row.userId===viewerId;
      return `<li class="rk-rank rk-rank-${row.rank<=3?row.rank:'n'}${mine?' is-self':''}" data-user-id="${escapeHtml(row.userId)}">
        <span class="rk-place" aria-label="${row.rank}위">${BADGE_ICONS[row.rank]||row.rank}</span>
        <button type="button" class="rk-name" data-profile="${escapeHtml(row.userId)}">${avatarHtml(users.get(row.userId)?.avatar,32)}<span class="rk-display-name">${escapeHtml(row.name)}</span>${mine?'<span class="rk-self">나</span>':''}</button>
        <span class="rk-pts">${row.points}<small>점</small></span><span class="rk-sub">이번 달 기부 ${row.donations}번 · 수령 ${row.receipts}번</span></li>`;
    }).join(''):'<li class="rk-empty">이번 달 공개된 나눔 점수가 아직 없어요.<br>옷을 주고받고 서로 점수를 보내면 참여한 친구들의 순위가 여기에 나타나요.</li>';
    if(focused)[...$('#rk-board').querySelectorAll('[data-profile]')].find(button=>button.dataset.profile===focused)?.focus({preventScroll:true});
    const recent=getRecentRevealed(data);
    $('#rk-recent').innerHTML=recent.length?recent.map(exchange=>{
      const earned=getExchangePoints(exchange);
      return `<li><b>${nameOf(exchange.giverId)}</b> → <b>${nameOf(exchange.receiverId)}</b> · ${escapeHtml(exchange.itemName)}<span>${nameOf(exchange.giverId)} +${earned.giver}점, ${nameOf(exchange.receiverId)} +${earned.receiver}점</span></li>`;
    }).join(''):'<li class="rk-empty">두 친구가 모두 점수를 보내면 최근 나눔 포인트가 여기에 공개돼요.</li>';
  }
  async function sync(){
    if(!active()||refreshing)return;
    refreshing=true;$('#rk-refresh').disabled=true;
    try{
      const latest=await pullState();
      if(!active())return;
      if(latest){data=finalizeMonths(latest);refresh();message('최신 순위를 확인했어요. 5초마다 새 기록을 확인해요.');}
      else message('최신 순위를 불러오지 못했어요. 연결을 확인하고 다시 불러와 주세요.',true);
    }finally{refreshing=false;if(active())$('#rk-refresh').disabled=false;}
  }
  const reload=()=>{if(active()){data=finalizeMonths(loadState());refresh();}};
  $('#rk-open-mypage').addEventListener('click',()=>openProfileDialog(reload),{signal:events.signal});
  $('#rk-refresh').addEventListener('click',sync,{signal:events.signal});
  $('#rk-board').addEventListener('click',event=>{
    const button=event.target.closest('[data-profile]');if(!button)return;
    if(button.dataset.profile===viewerIdNow())openProfileDialog(reload);
    else openMemberProfileDialog(button.dataset.profile);
  },{signal:events.signal});
  const unsubscribe=subscribe(reload);
  const timer=setInterval(()=>{if(active())sync();else cleanup();},5000);
  const observer=new MutationObserver(()=>{if(!active())cleanup();});
  observer.observe(root,{childList:true,attributes:true,attributeFilter:['data-module']});
  function cleanup(){if(closed)return;closed=true;events.abort();unsubscribe();clearInterval(timer);observer.disconnect();window.removeEventListener('pagehide',cleanup);if(dispose===cleanup)dispose=null;}
  window.addEventListener('pagehide',cleanup,{once:true});
  dispose=cleanup;refresh();sync();
  return cleanup;
}
