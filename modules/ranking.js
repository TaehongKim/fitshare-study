import {
  BADGE_ICONS, MAX_SCORE, MIN_SCORE, REVIEW_MAX, addReview, cancelReservation, computeRanking, confirmReceived, ensureUser,
  finalizeMonths, formatMonth, getExchangePoints, getMonthKey, getPendingExchanges, getProfile, getRatingView,
  getRecentRevealed, getReservations, getReviewable, getReviewsFor, submitRating
} from './rankingLogic.js';
import { loadState, loadViewerName, mutateState, pullState, subscribe } from './rankingStore.js';

const CSS_ID = 'ranking-style';
let dispose = null; // 탭을 떠날 때 타이머와 듣기를 정리합니다.

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function ensureStyle() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement('link');
  link.id = CSS_ID; link.rel = 'stylesheet'; link.href = new URL('../css/ranking.css?v=ranking-4', import.meta.url).href;
  document.head.append(link);
}

export function renderRanking(root) {
  if (dispose) dispose();
  ensureStyle();
  root.dataset.module = 'ranking';
  let data = finalizeMonths(loadState());
  let profileId = '';
  let registering = false;
  // 로그인이 없어서 '내 이름'이 곧 나예요. 이름은 이 브라우저에 기억합니다.
  const viewerIdNow = () => {
    const name = loadViewerName().toLowerCase();
    return name ? data.users.find((user) => user.name.toLowerCase() === name)?.id ?? '' : '';
  };

  root.innerHTML = `
    <section class="ranking-panel" aria-labelledby="ranking-title">
      <div class="ranking-intro">
        <div class="module-emoji">🏆</div>
        <div>
          <h3 id="ranking-title">참여 랭킹 <span id="rk-month" class="rk-month"></span></h3>
          <p>옷장에서 마음에 드는 옷을 눌러 <b>예약</b>하고, 직접 만나 옷을 주고받은 뒤 서로에게 1~10점을 줘요. 받은 점수가 내 포인트가 되고, 점수는 두 친구가 모두 보낸 뒤에 한꺼번에 공개돼요. 옷을 받은 친구는 후기도 남길 수 있어요. 순위는 매달 새로 시작하고, 1·2·3위 배지는 계속 남아요.</p>
        </div>
      </div>
      <p id="rk-message" class="rk-message" role="status" aria-live="polite"></p>
      <div class="rk-box rk-mypage">
        <h4 id="rk-profile-title">🙋 내 페이지</h4>
        <div id="rk-profile"></div>
      </div>
      <div class="rk-box">
        <h4>① 내 계정</h4>
        <p id="rk-account" class="rk-empty"></p>
      </div>
      <div class="rk-box">
        <h4>② 예약한 나눔 <small>(옷장에서 옷을 눌러 예약해요 · 직접 만난 뒤 받은 친구가 "옷을 받았어요"를 눌러요)</small></h4>
        <div id="rk-reservations"></div>
      </div>
      <div class="rk-box">
        <h4>③ 상대에게 점수 주기 <small>(옷을 받은 뒤 준 사람도 받은 사람도 서로에게 줘요 · 상대 점수는 둘 다 보낼 때까지 비공개)</small></h4>
        <div id="rk-pending"></div>
      </div>
      <div class="rk-box">
        <h4>✍️ 후기 남기기 <small>(옷을 받은 친구가 준 친구에게, 점수 공개 뒤 한 번)</small></h4>
        <div id="rk-reviewable"></div>
      </div>
      <div class="rk-box">
        <h4>🏅 이번 달 순위 <small>실시간으로 바뀌어요</small></h4>
        <ol id="rk-board" class="rk-board"></ol>
      </div>
      <div class="rk-box">
        <h4>🎉 방금 공개된 점수</h4>
        <ul id="rk-recent" class="rk-recent"></ul>
      </div>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const message = (text, isError = false) => { const el = $('#rk-message'); el.textContent = text; el.classList.toggle('is-error', isError); };

  // 최신 기록에 변경을 적용해 저장하고 화면을 새로 그립니다. 저장에 실패해도 화면은 계속 써요.
  async function attempt(action, okText) {
    try {
      const result = await mutateState((state) => finalizeMonths(action(state)));
      data = result.state;
      refresh();
      if (!result.shared) message(result.saved ? '서버에 닿지 않아 이 브라우저에만 저장했어요. 다른 기기의 친구에게는 아직 보이지 않아요.' : '기록을 저장하지 못했어요. 이 화면에서는 계속 쓸 수 있지만 새로고침하면 사라져요.', true);
      else if (okText) message(okText);
      return true;
    } catch (error) {
      message(error.message || '문제가 생겼어요. 다시 시도해 주세요.', true);
      return false;
    }
  }

  const nameOf = (id) => escapeHtml(data.users.find((user) => user.id === id)?.name ?? '?');

  function refresh() {
    const now = new Date();
    const month = getMonthKey(now);
    const viewerId = viewerIdNow();
    $('#rk-month').textContent = formatMonth(month);
    const accountName = loadViewerName();
    $('#rk-account').textContent = accountName ? `${accountName} 님으로 로그인했어요. 나눔 기록은 이 이름으로 저장돼요.` : '로그인하지 않았어요. 첫 화면에서 로그인해 주세요.';
    // 로그인한 이름이 나눔 기록의 친구 목록에 아직 없으면 한 번 넣어 줘요. (내 페이지가 바로 보이도록)
    if (accountName && !viewerId && !registering) { registering = true; attempt((state) => ensureUser(state, accountName).state, '').finally(() => { registering = false; }); }

    // 예약한 나눔
    const reservations = viewerId ? getReservations(data, viewerId) : [];
    $('#rk-reservations').innerHTML = !viewerId ? '<p class="rk-empty">먼저 첫 화면에서 로그인해 주세요.</p>'
      : !reservations.length ? '<p class="rk-empty">예약한 나눔이 없어요. 옷장에서 마음에 드는 옷을 눌러 예약해 보세요.</p>'
        : reservations.map((exchange) => {
          const iAmReceiver = exchange.receiverId === viewerId;
          const partner = nameOf(iAmReceiver ? exchange.giverId : exchange.receiverId);
          const role = iAmReceiver ? `<b>${partner}</b>에게 받기로 한 옷` : `<b>${partner}</b>에게 주기로 한 옷`;
          const confirm = iAmReceiver ? '<button type="button" data-confirm>옷을 받았어요</button>' : '';
          return `<div class="rk-pending-item" data-exchange="${escapeHtml(exchange.id)}"><div><strong>${escapeHtml(exchange.itemName)}</strong><span>${role} · 직접 만나서 주고받아요</span></div><div class="rk-row">${confirm}<button type="button" class="rk-ghost" data-cancel>예약 취소</button></div></div>`;
        }).join('');

    // 점수 보내기
    const pending = viewerId ? getPendingExchanges(data, viewerId) : [];
    $('#rk-pending').innerHTML = !viewerId ? '<p class="rk-empty">먼저 첫 화면에서 로그인해 주세요.</p>'
      : !pending.length ? '<p class="rk-empty">지금 점수를 기다리는 나눔이 없어요. 옷을 주고받으면 여기서 서로에게 점수를 줘요.</p>'
        : pending.map(({ exchange, view }) => {
          const role = exchange.giverId === viewerId ? `내가 <b>${nameOf(exchange.receiverId)}</b>에게 준 옷` : `<b>${nameOf(exchange.giverId)}</b>에게 받은 옷`;
          const partner = exchange.giverId === viewerId ? nameOf(exchange.receiverId) : nameOf(exchange.giverId);
          const control = view.canRate
            ? `<form class="rk-row rk-rate" data-exchange="${escapeHtml(exchange.id)}"><label class="rk-sr" for="rate-${escapeHtml(exchange.id)}">${partner}에게 줄 점수</label><select id="rate-${escapeHtml(exchange.id)}">${Array.from({ length: MAX_SCORE - MIN_SCORE + 1 }, (_, i) => `<option value="${MIN_SCORE + i}">${MIN_SCORE + i}점</option>`).join('')}</select><button type="submit">${partner}에게 점수 보내기</button></form>`
            : `<p class="rk-wait">내 점수 ${view.mine}점을 보냈어요. ${partner}의 점수를 기다리는 중이에요 🔒</p>`;
          return `<div class="rk-pending-item"><div><strong>${escapeHtml(exchange.itemName)}</strong><span>${role}</span></div>${control}</div>`;
        }).join('');

    // 후기 남기기
    const reviewable = viewerId ? getReviewable(data, viewerId) : [];
    $('#rk-reviewable').innerHTML = !reviewable.length ? '<p class="rk-empty">후기를 남길 수 있는 나눔이 없어요. 점수가 공개된 나눔에서 옷을 받았다면 여기에 나타나요.</p>'
      : reviewable.map((exchange) => `<form class="rk-review-form" data-exchange="${escapeHtml(exchange.id)}"><label class="rk-label" for="review-${escapeHtml(exchange.id)}"><b>${nameOf(exchange.giverId)}</b>에게 받은 ${escapeHtml(exchange.itemName)} 후기</label><div class="rk-row"><input id="review-${escapeHtml(exchange.id)}" maxlength="${REVIEW_MAX}" placeholder="예: 깨끗하고 사이즈가 딱 맞았어요!" /><button type="submit">후기 남기기</button></div></form>`).join('');

    // 순위
    const ranking = computeRanking(data, month);
    $('#rk-board').innerHTML = ranking.length ? ranking.map((row) => `
      <li class="rk-rank rk-rank-${row.rank <= 3 ? row.rank : 'n'}">
        <span class="rk-place">${BADGE_ICONS[row.rank] ?? row.rank}</span>
        <button type="button" class="rk-name" data-profile="${escapeHtml(row.userId)}">${escapeHtml(row.name)}</button>
        <span class="rk-pts">${row.points}점</span>
        <span class="rk-sub">기부 ${row.donations} · 받음 ${row.receipts}</span>
      </li>`).join('') : '<li class="rk-empty">이번 달에 공개된 점수가 아직 없어요. 첫 나눔의 주인공이 되어 보세요!</li>';

    // 내 페이지 / 친구 페이지
    const shownId = data.users.some((user) => user.id === profileId) ? profileId : viewerId;
    if (!shownId) {
      $('#rk-profile-title').textContent = '🙋 내 페이지';
      $('#rk-profile').innerHTML = '<p class="rk-empty">로그인하면 내 페이지가 보여요.</p>';
    } else {
      const profile = getProfile(data, shownId, now);
      const reviews = getReviewsFor(data, shownId);
      const isMine = shownId === viewerId;
      $('#rk-profile-title').textContent = isMine ? '🙋 내 페이지' : `👤 ${profile.user.name} 님의 페이지`;
      const ledger = isMine ? data.exchanges.filter((item) => item.status !== 'cancelled' && (item.giverId === viewerId || item.receiverId === viewerId)).slice().reverse().map((item) => {
        const view = getRatingView(item, viewerId);
        const iGave = item.giverId === viewerId;
        const partner = nameOf(iGave ? item.receiverId : item.giverId);
        const status = item.status === 'reserved' ? '예약 중이에요 · 직접 만나 주고받은 뒤 ②에서 확인해요'
          : view.revealed ? `내가 ${partner}에게 준 점수 ${view.mine}점 · ${partner}가 나에게 준 점수 ${view.theirs}점`
            : view.waitingForOther ? `내 점수 ${view.mine}점을 보냈어요 · ${partner}의 점수를 기다려요 🔒` : `아직 ${partner}에게 점수를 안 보냈어요 → ③에서 보내 주세요`;
        return `<li><b>${escapeHtml(item.itemName)}</b> · ${iGave ? `내가 ${partner}에게 준 옷` : `${partner}에게 받은 옷`}<span>${status}</span></li>`;
      }).join('') : '';
      $('#rk-profile').innerHTML = `
        <p class="rk-profile-name">${escapeHtml(profile.user.name)}</p>
        ${isMine ? '' : '<button type="button" class="rk-ghost" data-profile="">내 페이지로 돌아가기</button>'}
        <dl class="rk-stats">
          <div><dt>이번 달 포인트</dt><dd>${profile.monthPoints}점${profile.monthRank ? ` · ${profile.monthRank}위` : ''}</dd></div>
          <div><dt>기부한 횟수</dt><dd>${profile.donations}번</dd></div>
          <div><dt>받은 횟수</dt><dd>${profile.receipts}번</dd></div>
        </dl>
        ${isMine ? `<p class="rk-label">내 나눔 내역</p>${ledger ? `<ul class="rk-recent">${ledger}</ul>` : '<p class="rk-empty">아직 나눔 기록이 없어요. 옷장에서 옷을 예약해 보세요.</p>'}` : ''}
        <p class="rk-label">받은 후기</p>
        ${reviews.length ? `<ul class="rk-reviews">${reviews.map((review) => `<li><b>${nameOf(review.reviewerId)}</b> · ${escapeHtml(review.itemName)}<span>${escapeHtml(review.text)}</span></li>`).join('')}</ul>` : '<p class="rk-empty">아직 받은 후기가 없어요.</p>'}
        <p class="rk-label">우승 배지</p>
        ${profile.badges.length ? `<ul class="rk-badges">${profile.badges.map((badge) => `<li title="${formatMonth(badge.month)} ${badge.rank}위">${BADGE_ICONS[badge.rank]}<span>${formatMonth(badge.month)} ${badge.rank}위</span></li>`).join('')}</ul>` : '<p class="rk-empty">아직 배지가 없어요. 한 달 순위 1·2·3위가 되면 받아요!</p>'}`;
    }

    // 방금 공개된 점수
    const recent = getRecentRevealed(data);
    $('#rk-recent').innerHTML = recent.length ? recent.map((exchange) => {
      const earned = getExchangePoints(exchange);
      return `<li><b>${nameOf(exchange.giverId)}</b> → <b>${nameOf(exchange.receiverId)}</b> · ${escapeHtml(exchange.itemName)}<span>${nameOf(exchange.giverId)} +${earned.giver}점, ${nameOf(exchange.receiverId)} +${earned.receiver}점</span></li>`;
    }).join('') : '<li class="rk-empty">두 친구가 모두 점수를 보내면 여기에 한꺼번에 공개돼요.</li>';
  }

  $('#rk-reservations').addEventListener('click', (event) => {
    const item = event.target.closest('[data-exchange]');
    if (!item) return;
    const id = item.dataset.exchange;
    if (event.target.closest('[data-confirm]')) attempt((state) => confirmReceived(state, id, viewerIdNow()).state, '옷을 받았다고 확인했어요. 이제 ③에서 서로에게 점수를 보내요.');
    else if (event.target.closest('[data-cancel]')) attempt((state) => cancelReservation(state, id, viewerIdNow()).state, '예약을 취소했어요. 이 옷은 다시 예약할 수 있어요.');
  });
  $('#rk-pending').addEventListener('submit', (event) => {
    const form = event.target.closest('.rk-rate');
    if (!form) return;
    event.preventDefault();
    const score = Number(form.querySelector('select').value);
    attempt((state) => submitRating(state, form.dataset.exchange, viewerIdNow(), score).state, '점수를 비공개로 보냈어요.');
  });
  $('#rk-reviewable').addEventListener('submit', (event) => {
    const form = event.target.closest('.rk-review-form');
    if (!form) return;
    event.preventDefault();
    const text = form.querySelector('input').value;
    attempt((state) => addReview(state, form.dataset.exchange, viewerIdNow(), text).state, '후기를 남겼어요.');
  });
  const openProfile = (event) => {
    const button = event.target.closest('[data-profile]');
    if (button) { profileId = button.dataset.profile; refresh(); }
  };
  $('#rk-board').addEventListener('click', openProfile);
  $('#rk-profile').addEventListener('click', openProfile);

  // 실시간: 다른 기기의 변경을 5초마다 받아 오고, 같은 브라우저의 다른 탭은 바로 받아요. (달이 바뀌는 순간도 이때 확인)
  const reload = () => { data = finalizeMonths(loadState()); refresh(); };
  const sync = async () => { const latest = await pullState(); if (latest) { data = finalizeMonths(latest); refresh(); } };
  const unsubscribe = subscribe(reload);
  const timer = setInterval(() => { if (!document.body.contains(root)) return; sync(); }, 5000);
  dispose = () => { unsubscribe(); clearInterval(timer); dispose = null; };

  refresh();
  sync();
}
