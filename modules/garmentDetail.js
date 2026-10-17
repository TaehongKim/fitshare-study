// 옷장의 옷을 누르면 뜨는 상세 창입니다. 옷 정보를 보여 주고 "예약하기"로 나눔을 시작해요.
// 예약 기록은 랭킹과 같은 서버 기록(rankingStore)에 저장돼서, 랭킹 탭 ②에서 이어집니다.
import { cancelReservation, getGarmentExchange, reserveGarment } from './rankingLogic.js';
import { loadState, loadViewerName, mutateState, pullState } from './rankingStore.js';
import { getUser, requestApi } from '../js/auth.js?v=auth-2';

const CSS_ID = 'ranking-style';
const GENDER_NAMES = { male: '남성용', female: '여성용', unisex: '공용', unknown: '모름' };

function ensureStyle() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement('link');
  link.id = CSS_ID; link.rel = 'stylesheet'; link.href = new URL('../css/ranking.css?v=ranking-7', import.meta.url).href;
  document.head.append(link);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function openGarmentDetail(garment) {
  ensureStyle();
  const dialog = el('dialog', 'garment-detail');
  const id = encodeURIComponent(garment.id);
  const image = el('img', 'garment-detail-photo');
  image.alt = `${garment.name} 사진`;
  const choices = [`/api/garments/${id}/thumbnail?v=image-priority-1`, `/api/garments/${id}/closet-photo`, `/api/garments/${id}/photo`];
  let choice = 0;
  image.onerror = () => { choice += 1; if (choice < choices.length) image.src = choices[choice]; else image.onerror = null; };
  image.src = choices[0];

  const photoControls = el('div', 'garment-detail-photo-controls');
  const originalPhoto = el('button', 'rk-ghost', '원본 사진');
  originalPhoto.type = 'button';
  originalPhoto.addEventListener('click', () => { image.onerror = null; image.classList.remove('is-product-photo'); image.src = `/api/garments/${id}/photo`; });
  const closetPhoto = el('button', 'rk-ghost', '옷장 사진');
  closetPhoto.type = 'button';
  closetPhoto.addEventListener('click', () => {
    choice = 1;
    image.onerror = () => { choice += 1; if (choice < choices.length) image.src = choices[choice]; else image.onerror = null; };
    image.classList.remove('is-product-photo');
    image.src = choices[choice];
  });
  photoControls.append(originalPhoto, closetPhoto);
  let productPhotoUrl = garment.productPhotoUrl || null;
  if (getUser()?.role === 'teacher') {
    const productPhoto = el('button', 'rk-ghost', productPhotoUrl ? 'AI 상품 사진 보기' : 'AI 상품 사진 만들기');
    productPhoto.type = 'button';
    productPhoto.addEventListener('click', async () => {
      if (productPhotoUrl) {
        image.onerror = null;
        image.classList.add('is-product-photo');
        image.src = productPhotoUrl;
        return;
      }
      productPhoto.disabled = true;
      message.textContent = 'AI 상품 사진을 만들고 있어요. 잠시 기다려 주세요.';
      message.classList.remove('is-error');
      try {
        const result = await requestApi(`/api/garments/${id}/product-photo`, {});
        productPhotoUrl = result.productPhotoUrl;
        garment.productPhotoUrl = productPhotoUrl;
        productPhoto.textContent = 'AI 상품 사진 보기';
        image.onerror = null;
        image.classList.add('is-product-photo');
        image.src = productPhotoUrl;
        message.textContent = 'AI 상품 사진을 저장했어요. 원본 사진은 그대로 있어요.';
      } catch (error) {
        message.classList.add('is-error');
        message.textContent = error.message || 'AI 상품 사진을 만들지 못했어요.';
      } finally {
        productPhoto.disabled = false;
      }
    });
    photoControls.append(productPhoto);
  }

  const info = el('dl', 'garment-detail-info');
  const rows = [
    ['옷 이름', garment.name],
    ['종류', garment.garmentTypeName || garment.category || '옷'],
    ['누가 입나요?', GENDER_NAMES[garment.gender] || '모름'],
    ['색깔', garment.colorName || '-'],
    ['크기', `길이 ${garment.lengthCm}cm · 너비 ${garment.widthCm}cm`],
    ['올린 사람', garment.ownerName || '적혀 있지 않아요']
  ];
  for (const [label, value] of rows) {
    const row = el('div');
    row.append(el('dt', '', label), el('dd', '', value));
    info.append(row);
  }

  const status = el('p', 'garment-detail-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const message = el('p', 'garment-detail-message');
  message.setAttribute('role', 'status');
  const reserve = el('button', 'primary-action', '예약하기');
  reserve.type = 'button';
  const cancel = el('button', 'rk-ghost', '예약 취소');
  cancel.type = 'button';
  const close = el('button', 'rk-ghost', '닫기');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  const buttons = el('div', 'garment-detail-buttons');
  buttons.append(reserve, cancel, close);
  dialog.append(el('h2', '', garment.name), image, photoControls, info, status, message, buttons);

  // 지금 이 옷이 예약 가능한지 서버 기록을 보고 화면을 맞춥니다.
  let current = null;
  function show(state) {
    current = getGarmentExchange(state, garment.id);
    const nameOf = (userId) => state.users.find((user) => user.id === userId)?.name ?? '?';
    const me = loadViewerName().toLowerCase();
    const mine = current && me && [nameOf(current.giverId), nameOf(current.receiverId)].some((name) => name.toLowerCase() === me);
    if (!current) status.textContent = garment.ownerName ? '🟢 예약할 수 있어요' : '⚪ 올린 사람이 적혀 있지 않아 예약할 수 없어요 (옷장의 "정보 수정"에서 올린 사람을 써 주세요)';
    else if (current.status === 'reserved') status.textContent = `🟡 ${nameOf(current.receiverId)} 님이 예약 중이에요`;
    else status.textContent = `🔴 ${nameOf(current.receiverId)} 님에게 나눔이 끝난 옷이에요`;
    reserve.disabled = Boolean(current) || !garment.ownerName;
    cancel.hidden = !(current && current.status === 'reserved' && mine);
  }
  show(loadState());
  pullState().then((state) => { if (state) show(state); });

  async function run(action, okText) {
    reserve.disabled = true; cancel.disabled = true;
    try {
      const result = await mutateState(action);
      show(result.state);
      message.classList.remove('is-error');
      message.textContent = result.shared ? okText : '서버에 닿지 않아 이 브라우저에만 저장했어요. 다른 기기의 친구에게는 아직 보이지 않아요.';
      if (!result.shared) message.classList.add('is-error');
    } catch (error) {
      message.classList.add('is-error');
      message.textContent = error.message || '문제가 생겼어요. 다시 시도해 주세요.';
      show(loadState());
    } finally {
      cancel.disabled = false;
    }
  }
  reserve.addEventListener('click', async () => {
    const reserverName = loadViewerName();
    if (!reserverName) { message.classList.add('is-error'); message.textContent = '로그인한 뒤에 예약할 수 있어요.'; return; }
    await run((state) => reserveGarment(state, {
      garmentId: garment.id, itemName: String(garment.name).slice(0, 30), ownerName: garment.ownerName, reserverName
    }).state, '예약했어요! 랭킹 탭 ②에서 확인하고, 올린 사람과 직접 만나 옷을 받아 보세요.');
  });
  cancel.addEventListener('click', () => {
    const meName = loadViewerName();
    run((state) => {
      const me = state.users.find((user) => user.name.toLowerCase() === meName.toLowerCase());
      return cancelReservation(state, getGarmentExchange(state, garment.id)?.id, me?.id).state;
    }, '예약을 취소했어요.');
  });

  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}
