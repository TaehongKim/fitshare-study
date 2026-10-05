// 스마트 실측 모듈 자리: 실측 팀 학생이 이 파일을 중심으로 개발하면 됩니다.
export function renderMeasurement(root, state) {
  const hints = state.mockData.measurementHints;
  const schoolCodeText = state.schoolCode
    ? "현재 학교 코드: " + state.schoolCode
    : "현재 학교 코드가 아직 입력되지 않았어요.";

  root.innerHTML = "";

  const section = document.createElement("section");
  section.className = "module-card";

  const titleEl = document.createElement("h3");
  titleEl.className = "module-title";
  titleEl.textContent = "스마트 실측 모듈";

  const subtitleEl = document.createElement("p");
  subtitleEl.className = "module-subtitle";
  subtitleEl.textContent = "의류 촬영, 치수 추출 기능이 들어올 영역입니다.";

  const placeholderEl = document.createElement("div");
  placeholderEl.className = "placeholder-box";
  placeholderEl.innerHTML = "<strong>모듈 개발 상태:</strong> 개발 중 (UI 뼈대만 연결됨)";

  const schoolCodeEl = document.createElement("p");
  schoolCodeEl.className = "module-subtitle";
  schoolCodeEl.textContent = schoolCodeText;

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
  section.appendChild(schoolCodeEl);
  section.appendChild(listEl);

  root.appendChild(section);
}
