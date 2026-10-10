// =========================================
// app.js — 모듈들을 화면에 연결해 주는 "교통정리" 파일
// 모듈 담당 학생은 이 파일을 고치지 않아도 돼요!
//
// 하는 일
// 1) 학교 이름으로 입장하게 한다 (입장해야 탭이 보여요)
// 2) 탭을 누르면 주소 끝(#measurement 등)을 바꾼다
// 3) 주소에 맞는 모듈의 render 함수를 불러 화면에 그린다
// =========================================

import { state, setCurrentTab, setSchool } from "./state.js";
import { findSchool, saveSchoolName, loadSchoolName, forgetSchoolName } from "./school.js";
import { renderMeasurement } from "../modules/measurement.js";
import { renderRecommendation } from "../modules/recommendation.js";
import { renderSharing } from "../modules/sharing.js";
import { renderRanking } from "../modules/ranking.js";

// 탭 이름과 그리는 함수를 짝지은 표예요.
const TABS = {
  measurement: renderMeasurement,
  recommendation: renderRecommendation,
  sharing: renderSharing,
  ranking: renderRanking,
};
const FIRST_TAB = "measurement";

// index.html에서 필요한 요소들을 찾아 둬요.
const root = document.getElementById("module-root");
const tabButtons = document.querySelectorAll(".tab");
const schoolBadge = document.getElementById("school-badge");
const gate = document.getElementById("school-gate");
const gateForm = document.getElementById("school-form");
const gateInput = document.getElementById("school-code");
const gateMessage = document.getElementById("school-message");
const tabsNav = document.getElementById("tabs");
const main = document.getElementById("main");

// 원하는 탭을 화면에 보여 주는 함수
function showTab(tabId) {
  // 표에 없는 이름이면 첫 번째 탭을 보여 줘요.
  if (!TABS[tabId]) {
    tabId = FIRST_TAB;
  }
  setCurrentTab(tabId);

  // 선택된 탭 버튼만 초록색이 되도록 표시해요.
  tabButtons.forEach((button) => {
    const selected = button.dataset.tab === tabId;
    button.setAttribute("aria-selected", String(selected));
  });

  // 모듈 영역을 비우고, 해당 모듈에게 그려 달라고 부탁해요.
  root.innerHTML = "";
  try {
    TABS[tabId](root, state);
  } catch (error) {
    // 한 모듈에 오류가 나도 다른 탭은 계속 쓸 수 있게 막아 줘요.
    console.error(`[${tabId}] 모듈에서 오류가 났어요:`, error);
    root.innerHTML = `
      <article class="card error-card">
        <h2 class="card-title">😵 이 모듈에서 오류가 났어요</h2>
        <p>다른 탭은 괜찮아요. F12 → Console에서 빨간 글씨를 확인해 보세요.</p>
      </article>
    `;
  }
}

// 주소 끝의 #값 읽기 (예: "#ranking" → "ranking")
function tabFromAddress() {
  return location.hash.replace("#", "");
}

// 학교에 입장해요: 학교 입력 화면을 숨기고 탭과 모듈을 보여 줘요.
function enterSchool(school) {
  setSchool(school);
  saveSchoolName(school.name);
  schoolBadge.textContent = `🎒 ${school.name} · 바꾸기`;
  schoolBadge.hidden = false;
  gate.hidden = true;
  tabsNav.hidden = false;
  main.hidden = false;
  showTab(tabFromAddress());
}

// 학교에서 나가요: 다시 학교 입력 화면을 보여 줘요.
function leaveSchool() {
  setSchool(null);
  forgetSchoolName();
  schoolBadge.hidden = true;
  tabsNav.hidden = true;
  main.hidden = true;
  root.innerHTML = "";
  gateInput.value = "";
  gateMessage.hidden = true;
  gate.hidden = false;
  gateInput.focus();
}

// "입장하기" 버튼을 누르거나 Enter를 치면 학교 이름을 검사해요.
gateForm.addEventListener("submit", (event) => {
  event.preventDefault(); // 페이지가 새로고침되지 않게 막아요.
  const result = findSchool(gateInput.value);
  if (result.error) {
    gateMessage.textContent = result.error;
    gateMessage.hidden = false;
    gateInput.focus();
    return;
  }
  gateMessage.hidden = true;
  enterSchool(result.school);
});

// 헤더의 학교 이름을 누르면 학교를 바꿀 수 있어요.
schoolBadge.addEventListener("click", leaveSchool);

// 탭 버튼을 누르면 주소만 바꿔요. → 아래 hashchange가 화면을 바꿔 줘요.
// 이렇게 하면 새로고침해도 보고 있던 탭이 그대로 남아요.
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    location.hash = button.dataset.tab;
  });
});

window.addEventListener("hashchange", () => {
  if (state.school) {
    showTab(tabFromAddress());
  }
});

// 처음 열었을 때: 기억해 둔 학교가 있으면 바로 입장해요.
// 없으면 index.html에 있는 학교 입력 화면이 그대로 보여요.
const saved = findSchool(loadSchoolName());
if (saved.school) {
  enterSchool(saved.school);
}
