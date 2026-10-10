// =========================================
// recommendation.js — 👕 맞춤 추천 모듈 (담당: 학생 B)
// ✅ 이 파일 안에서만 작업해요. 다른 모듈 파일은 고치지 않아요.
// ✅ 반드시 renderRecommendation(root, state) 함수를 export 해야 해요.
//   - root  : 내 화면을 그려 넣을 빈 상자
//   - state : 공용 기억 상자 (js/state.js)
// =========================================

import { mockClothes, mockOutfits } from "../data/mockData.js";

// 키로 옷 호수를 짐작하는 아주 간단한 예시 규칙
// 예) 142cm → 140호 (10 단위로 반올림)
function guessSize(height) {
  return Math.round(height / 10) * 10;
}

// id로 옷 정보를 찾아요
function findClothes(id) {
  return mockClothes.find((item) => item.id === id);
}

// 코디 하나를 카드 모양 HTML로 바꿔 주는 함수
function outfitCard(outfit) {
  const items = outfit.itemIds.map(findClothes);
  const emojis = items.map((item) => item.emoji).join(" ");
  const names = items.map((item) => `${item.name}(${item.size}호)`).join(" + ");

  return `
    <li class="item">
      <div class="item-meta">${outfit.mood}</div>
      <div class="item-name">${outfit.title}</div>
      <div class="item-emoji">${emojis}</div>
      <div class="item-meta">${names}</div>
    </li>
  `;
}

export function renderRecommendation(root, state) {
  const student = state.student;
  const size = guessSize(student.height);

  root.innerHTML = `
    <article class="card">
      <h2 class="card-title">👕 맞춤 추천</h2>
      <p class="card-desc">내 몸에 맞는 옷을 골라 어울리는 코디로 추천해요.</p>

      <div class="placeholder">
        <div class="placeholder-head">
          <span class="badge badge-dev">🚧 개발 중</span>
          <span class="owner">담당: 학생 B</span>
        </div>
        <p>이 자리에 <strong>사이즈 매칭</strong>과 <strong>코디 추천</strong> 기능이 들어올 거예요.</p>
        <ul class="todo-list">
          <li>키·몸무게로 사이즈를 더 정확하게 계산하기</li>
          <li>내 사이즈에 맞는 옷만 골라내기</li>
          <li>날씨·활동에 따라 코디 고르기</li>
        </ul>
      </div>

      <p class="section-label">${student.nickname}의 추천 사이즈 <span class="badge badge-mock">예시 규칙</span></p>
      <div class="stat-row">
        <div class="stat">
          <div class="stat-value">${student.height}cm</div>
          <div class="stat-label">내 키</div>
        </div>
        <div class="stat">
          <div class="stat-value">${size}호</div>
          <div class="stat-label">추천 사이즈</div>
        </div>
      </div>

      <p class="section-label">오늘의 추천 코디 <span class="badge badge-mock">예시 데이터</span></p>
      <ul class="item-grid">
        ${mockOutfits.map(outfitCard).join("")}
      </ul>
    </article>
  `;
}
