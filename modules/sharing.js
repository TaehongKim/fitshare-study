// =========================================
// sharing.js — 🤝 나눔 모듈 (담당: 정해 주세요)
// ✅ 이 파일 안에서만 작업해요. 다른 모듈 파일은 고치지 않아요.
// ✅ 반드시 renderSharing(root, state) 함수를 export 해야 해요.
//
// 하는 일
//  1) 작아진 옷을 나눔 목록에 올려요. (나눔하기)
//  2) 친구가 나눔한 옷을 예약해요. (한 번에 3벌까지, 3일 안에 받아 가기)
//  3) 옷을 받으면 "받았어요"를 눌러요 → 나눔한 친구 +1점, 받은 친구 +1점 (랭킹에 바로 반영)
//  4) 받기 전에는 예약을 취소할 수 있어요.
//  5) 나눔할 때 옷 사진을 넣을 수 있어요.
//     - 📷 사진 찍기: 노트북 카메라를 화면 안에서 켜서 찍어요. (안 되면 휴대폰 카메라 앱을 열어요)
//     - 🖼️ 사진 올리기: 앨범이나 사진 파일을 골라요.
//  6) 내가 나눔한 옷은 취소할 수 있어요. (친구가 예약 중이거나 받아 간 옷은 안 돼요)
// =========================================

import {
  getClothes,
  getShareLogs,
  today,
  donate,
  cancelDonation,
  reserve,
  cancelReservation,
  completeReservation,
  clearPractice,
  RESERVE_DAYS,
  MAX_RESERVATIONS,
} from "../js/store.js";

const CATEGORIES = [
  { name: "상의", emoji: "👕" },
  { name: "하의", emoji: "👖" },
  { name: "아우터", emoji: "🧥" },
  { name: "원피스", emoji: "👗" },
];
const SIZES = [90, 100, 110, 120, 130, 140, 150, 160, 170];
const CONDITIONS = ["아주 좋음", "좋음", "보통"];
const DAILY_MAX = 3; // 랭킹의 하루 최대 점수
const PHOTO_SIZE = 320; // 사진의 긴 쪽을 이 크기(px)로 줄여서 저장해요. (저장 공간 아끼기)
const PHOTO_MAX_FILE = 15 * 1024 * 1024; // 15MB보다 큰 사진 파일은 받지 않아요.

// 사진을 작게 줄여서 글자(data URL)로 바꿔요. 다 되면 결과를 돌려줘요.
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("사진을 읽지 못했어요."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("사진을 열지 못했어요."));
      image.onload = () => {
        const scale = Math.min(1, PHOTO_SIZE / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 카메라 화면(video)의 지금 모습을 작게 줄인 사진 글자로 바꿔요.
function snapshot(video) {
  const scale = Math.min(1, PHOTO_SIZE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

// 카메라를 켤 수 없을 때, 이유를 쉬운 말로 바꿔요.
function cameraErrorText(error) {
  if (error.name === "NotAllowedError") {
    return "카메라 사용을 허락해 주세요. 주소창 옆 카메라 아이콘을 눌러 '허용'으로 바꿀 수 있어요.";
  }
  if (error.name === "NotFoundError") return "카메라를 찾지 못했어요. '사진 올리기'를 써 주세요.";
  if (error.name === "NotReadableError") {
    return "다른 프로그램이 카메라를 쓰고 있어요. 줌이나 카메라 앱을 끄고 다시 해 주세요.";
  }
  return "카메라를 켜지 못했어요. '사진 올리기'를 써 주세요.";
}

// 우리가 만든 사진 글자인지 확인해요. (이상한 값은 화면에 넣지 않아요)
function isPhoto(photo) {
  return typeof photo === "string" && photo.startsWith("data:image/jpeg;base64,");
}

// 사진이 있으면 사진을, 없으면 이모지를 보여 줘요.
function itemPicture(item) {
  if (isPhoto(item.photo)) {
    return `<img class="item-photo" src="${safe(item.photo)}" alt="${safe(item.name)} 사진" />`;
  }
  return `<div class="item-emoji">${safe(item.emoji)}</div>`;
}

// 글자 속 <, > 같은 기호를 안전한 글자로 바꿔요.
function safe(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// "2026-10-13" → "10/13"
function shortDate(date) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
}

// 나눔할 옷 정보를 검사해요. 문제가 있으면 오류 문장을, 괜찮으면 빈 글자("")를 돌려줘요.
function checkDonation(name, category, size, condition) {
  const text = name.trim();
  if (text === "") return "옷 이름을 입력해 주세요. 예) 노란 반팔 티";
  if (text.length > 20) return "옷 이름은 20글자까지 써 주세요.";
  if (!CATEGORIES.some((c) => c.name === category)) return "옷 종류를 골라 주세요.";
  if (!SIZES.includes(size)) return "호수를 골라 주세요.";
  if (!CONDITIONS.includes(condition)) return "옷 상태를 골라 주세요.";
  return "";
}

// 오늘 이 사람이 나눔에 참여한(주거나 받은) 횟수를 세요. 하루 최대 3점 안내에 써요.
function countToday(name) {
  const day = today();
  return getShareLogs().filter((log) => log.date === day && (log.giver === name || log.receiver === name)).length;
}

// 별명이 정해져 있는지 확인해요.
function hasNickname(me) {
  return typeof me === "string" && me.trim() !== "";
}

// <select> 칸의 선택지를 만들어요.
function options(list, label = (value) => value) {
  return list.map((value) => `<option value="${value}">${label(value)}</option>`).join("");
}

// 옷 카드 아래쪽: 상황에 따라 버튼 또는 꼬리표를 보여 줘요.
function cardAction(item, me) {
  if (item.giver === me) {
    // 친구가 예약 중이면 취소 버튼 없이 꼬리표만 보여 줘요.
    if (item.reservedBy) {
      return `<span class="badge badge-mock">내가 나눔한 옷 · ${safe(item.reservedBy)} 예약 중</span>`;
    }
    return `
      <span class="badge badge-mock">내가 나눔한 옷</span>
      <button class="btn card-button ghost-button" type="button" data-action="withdraw" data-id="${safe(item.id)}">나눔 취소</button>
    `;
  }
  if (item.reservedBy === me) {
    return `
      <span class="badge badge-dev">📌 내가 예약함 (~${shortDate(item.reservedUntil)})</span>
      <button class="btn card-button ghost-button" type="button" data-action="cancel" data-id="${safe(item.id)}">예약 취소</button>
    `;
  }
  if (item.reservedBy) {
    return `<span class="badge badge-dev">예약 중 (~${shortDate(item.reservedUntil)})</span>`;
  }
  return `<button class="btn card-button" type="button" data-action="reserve" data-id="${safe(item.id)}">예약하기</button>`;
}

// 나눔 중인 옷 하나를 카드로 만들어요.
function clothesCard(item, me) {
  return `
    <li class="item">
      ${itemPicture(item)}
      <div class="item-name">${safe(item.name)}</div>
      <div class="item-meta">${safe(item.category)} · ${item.size}호 · ${safe(item.condition)}</div>
      <div class="item-meta">나눔: ${safe(item.giver)}</div>
      ${cardAction(item, me)}
    </li>
  `;
}

// 내 예약 한 줄을 만들어요. [받았어요] [취소] 버튼이 있어요.
function reservationRow(item) {
  return `
    <li class="reserve-row">
      <div>
        <div class="item-name">${safe(item.emoji)} ${safe(item.name)}</div>
        <div class="item-meta">${safe(item.giver)} 나눔 · <strong>${shortDate(item.reservedUntil)}까지</strong> 받아 가요</div>
      </div>
      <div class="reserve-actions">
        <button class="btn small-button" type="button" data-action="complete" data-id="${safe(item.id)}">받았어요</button>
        <button class="btn small-button ghost-button" type="button" data-action="cancel" data-id="${safe(item.id)}">취소</button>
      </div>
    </li>
  `;
}

// 내 기록(내가 나눔한 옷, 내가 받은 옷)을 만들어요.
function myRecordHtml(clothes, me) {
  const given = clothes.filter((item) => item.giver === me);
  const givenDone = given.filter((item) => item.takenBy).length;
  const got = clothes.filter((item) => item.takenBy === me);
  const gotList = got.length
    ? got.map((item) => `<li>${safe(item.emoji)} ${safe(item.name)} (${safe(item.giver)}에게서)</li>`).join("")
    : "<li>아직 받은 옷이 없어요.</li>";

  return `
    <ul class="rule-list">
      <li>🎁 내가 나눔한 옷: <strong>${given.length}벌</strong> (그중 친구가 받아 간 옷 ${givenDone}벌)</li>
    </ul>
    <p class="field-label">🧺 내가 받은 옷</p>
    <ul class="rule-list">${gotList}</ul>
  `;
}

// 화면을 다시 그리고, 위쪽에 알림 문장을 보여 줘요.
function renderWithNotice(root, state, message, isError) {
  renderSharing(root, state);
  const notice = root.querySelector(".share-notice");
  notice.textContent = message;
  notice.classList.toggle("is-error", isError);
  notice.hidden = false;
}

// 예약하기 / 받았어요 / 취소 버튼을 눌렀을 때 할 일
function handleAction(root, state, action, itemId) {
  const me = state.student.nickname;
  if (!hasNickname(me)) {
    renderWithNotice(root, state, '참여 랭킹 탭의 "나는 누구?"에서 별명을 먼저 정해 주세요.', true);
    return;
  }

  if (action === "reserve") {
    const result = reserve(itemId, me);
    if (result.error) return renderWithNotice(root, state, result.error, true);
    renderWithNotice(
      root,
      state,
      `"${result.item.name}" 예약 완료! 📌 ${shortDate(result.until)}까지 받아 가고, 받으면 "받았어요"를 눌러 주세요.`,
      false
    );
  }

  if (action === "complete") {
    const alreadyFull = countToday(me) >= DAILY_MAX; // 받기 전에 오늘 이미 3번 참여했나요?
    const result = completeReservation(itemId, me);
    if (result.error) return renderWithNotice(root, state, result.error, true);
    const pointText = alreadyFull
      ? `오늘은 이미 ${DAILY_MAX}점을 다 모아서, 이번에는 나눔한 ${result.item.giver}만 점수를 받아요.`
      : `${result.item.giver}, ${me} 모두 랭킹 점수를 받아요.`;
    renderWithNotice(root, state, `"${result.item.name}" 나눔 완료! 🎉 ${pointText}`, false);
  }

  if (action === "withdraw") {
    const result = cancelDonation(itemId, me);
    if (result.error) return renderWithNotice(root, state, result.error, true);
    renderWithNotice(root, state, `"${result.item.name}" 나눔을 취소했어요. 옷은 다시 챙겨 가세요.`, false);
  }

  if (action === "cancel") {
    const result = cancelReservation(itemId, me);
    if (result.error) return renderWithNotice(root, state, result.error, true);
    renderWithNotice(root, state, "예약을 취소했어요. 다른 친구가 예약할 수 있게 됐어요.", false);
  }
}

export function renderSharing(root, state) {
  const me = state.student.nickname;
  const clothes = getClothes();
  const sharing = clothes.filter((item) => !item.takenBy); // 아직 나눔 중인 옷
  const reservable = sharing.filter((item) => !item.reservedBy && item.giver !== me).length;
  const myReservations = sharing.filter((item) => item.reservedBy === me);

  root.innerHTML = `
    <article class="card">
      <h2 class="card-title">🤝 나눔</h2>
      <p class="card-desc">작아진 옷은 나눔하고, 친구가 나눔한 옷은 예약해서 받아 가요. 주고받으면 둘 다 랭킹 점수를 받아요!</p>
      <p class="form-message">
        지금 사용하는 사람: <strong>${hasNickname(me) ? safe(me) : "없음"}</strong>
        · 바꾸려면 <strong>참여 랭킹</strong> 탭의 "나는 누구?"
      </p>
      <p class="form-message share-notice" role="status" hidden></p>

      <p class="section-label">📌 내 예약 (${myReservations.length}/${MAX_RESERVATIONS})</p>
      ${myReservations.length
        ? `<ul class="reserve-list">${myReservations.map(reservationRow).join("")}</ul>`
        : '<p class="form-message">예약한 옷이 없어요. 아래에서 마음에 드는 옷을 예약해 보세요.</p>'}
      <p class="form-message">예약 규칙: 한 번에 ${MAX_RESERVATIONS}벌까지 · ${RESERVE_DAYS}일 안에 받아 가기 · 받으면 "받았어요"를 눌러야 점수가 쌓여요</p>

      <p class="section-label">🧺 나눔 중인 옷 (${sharing.length}벌 · 예약 가능 ${reservable}벌)</p>
      ${sharing.length
        ? `<ul class="item-grid">${sharing.map((item) => clothesCard(item, me)).join("")}</ul>`
        : '<div class="placeholder"><p>지금은 나눔 중인 옷이 없어요. 첫 번째로 나눔해 볼까요?</p></div>'}

      <p class="section-label">🎁 옷 나눔하기</p>
      <form class="donate-form" novalidate>
        <label class="field-label" for="donate-name">옷 이름</label>
        <input id="donate-name" class="text-input" type="text" maxlength="20" autocomplete="off"
               placeholder="예: 노란 반팔 티" />
        <div class="field-grid share-fields">
          <div>
            <label class="field-label" for="donate-category">종류</label>
            <select id="donate-category" class="text-input">${options(CATEGORIES.map((c) => c.name))}</select>
          </div>
          <div>
            <label class="field-label" for="donate-size">호수</label>
            <select id="donate-size" class="text-input">${options(SIZES, (size) => `${size}호`)}</select>
          </div>
          <div>
            <label class="field-label" for="donate-condition">상태</label>
            <select id="donate-condition" class="text-input">${options(CONDITIONS)}</select>
          </div>
        </div>
        <div class="photo-row">
          <!-- 사진 찍기: 노트북 카메라를 화면 안에서 켜요. 안 되면 아래 숨은 칸으로 휴대폰 카메라 앱을 열어요 -->
          <button class="btn ghost-button photo-button camera-open" type="button">📷 사진 찍기</button>
          <input id="donate-photo" class="photo-input" type="file" accept="image/*" capture="environment" hidden />
          <!-- 사진 올리기: 휴대폰 앨범이나 컴퓨터의 사진 파일을 골라요 -->
          <label class="btn ghost-button photo-button" for="donate-gallery">🖼️ 사진 올리기</label>
          <input id="donate-gallery" class="photo-input" type="file" accept="image/*" hidden />
          <img class="photo-preview" alt="나눔할 옷 사진 미리 보기" hidden />
          <button class="text-button photo-remove" type="button" hidden>사진 빼기</button>
        </div>
        <div class="camera-panel" hidden>
          <video class="camera-video" autoplay playsinline muted></video>
          <div class="camera-actions">
            <button class="btn camera-shot" type="button">📸 찍기</button>
            <button class="btn ghost-button camera-close" type="button">닫기</button>
          </div>
        </div>
        <p class="form-message">사진은 선택이에요. 옷만 찍고, 얼굴은 나오지 않게 해 주세요.</p>
        <button class="btn search-button" type="submit">🎁 나눔하기</button>
        <p class="form-message is-error" role="alert" hidden></p>
      </form>

      <p class="section-label">📒 ${hasNickname(me) ? safe(me) : "나"}의 기록</p>
      ${myRecordHtml(clothes, me)}

      <button class="text-button clear-button" type="button">연습 기록 모두 지우기</button>
    </article>
  `;

  // 예약하기 / 받았어요 / 취소 버튼 (화면 안의 버튼을 한 번에 살펴봐요)
  root.querySelector(".card").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    // 나눔 취소는 실수로 누르지 않게 두 번 눌러야 해요.
    if (button.dataset.action === "withdraw" && button.dataset.confirm !== "yes") {
      button.dataset.confirm = "yes";
      button.textContent = "정말 취소할까요? 한 번 더";
      return;
    }
    handleAction(root, state, button.dataset.action, button.dataset.id);
  });

  // 나눔하기 버튼
  const form = root.querySelector(".donate-form");
  const formMessage = root.querySelector(".donate-form .form-message.is-error");
  const submitButton = root.querySelector(".donate-form button[type='submit']");

  // 📷 사진: 찍거나 올리면 작게 줄여서 미리 보여 줘요.
  const photoPreview = root.querySelector(".photo-preview");
  const photoRemove = root.querySelector(".photo-remove");
  let photo = ""; // 줄인 사진 (없으면 빈 글자)

  function showPhoto(newPhoto) {
    photo = newPhoto;
    photoPreview.src = newPhoto;
    photoPreview.hidden = newPhoto === "";
    photoRemove.hidden = newPhoto === "";
  }

  // "사진 찍기"와 "사진 올리기" 둘 다 이 함수로 처리해요.
  async function usePhotoFile(photoInput) {
    const file = photoInput.files[0];
    photoInput.value = ""; // 같은 사진을 다시 골라도 동작하게 비워 둬요.
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      formMessage.textContent = "사진 파일만 올릴 수 있어요.";
      formMessage.hidden = false;
      return;
    }
    if (file.size > PHOTO_MAX_FILE) {
      formMessage.textContent = "사진이 너무 커요. 15MB보다 작은 사진으로 해 주세요.";
      formMessage.hidden = false;
      return;
    }

    formMessage.hidden = true; // 예전 오류 문구는 지워요.
    submitButton.disabled = true; // 사진을 줄이는 동안은 나눔하기를 잠깐 막아요.
    try {
      showPhoto(await shrinkPhoto(file));
    } catch (error) {
      formMessage.textContent = `${error.message} 다른 사진으로 해 볼까요?`;
      formMessage.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  }

  root.querySelectorAll(".photo-input").forEach((input) => {
    input.addEventListener("change", () => usePhotoFile(input));
  });

  photoRemove.addEventListener("click", () => showPhoto(""));

  // 📷 노트북 카메라
  const cameraPanel = root.querySelector(".camera-panel");
  const cameraVideo = root.querySelector(".camera-video");
  let cameraStream = null; // 켜져 있는 카메라 (꺼져 있으면 null)
  let cameraWatch = 0;     // 화면이 바뀌었는지 살펴보는 타이머

  function stopCamera() {
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    cameraVideo.srcObject = null;
    cameraPanel.hidden = true;
    clearInterval(cameraWatch);
  }

  function showCameraError(text) {
    formMessage.textContent = text;
    formMessage.hidden = false;
  }

  root.querySelector(".camera-open").addEventListener("click", async () => {
    // 화면 안에서 카메라를 켤 수 없는 곳(휴대폰에서 http 주소 등)에서는 카메라 앱을 열어요.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      root.querySelector("#donate-photo").click();
      return;
    }
    if (cameraStream) return; // 이미 켜져 있어요.

    formMessage.hidden = true;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
    } catch (error) {
      cameraStream = null;
      showCameraError(cameraErrorText(error));
      return;
    }
    cameraVideo.srcObject = cameraStream;
    cameraPanel.hidden = false;

    // 다른 탭으로 가서 이 화면이 사라지면 카메라를 꺼요. (카메라 불이 계속 켜져 있지 않게)
    cameraWatch = setInterval(() => {
      if (!cameraVideo.isConnected) stopCamera();
    }, 500);
  });

  root.querySelector(".camera-shot").addEventListener("click", () => {
    if (!cameraVideo.videoWidth) {
      showCameraError("카메라가 아직 준비 중이에요. 잠깐 뒤에 다시 눌러 주세요.");
      return;
    }
    showPhoto(snapshot(cameraVideo));
    formMessage.hidden = true;
    stopCamera();
  });

  root.querySelector(".camera-close").addEventListener("click", stopCamera);

  form.addEventListener("submit", (event) => {
    event.preventDefault(); // 페이지가 새로고침되지 않게 막아요.
    if (!hasNickname(me)) {
      renderWithNotice(root, state, '참여 랭킹 탭의 "나는 누구?"에서 별명을 먼저 정해 주세요.', true);
      return;
    }

    const name = root.querySelector("#donate-name").value;
    const category = root.querySelector("#donate-category").value;
    const size = Number(root.querySelector("#donate-size").value);
    const condition = root.querySelector("#donate-condition").value;

    const problem = checkDonation(name, category, size, condition);
    if (problem) {
      formMessage.textContent = problem;
      formMessage.hidden = false;
      root.querySelector("#donate-name").focus();
      return;
    }

    const emoji = CATEGORIES.find((c) => c.name === category).emoji;
    const newItem = { name: name.trim(), category, size, condition, emoji, giver: me };
    if (photo) newItem.photo = photo;
    const result = donate(newItem);
    if (result.error) return renderWithNotice(root, state, result.error, true);
    renderWithNotice(root, state, `"${result.item.name}" 나눔 완료! 친구가 예약하고 받아 가면 둘 다 점수를 받아요 🎁`, false);
  });

  // 연습 기록 지우기: 실수로 지우지 않게 두 번 눌러야 지워져요.
  const clearButton = root.querySelector(".clear-button");
  clearButton.addEventListener("click", () => {
    if (clearButton.dataset.confirm !== "yes") {
      clearButton.dataset.confirm = "yes";
      clearButton.textContent = "정말 지울까요? 한 번 더 누르세요";
      return;
    }
    clearPractice();
    renderWithNotice(root, state, "연습 기록을 모두 지웠어요. 예시 데이터는 그대로 남아 있어요.", false);
  });
}
