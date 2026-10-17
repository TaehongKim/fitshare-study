// 아바타 그리기와 "내 프로필" 창입니다. 프로필에는 아바타, 우승 배지, 나눔한 횟수, 수령한 횟수가 보이고 아바타를 꾸밀 수 있어요.
// 아바타는 나눔 기록(rankingStore)에 함께 저장돼서 다른 친구 화면에도 보입니다.
import {
  AVATAR_OPTIONS, BADGE_ICONS, defaultAvatar, ensureUser, formatMonth, getProfile, sanitizeAvatar, setAvatar
} from './rankingLogic.js';
import { loadState, loadViewerName, mutateState, pullState } from './rankingStore.js';
import { authAction, getUser } from '../js/auth.js?v=auth-2';

const CSS_ID = 'ranking-style';

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function ensureStyle() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement('link');
  link.id = CSS_ID; link.rel = 'stylesheet'; link.href = new URL('../css/ranking.css?v=ranking-7', import.meta.url).href;
  document.head.append(link);
}

// 아바타 그림 한 개를 HTML 글자로 만듭니다. 값은 항상 목록 검사를 거치므로 안전해요.
export function avatarHtml(avatar, size = 40) {
  const clean = sanitizeAvatar(avatar) ?? defaultAvatar();
  return `<span class="avatar" role="img" aria-label="아바타" style="--av-bg:${clean.bg};--av-size:${Number(size)}px"><span class="av-face">${clean.face}</span>${clean.hat ? `<span class="av-hat">${clean.hat}</span>` : ''}${clean.outfit ? `<span class="av-outfit">${clean.outfit}</span>` : ''}</span>`;
}

// 이름(내 로그인 이름)의 프로필 창을 엽니다. onSaved 는 아바타를 저장한 뒤 부르는 함수예요.
export function openProfileDialog(onSaved) {
  ensureStyle();
  const name = loadViewerName();
  const dialog = document.createElement('dialog');
  dialog.className = 'profile-dialog';
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  let draft = defaultAvatar();
  let shownState = loadState();
  let touched = false;

  function stateWithMe(state) { return name ? ensureUser(state, name).state : state; }

  function render(state) {
    shownState = state;
    if (!name) {
      dialog.innerHTML = '<h2>내 프로필</h2><p class="rk-empty">로그인한 뒤에 프로필을 볼 수 있어요.</p><div class="garment-detail-buttons"><button type="button" class="rk-ghost" data-close>닫기</button></div>';
      return;
    }
    const full = stateWithMe(state);
    const me = full.users.find((user) => user.name.toLowerCase() === name.toLowerCase());
    const profile = getProfile(full, me.id, new Date());
    const saved = sanitizeAvatar(me.avatar) ?? defaultAvatar();
    const teacher = getUser()?.role === 'teacher';
    dialog.innerHTML = `
      <h2>🙋 내 프로필</h2>
      <div class="profile-head"><span id="pf-preview">${avatarHtml(draft, 84)}</span><div><p class="rk-profile-name">${escapeHtml(profile.user.name)}</p><span class="profile-role${teacher ? ' is-teacher' : ''}">${teacher ? '선생님' : '학생'}</span></div></div>
      <dl class="rk-stats">
        <div><dt>나눔한 횟수</dt><dd>${profile.donations}번</dd></div>
        <div><dt>수령한 횟수</dt><dd>${profile.receipts}번</dd></div>
        <div><dt>이번 달 포인트</dt><dd>${profile.monthPoints}점${profile.monthRank ? ` · ${profile.monthRank}위` : ''}</dd></div>
      </dl>
      <p class="rk-label">받은 우승 배지</p>
      ${profile.badges.length ? `<ul class="rk-badges">${profile.badges.map((badge) => `<li title="${formatMonth(badge.month)} ${badge.rank}위">${BADGE_ICONS[badge.rank]}<span>${formatMonth(badge.month)} ${badge.rank}위</span></li>`).join('')}</ul>` : '<p class="rk-empty">아직 배지가 없어요. 한 달 순위 1·2·3위가 되면 받아요!</p>'}
      ${teacher ? `<section class="teacher-profile-controls">
        <h3 class="profile-sub">선생님 설정</h3>
        <form data-account-action="teacher-code"><label>새 선생님 인증 코드<input name="newCode" type="password" maxlength="200" autocomplete="new-password" required></label><button class="primary-action" type="submit">인증 코드 바꾸기</button></form>
        <form data-account-action="reset-student-password"><label>학생 아이디<input name="username" maxlength="200" required></label><label>새 비밀번호<input name="newPassword" type="password" maxlength="200" autocomplete="new-password" required></label><button class="primary-action" type="submit">학생 비밀번호 바꾸기</button></form>
      </section>` : ''}
      <p id="pf-account-message" class="garment-detail-message" role="status" aria-live="polite"></p>
      <h3 class="profile-sub">🎨 아바타 꾸미기</h3>
      ${['bg', 'face', 'hat', 'outfit'].map((key) => `
        <p class="rk-label">${{ bg: '배경색', face: '얼굴', hat: '모자·머리', outfit: '옷' }[key]}</p>
        <div class="avatar-choices" data-key="${key}">${AVATAR_OPTIONS[key].map((value) => key === 'bg'
    ? `<button type="button" class="avatar-swatch${draft.bg === value ? ' is-picked' : ''}" data-value="${value}" style="background:${value}" aria-label="배경색 ${value}" aria-pressed="${draft.bg === value}"></button>`
    : `<button type="button" class="avatar-pick${draft[key] === value ? ' is-picked' : ''}" data-value="${value}" aria-pressed="${draft[key] === value}">${value || '없음'}</button>`).join('')}</div>`).join('')}
      <p id="pf-message" class="garment-detail-message" role="status"></p>
      <div class="garment-detail-buttons">
        <button type="button" class="rk-ghost" data-reset${JSON.stringify(draft) === JSON.stringify(saved) ? ' disabled' : ''}>되돌리기</button>
        <button type="button" class="primary-action" data-save>아바타 저장</button>
        <button type="button" class="rk-ghost" data-close>닫기</button>
      </div>`;
  }

  dialog.addEventListener('click', async (event) => {
    if (event.target.closest('[data-close]')) return dialog.close();
    const pick = event.target.closest('.avatar-choices button');
    if (pick) {
      touched = true;
      draft = { ...draft, [pick.parentElement.dataset.key]: pick.dataset.value };
      return render(shownState);
    }
    if (event.target.closest('[data-reset]')) {
      const me = stateWithMe(shownState).users.find((user) => user.name.toLowerCase() === name.toLowerCase());
      draft = sanitizeAvatar(me?.avatar) ?? defaultAvatar();
      return render(shownState);
    }
    if (event.target.closest('[data-save]')) {
      const message = dialog.querySelector('#pf-message');
      try {
        const result = await mutateState((state) => {
          const ensured = ensureUser(state, name);
          return setAvatar(ensured.state, ensured.user.id, draft).state;
        });
        render(result.state);
        const note = dialog.querySelector('#pf-message');
        note.classList.toggle('is-error', !result.shared);
        note.textContent = result.shared ? '아바타를 저장했어요!' : '서버에 닿지 않아 이 브라우저에만 저장했어요.';
        if (onSaved) onSaved(result.state);
      } catch (error) {
        message.classList.add('is-error');
        message.textContent = error.message || '아바타를 저장하지 못했어요.';
      }
    }
  });

  dialog.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-account-action]');
    if (!form) return;
    event.preventDefault();
    const message = dialog.querySelector('#pf-account-message');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.classList.remove('is-error');
    message.textContent = '저장하고 있어요.';
    try {
      const values = Object.fromEntries(new FormData(form));
      await authAction(form.dataset.accountAction, values);
      form.reset();
      message.textContent = form.dataset.accountAction === 'teacher-code'
        ? '새 인증 코드로 바꿨어요.' : '학생 비밀번호를 바꿨어요. 이전 로그인은 모두 종료됐어요.';
    } catch (error) {
      message.classList.add('is-error');
      message.textContent = error.message || '저장하지 못했어요. 다시 시도해 주세요.';
    } finally {
      button.disabled = false;
    }
  });

  // 저장된 내 아바타로 시작하고, 서버의 최신 기록이 오면 다시 그려요.
  const start = (state) => {
    const me = stateWithMe(state).users.find((user) => user.name.toLowerCase() === name.toLowerCase());
    draft = sanitizeAvatar(me?.avatar) ?? defaultAvatar();
    render(state);
  };
  start(shownState);
  pullState().then((state) => { if (state && dialog.open && !touched) start(state); });
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return dialog;
}
