import { mockData } from "../data/mockData.js";
import { createAppState } from "./state.js";
import { renderMeasurement } from "../modules/measurement.js";
import { renderRecommendation } from "../modules/recommendation.js";
import { renderRanking } from "../modules/ranking.js";

// 탭 이름과 모듈 렌더 함수를 연결합니다.
const rendererMap = {
  measurement: renderMeasurement,
  recommendation: renderRecommendation,
  ranking: renderRanking,
};

const appState = createAppState("measurement");

const processListEl = document.getElementById("process-list");
const moduleRootEl = document.getElementById("module-root");
const entryFormEl = document.getElementById("school-entry-form");
const schoolCodeEl = document.getElementById("school-code");
const entryMessageEl = document.getElementById("entry-message");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));

function init() {
  renderProcessCards();
  bindEvents();

  // 상태가 바뀔 때마다 현재 탭을 다시 그림니다.
  appState.subscribe(() => {
    updateTabStyle();
    renderCurrentTab();
  });

  updateTabStyle();
  renderCurrentTab();
}

function bindEvents() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabKey = button.dataset.tab;
      appState.setActiveTab(tabKey);
    });
  });

  entryFormEl.addEventListener("submit", (event) => {
    event.preventDefault();

    const code = schoolCodeEl.value.trim();
    if (!code) {
      entryMessageEl.textContent = "학교 코드를 입력해 주세요.";
      return;
    }

    appState.setSchoolCode(code);
    entryMessageEl.textContent = "학교 코드 " + code + " 확인! 이제 모듈 테스트를 진행해 보세요.";
  });
}

function renderProcessCards() {
  processListEl.innerHTML = "";

  mockData.processSteps.forEach((step) => {
    const card = document.createElement("article");
    card.className = "process-card";

    const titleEl = document.createElement("h3");
    titleEl.textContent = step.title;

    const descEl = document.createElement("p");
    descEl.textContent = step.description;

    card.appendChild(titleEl);
    card.appendChild(descEl);

    processListEl.appendChild(card);
  });
}

function updateTabStyle() {
  const { activeTab } = appState.getState();

  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle("is-active", isActive);
  });
}

function renderCurrentTab() {
  const state = appState.getState();
  const renderFn = rendererMap[state.activeTab];

  if (!renderFn) {
    moduleRootEl.innerHTML = "<p>알 수 없는 탭입니다.</p>";
    return;
  }

  renderFn(moduleRootEl, {
    ...state,
    mockData,
  });
}

init();
