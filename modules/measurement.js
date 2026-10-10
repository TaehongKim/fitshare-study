// =========================================
// measurement.js — 📏 스마트 실측 모듈 (담당: 학생 A)
// ✅ 이 파일 안에서만 작업해요. 다른 모듈 파일은 고치지 않아요.
// ✅ 반드시 renderMeasurement(root, state) 함수를 export 해야 해요.
//   - root  : 내 화면을 그려 넣을 빈 상자
//   - state : 공용 기억 상자 (js/state.js)
//
// 내 몸에 맞는 옷 찾기 규칙
//  1) 키를 10 단위로 반올림해서 "키 호수"를 정해요. 예) 142cm → 140호
//  2) 몸무게 표로 "몸무게 호수"를 정해요. 예) 36kg → 150호
//  3) 둘 중 더 큰 호수를 내 사이즈로 정해요. (옷이 끼지 않게 넉넉하게)
//  4) 옷장에서 내 사이즈 ±10호인 옷만 찾아요.
//  5) 상의는 어깨너비도 비교해요.
//     옷 어깨가 내 어깨보다 작으면 빼고, 0~4cm 크면 "딱 맞아요", 그보다 크면 "넉넉해요"
// =========================================

import { mockClothes } from "../data/mockData.js";
import { updateStudent } from "../js/state.js";

const SIZE_GAP = 10;          // 내 사이즈에서 위아래로 몇 호까지 찾을지
const SHOULDER_GOOD_GAP = 4;  // 옷 어깨가 이만큼(cm)까지 크면 "딱 맞아요"

// 입력 칸마다 이름, 단위, 들어갈 수 있는 범위를 정해 둬요.
const FIELDS = [
  { key: "height", label: "키", unit: "cm", min: 80, max: 200 },
  { key: "weight", label: "몸무게", unit: "kg", min: 10, max: 120 },
  { key: "shoulder", label: "어깨너비", unit: "cm", min: 20, max: 60 },
];

// 몸무게 표: 몸무게가 maxWeight 이하이면 그 호수예요.
const WEIGHT_TABLE = [
  { maxWeight: 14, size: 90 },
  { maxWeight: 17, size: 100 },
  { maxWeight: 20, size: 110 },
  { maxWeight: 23, size: 120 },
  { maxWeight: 27, size: 130 },
  { maxWeight: 33, size: 140 },
  { maxWeight: 41, size: 150 },
  { maxWeight: 50, size: 160 },
];
const BIGGEST_SIZE = 170; // 표보다 무거우면 이 호수예요.

// 키로 호수를 정해요. 예) 142cm → 140호, 145cm → 150호
function sizeFromHeight(height) {
  return Math.round(height / 10) * 10;
}

// 몸무게 표에서 호수를 찾아요. 예) 33kg → 140호, 36kg → 150호
function sizeFromWeight(weight) {
  const row = WEIGHT_TABLE.find((r) => weight <= r.maxWeight);
  return row ? row.size : BIGGEST_SIZE;
}

// 입력값 하나를 검사해요. 문제가 있으면 오류 문장을, 괜찮으면 빈 글자("")를 돌려줘요.
function checkValue(field, text) {
  if (String(text).trim() === "") return `${field.label}를 입력해 주세요.`;
  const value = Number(text);
  if (Number.isNaN(value)) return `${field.label}는 숫자로 입력해 주세요.`;
  if (value < field.min || value > field.max) {
    return `${field.label}를 다시 확인해 주세요. (${field.min}~${field.max}${field.unit})`;
  }
  return "";
}

// 옷 호수가 내 사이즈와 얼마나 맞는지 알려 줘요. 너무 크거나 작으면 null이에요.
function sizeFitOf(itemSize, mySize) {
  const diff = itemSize - mySize;
  if (diff === 0) return { order: 1, label: "딱 맞아요", badge: "badge-mock" };
  if (diff > 0 && diff <= SIZE_GAP) return { order: 2, label: "조금 커요", badge: "badge-dev" };
  if (diff < 0 && diff >= -SIZE_GAP) return { order: 3, label: "조금 작아요", badge: "badge-dev" };
  return null;
}

// 상의 어깨너비를 내 어깨와 비교해요.
// 상의가 아니거나 어깨 정보가 없으면 비교하지 않아요.
function shoulderFitOf(item, myShoulder) {
  if (item.category !== "상의" || typeof item.shoulder !== "number") {
    return { ok: true, label: "" };
  }
  const diff = item.shoulder - myShoulder;
  if (diff < 0) return { ok: false, label: "" };
  if (diff <= SHOULDER_GOOD_GAP) return { ok: true, label: "어깨 딱 맞아요" };
  return { ok: true, label: "어깨가 넉넉해요" };
}

// 내 몸(키, 몸무게, 어깨너비)에 맞는 옷을 찾아서, 사이즈가 딱 맞는 옷부터 줄 세워요.
// 다른 데이터로 테스트할 수 있게 export 해 뒀어요.
export function findClothes(clothes, body) {
  const heightSize = sizeFromHeight(body.height);
  const weightSize = sizeFromWeight(body.weight);
  const mySize = Math.max(heightSize, weightSize);

  const matches = [];
  let tooNarrow = 0; // 사이즈는 맞지만 어깨가 작아서 뺀 상의 수

  for (const item of clothes) {
    const sizeFit = sizeFitOf(item.size, mySize);
    if (!sizeFit) continue;
    const shoulderFit = shoulderFitOf(item, body.shoulder);
    if (!shoulderFit.ok) {
      tooNarrow += 1;
      continue;
    }
    matches.push({ item, sizeFit, shoulderFit });
  }

  matches.sort((a, b) => a.sizeFit.order - b.sizeFit.order);
  return { heightSize, weightSize, mySize, matches, tooNarrow };
}

// 찾은 옷 하나를 카드 모양 HTML로 바꿔요.
function clothesCard(match) {
  const { item, sizeFit, shoulderFit } = match;
  const shoulderText = typeof item.shoulder === "number" ? ` · 어깨 ${item.shoulder}cm` : "";
  return `
    <li class="item">
      <div class="item-emoji">${item.emoji}</div>
      <div class="item-name">${item.name}</div>
      <div class="item-meta">${item.category} · ${item.size}호${shoulderText} · ${item.condition}</div>
      <span class="badge ${sizeFit.badge}">${sizeFit.label}</span>
      ${shoulderFit.label ? `<span class="badge badge-mock">${shoulderFit.label}</span>` : ""}
    </li>
  `;
}

// 내 사이즈를 어떻게 정했는지 설명하는 문장을 만들어요.
function sizeReason(result) {
  if (result.heightSize === result.weightSize) {
    return `키·몸무게 모두 ${result.mySize}호 → <strong>${result.mySize}호</strong>가 내 사이즈예요.`;
  }
  return `키로는 ${result.heightSize}호, 몸무게로는 ${result.weightSize}호 → 더 큰 <strong>${result.mySize}호</strong>가 내 사이즈예요.`;
}

// 찾은 결과를 HTML로 만들어요.
function resultHtml(body) {
  const result = findClothes(mockClothes, body);
  const narrowText = result.tooNarrow > 0 ? ` (어깨가 작아서 뺀 상의 ${result.tooNarrow}벌)` : "";

  if (result.matches.length === 0) {
    return `
      <p class="result-summary">${sizeReason(result)}</p>
      <p class="form-message">지금 옷장에는 맞는 옷이 없어요${narrowText}. 새 옷이 들어오면 알려 줄게요!</p>
    `;
  }

  return `
    <p class="result-summary">
      ${sizeReason(result)}<br />
      옷장 ${mockClothes.length}벌 중 <strong>${result.matches.length}벌</strong>을 찾았어요!${narrowText}
    </p>
    <ul class="item-grid">
      ${result.matches.map(clothesCard).join("")}
    </ul>
  `;
}

// 입력 칸 하나를 HTML로 만들어요.
function fieldHtml(field, value) {
  return `
    <div>
      <label class="field-label" for="input-${field.key}">${field.label} (${field.unit})</label>
      <input id="input-${field.key}" class="text-input" type="number" inputmode="decimal"
             min="${field.min}" max="${field.max}" step="0.1" value="${value}" />
    </div>
  `;
}

export function renderMeasurement(root, state) {
  const student = state.student;
  // 처음 값이 올바른 것만 입력 칸에 미리 넣어 둬요.
  const startValues = FIELDS.map((field) => (checkValue(field, student[field.key] ?? "") ? "" : student[field.key]));
  const startOk = startValues.every((value) => value !== "");

  root.innerHTML = `
    <article class="card">
      <h2 class="card-title">📏 스마트 실측</h2>
      <p class="card-desc">내 키·몸무게·어깨너비를 넣으면 스마트 옷장에서 맞는 옷을 찾아 줘요.</p>

      <p class="section-label">내 몸에 맞는 옷 찾기 <span class="badge badge-mock">예시 옷장</span></p>
      <form class="search-form" novalidate>
        <div class="field-grid">
          ${FIELDS.map((field, index) => fieldHtml(field, startValues[index])).join("")}
        </div>
        <button class="btn search-button" type="submit">🔍 옷 찾기</button>
        <p class="form-message is-error" role="alert" hidden></p>
      </form>
      <div class="search-result">${startOk ? resultHtml(student) : ""}</div>

      <p class="section-label">앞으로 만들 기능</p>
      <div class="placeholder">
        <div class="placeholder-head">
          <span class="badge badge-dev">🚧 개발 중</span>
          <span class="owner">담당: 학생 A</span>
        </div>
        <p>이 자리에 <strong>격자 실측</strong>과 <strong>옷 촬영</strong> 기능이 들어올 거예요.</p>
        <ul class="todo-list">
          <li>1cm 격자 위에서 옷 크기·어깨너비 재기</li>
          <li>잰 크기로 옷의 호수 정하기</li>
          <li>옷 사진 고르기 버튼 만들기</li>
        </ul>
      </div>
    </article>
  `;

  const form = root.querySelector(".search-form");
  const message = root.querySelector(".form-message");
  const result = root.querySelector(".search-result");

  // "옷 찾기" 버튼을 누르거나 Enter를 치면 실행돼요.
  form.addEventListener("submit", (event) => {
    event.preventDefault(); // 페이지가 새로고침되지 않게 막아요.

    // 입력 칸을 위에서부터 검사하고, 처음 찾은 문제를 알려 줘요.
    const body = {};
    for (const field of FIELDS) {
      const input = root.querySelector(`#input-${field.key}`);
      const problem = checkValue(field, input.value);
      if (problem) {
        message.textContent = problem;
        message.hidden = false;
        result.innerHTML = "";
        input.focus();
        return;
      }
      body[field.key] = Number(input.value);
    }

    message.hidden = true;
    updateStudent(body); // 다른 탭도 바뀐 몸 정보를 쓸 수 있게 저장해요.
    result.innerHTML = resultHtml(body);
  });
}
