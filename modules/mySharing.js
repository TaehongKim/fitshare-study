// 내페이지의 나눔 업무만 표시합니다. 점수·예약 규칙과 저장은 기존 모듈을 그대로 써요.
import {
  MIN_SCORE, MAX_SCORE, REVIEW_MAX, addReview, cancelReservation, confirmReceived,
  getPendingExchanges, getRatingView, getReservations, getReviewable, getReviewsFor, submitRating
} from './rankingLogic.js';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

// 같은 내용의 항목은 DOM을 바꾸지 않아 점수 선택·후기 입력과 커서가 유지돼요.
function updateItems(container, items, emptyText) {
  const old = new Map([...container.children].map(node => [node.dataset.sharingKey, node]));
  const active = document.activeElement;
  let cursor = container.firstElementChild;
  const entries = items.length ? items : [{ id:'empty', html:`<p class="rk-empty">${escapeHtml(emptyText)}</p>` }];
  for (const {id, html} of entries) {
    let node = old.get(id);
    old.delete(id);
    if (!node) { node = document.createElement('div'); node.dataset.sharingKey = id; }
    if (node._sharingHtml !== html) {
      const values = [...node.querySelectorAll('input,select')].map(input => ({value:input.value, start:input.selectionStart, end:input.selectionEnd, focused:input === active}));
      node.innerHTML = html;
      node._sharingHtml = html;
      node.querySelectorAll('input,select').forEach((input,i) => {
        const saved = values[i];
        if (!saved) return;
        input.value = saved.value;
        if (saved.focused) {
          input.focus({preventScroll:true});
          if (input.setSelectionRange && saved.start !== null) input.setSelectionRange(saved.start,saved.end);
        }
      });
    }
    if (node !== cursor) container.insertBefore(node,cursor);
    cursor = node.nextElementSibling;
  }
  old.forEach(node => node.remove());
}

export function reviewsHtml(state,userId) {
  const reviews = getReviewsFor(state,userId);
  const nameOf = id => escapeHtml(state.users.find(user => user.id === id)?.name ?? '?');
  return reviews.length ? `<ul class="rk-reviews">${reviews.map(review => `<li><b>${nameOf(review.reviewerId)}</b> · ${escapeHtml(review.itemName)}<span>${escapeHtml(review.text)}</span></li>`).join('')}</ul>` : '<p class="rk-empty">아직 받은 후기가 없어요.</p>';
}

// onAction은 최신 state에 계산을 적용해 저장하고 내페이지·랭킹을 갱신하는 함수예요.
export function createMySharing(root,{name,getViewerId,onAction}) {
  root.innerHTML = `
    <section class="mypage-section rk-box" aria-labelledby="my-account-title"><h3 id="my-account-title">내 계정</h3><p id="rk-account" class="rk-empty"></p></section>
    <section class="mypage-section rk-box" aria-labelledby="my-reservations-title"><h3 id="my-reservations-title">예약한 나눔</h3><p class="rk-label">직접 만나 옷을 주고받은 뒤, 받은 친구가 ‘옷을 받았어요’를 눌러요.</p><div id="rk-reservations"></div></section>
    <section class="mypage-section rk-box" aria-labelledby="my-pending-title"><h3 id="my-pending-title">상대에게 점수 주기</h3><p class="rk-label">옷을 받은 뒤 서로 1~10점을 보내요. 두 친구가 모두 보낼 때 함께 공개돼요.</p><div id="rk-pending"></div></section>
    <section class="mypage-section rk-box" aria-labelledby="my-reviewable-title"><h3 id="my-reviewable-title">후기 남기기</h3><p class="rk-label">옷을 받은 친구가 점수 공개 뒤 한 번 남길 수 있어요.</p><div id="rk-reviewable"></div></section>
    <section class="mypage-section rk-box" aria-labelledby="my-ledger-title"><h3 id="my-ledger-title">내 나눔 내역</h3><div id="rk-ledger"></div></section>
    <section class="mypage-section rk-box" aria-labelledby="my-reviews-title"><h3 id="my-reviews-title">받은 후기</h3><div id="rk-reviews"></div></section>`;
  const $ = selector => root.querySelector(selector);
  $('#rk-account').textContent = `${name} 님으로 로그인했어요. 나눔 기록은 이 이름으로 저장돼요.`;

  const click = event => {
    const button = event.target.closest('button');
    const item = event.target.closest('[data-exchange]');
    if (!button || button.disabled || !item) return;
    if (button.matches('[data-confirm]')) onAction(state => confirmReceived(state,item.dataset.exchange,getViewerId(state)).state,'옷을 받았다고 확인했어요. 이제 서로에게 점수를 보내 주세요.',button);
    else if (button.matches('[data-cancel]')) onAction(state => cancelReservation(state,item.dataset.exchange,getViewerId(state)).state,'예약을 취소했어요. 이 옷은 다시 예약할 수 있어요.',button);
  };
  const submit = event => {
    const form = event.target.closest('.rk-rate,.rk-review-form');
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    if (form.matches('.rk-rate')) {
      const score = Number(form.querySelector('select').value);
      onAction(state => submitRating(state,form.dataset.exchange,getViewerId(state),score).state,'점수를 비공개로 보냈어요. 두 친구가 모두 보내면 함께 공개돼요.',button);
    } else {
      const text = form.querySelector('input').value;
      onAction(state => addReview(state,form.dataset.exchange,getViewerId(state),text).state,'후기를 남겼어요.',button);
    }
  };
  root.addEventListener('click',click);
  root.addEventListener('submit',submit);

  function render(state,userId) {
    const nameOf = id => escapeHtml(state.users.find(user => user.id === id)?.name ?? '?');
    updateItems($('#rk-reservations'),getReservations(state,userId).map(exchange => {
      const receiver = exchange.receiverId === userId;
      const partner = nameOf(receiver ? exchange.giverId : exchange.receiverId);
      const role = receiver ? `<b>${partner}</b>에게 받기로 한 옷` : `<b>${partner}</b>에게 주기로 한 옷`;
      return {id:exchange.id,html:`<div class="rk-pending-item" data-exchange="${escapeHtml(exchange.id)}"><div><strong>${escapeHtml(exchange.itemName)}</strong><span>${role} · 직접 만나서 주고받아요</span></div><div class="rk-row">${receiver ? '<button type="button" data-confirm>옷을 받았어요</button>' : ''}<button type="button" class="rk-ghost" data-cancel>예약 취소</button></div></div>`};
    }),'예약한 나눔이 없어요. 옷장에서 마음에 드는 옷을 눌러 예약해 보세요.');

    updateItems($('#rk-pending'),getPendingExchanges(state,userId).map(({exchange,view}) => {
      const giver = exchange.giverId === userId,partner = nameOf(giver ? exchange.receiverId : exchange.giverId);
      const role = giver ? `내가 <b>${partner}</b>에게 준 옷` : `<b>${partner}</b>에게 받은 옷`;
      const control = view.canRate ? `<form class="rk-row rk-rate" data-exchange="${escapeHtml(exchange.id)}"><label class="rk-sr" for="rate-${escapeHtml(exchange.id)}">${partner}에게 줄 점수</label><select id="rate-${escapeHtml(exchange.id)}">${Array.from({length:MAX_SCORE-MIN_SCORE+1},(_,i) => `<option value="${MIN_SCORE+i}">${MIN_SCORE+i}점</option>`).join('')}</select><button type="submit">${partner}에게 점수 보내기</button></form>` : `<p class="rk-wait">내 점수 ${view.mine}점을 보냈어요. ${partner}의 점수를 기다리는 중이에요 🔒</p>`;
      return {id:exchange.id,html:`<div class="rk-pending-item"><div><strong>${escapeHtml(exchange.itemName)}</strong><span>${role}</span></div>${control}</div>`};
    }),'지금 점수를 기다리는 나눔이 없어요. 옷을 주고받으면 여기서 서로에게 점수를 줘요.');

    updateItems($('#rk-reviewable'),getReviewable(state,userId).map(exchange => ({id:exchange.id,html:`<form class="rk-review-form" data-exchange="${escapeHtml(exchange.id)}"><label class="rk-label" for="review-${escapeHtml(exchange.id)}"><b>${nameOf(exchange.giverId)}</b>에게 받은 ${escapeHtml(exchange.itemName)} 후기</label><div class="rk-row"><input id="review-${escapeHtml(exchange.id)}" maxlength="${REVIEW_MAX}" placeholder="예: 깨끗하고 사이즈가 딱 맞았어요!" /><button type="submit">후기 남기기</button></div></form>`})),'후기를 남길 수 있는 나눔이 없어요. 점수가 공개된 나눔에서 옷을 받았다면 여기에 나타나요.');

    const ledger = state.exchanges.filter(item => item.status !== 'cancelled' && (item.giverId === userId || item.receiverId === userId)).slice().reverse().map(item => {
      const view = getRatingView(item,userId),gave = item.giverId === userId,partner = nameOf(gave ? item.receiverId : item.giverId);
      const status = item.status === 'reserved' ? '예약 중이에요 · 직접 만나 주고받은 뒤 위에서 수령을 확인해요' : view.revealed ? `내가 ${partner}에게 준 점수 ${view.mine}점 · ${partner}가 나에게 준 점수 ${view.theirs}점` : view.waitingForOther ? `내 점수 ${view.mine}점을 보냈어요 · ${partner}의 점수를 기다려요 🔒` : `아직 ${partner}에게 점수를 안 보냈어요 → 위에서 점수를 보내 주세요`;
      return `<li><b>${escapeHtml(item.itemName)}</b> · ${gave ? `내가 ${partner}에게 준 옷` : `${partner}에게 받은 옷`}<span>${status}</span></li>`;
    }).join('');
    const ledgerHtml = ledger ? `<ul class="rk-recent">${ledger}</ul>` : '<p class="rk-empty">아직 나눔 기록이 없어요. 옷장에서 옷을 예약해 보세요.</p>';
    if ($('#rk-ledger').innerHTML !== ledgerHtml) $('#rk-ledger').innerHTML = ledgerHtml;
    const reviewHtml = reviewsHtml(state,userId);
    if ($('#rk-reviews').innerHTML !== reviewHtml) $('#rk-reviews').innerHTML = reviewHtml;
  }
  return {render,dispose(){root.removeEventListener('click',click);root.removeEventListener('submit',submit);}};
}
