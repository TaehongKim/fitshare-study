// 참여 랭킹 모듈 자리: 게임화/랭킹 팀 학생이 이 파일을 확장하면 됩니다.
export function renderRanking(root, state) {
  const hints = state.mockData.rankingHints;

  root.innerHTML = "";

  const section = document.createElement("section");
  section.className = "module-card";

  const titleEl = document.createElement("h3");
  titleEl.className = "module-title";
  titleEl.textContent = "참여 랭킹 모듈";

  const subtitleEl = document.createElement("p");
  subtitleEl.className = "module-subtitle";
  subtitleEl.textContent = "참여 점수와 순위판 기능이 들어올 영역입니다.";

  const placeholderEl = document.createElement("div");
  placeholderEl.className = "placeholder-box";
  placeholderEl.innerHTML = "<strong>모듈 개발 상태:</strong> 개발 중 (집계 데이터 미연결)";

  const listEl = document.createElement("ul");
  listEl.className = "sample-list";
  hints.forEach((hint) => {
    const itemEl = document.createElement("li");
    itemEl.textContent = hint;
    listEl.appendChild(itemEl);
  });

  section.appendChild(titleEl);
  section.appendChild(subtitleEl);
  section.appendChild(placeholderEl);
  section.appendChild(listEl);

  root.appendChild(section);
}
