// 맞춤 추천 모듈 자리: 추천 알고리즘 팀 학생이 이 파일을 확장하면 됩니다.
export function renderRecommendation(root, state) {
  const hints = state.mockData.recommendationHints;

  root.innerHTML = "";

  const section = document.createElement("section");
  section.className = "module-card";

  const titleEl = document.createElement("h3");
  titleEl.className = "module-title";
  titleEl.textContent = "맞춤 추천 모듈";

  const subtitleEl = document.createElement("p");
  subtitleEl.className = "module-subtitle";
  subtitleEl.textContent = "신체 데이터 기반 코디 추천 기능이 들어올 영역입니다.";

  const placeholderEl = document.createElement("div");
  placeholderEl.className = "placeholder-box";
  placeholderEl.innerHTML = "<strong>모듈 개발 상태:</strong> 개발 중 (추천 로직 미연결)";

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
