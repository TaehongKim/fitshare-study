// =========================================
// ranking.js — 🏆 참여 랭킹 모듈 (담당: 학생 C)
// ✅ 이 파일 안에서만 작업해요. 다른 모듈 파일은 고치지 않아요.
// ✅ 반드시 renderRanking(root, state) 함수를 export 해야 해요.
//
// 랭킹 규칙 (규칙/랭킹.md)
//  1) 옷을 기부한 사람 +1점
//  2) 옷을 받은 사람 +1점
//  3) 1달마다 랭킹 초기화 → 이번 달 기록만 점수에 넣어요
//  4) 한 사람이 하루에 받을 수 있는 점수는 최대 3점
//  5) 받은 옷을 다시 나누면 그 나눔은 점수에 넣지 않아요
// =========================================

import { getShareLogs, today as getToday } from "../js/store.js";
import { updateStudent } from "../js/state.js";

const POINT_PER_SHARE = 1; // 나눔 한 번에 받는 점수
const DAILY_MAX = 3;       // 하루 최대 점수
const MEDALS = ["🥇", "🥈", "🥉"];
const HELPER = { name: "토리", emoji: "🐿️" }; // 도우미 캐릭터

// 글자 속 <, > 같은 기호를 안전한 글자로 바꿔요.
// 나중에 친구들이 이름을 직접 입력해도 화면이 깨지지 않게 해 줘요.
function safe(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// 이름 뒤에 붙는 말을 받침에 맞게 골라요.
// 예) withJosa("꼬마별", "은는") → "꼬마별은", withJosa("새싹이", "은는") → "새싹이는"
function withJosa(word, pair) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasBatchim ? pair[0] : pair[1]);
}

// "2026-10-20" → "2026-10" (몇 년 몇 월인지만 꺼내요)
function monthOf(date) {
  return date.slice(0, 7);
}

// "2026-10-07" → "10/7"
function shortDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "날짜 없음";
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
}

// 오늘부터 다음 달 1일(랭킹 초기화 날)까지 며칠 남았는지 세요.
function daysUntilReset(today) {
  const [year, month, day] = today.split("-").map(Number);
  const oneDay = 24 * 60 * 60 * 1000;
  // Date.UTC는 달을 0부터 세요. 그래서 month를 그대로 넣으면 "다음 달"이 돼요.
  return Math.round((Date.UTC(year, month, 1) - Date.UTC(year, month - 1, day)) / oneDay);
}

// 기록이 올바른 모양인지 검사해요. 문제가 있으면 이유를, 없으면 빈 글자("")를 돌려줘요.
function checkLog(log) {
  if (!log || !/^\d{4}-\d{2}-\d{2}$/.test(log.date)) return "날짜가 잘못된 기록이에요.";
  if (!log.giver || !log.receiver) return "준 사람이나 받은 사람이 비어 있어요.";
  if (!log.itemId) return "어떤 옷을 나눴는지 적혀 있지 않아요.";
  if (log.giver === log.receiver) return "자기 자신에게 나눈 기록이에요.";
  return "";
}

// 입력한 별명을 검사해요. 문제가 있으면 오류 문장을, 괜찮으면 빈 글자("")를 돌려줘요.
function checkNickname(text) {
  const name = String(text).trim();
  if (name === "") return "별명을 입력해 주세요.";
  if (name.length > 10) return "별명은 10글자까지 써 주세요.";
  if (!/^[가-힣a-zA-Z0-9]+$/.test(name)) return "별명은 띄어쓰기 없이 한글·영어·숫자로 써 주세요.";
  return "";
}

// 등수를 글자로 바꿔요. 같은 등수가 여럿이면 "공동"을 붙여요. 예) "공동 2등"
function rankLabel(rows, row) {
  const together = rows.filter((other) => other.rank === row.rank).length > 1;
  return `${together ? "공동 " : ""}${row.rank}등`;
}

// 나눔 기록에 나온 모든 이름을 가나다순으로 모아요. (별명 입력 칸의 추천 목록)
function allNames(logs) {
  const names = logs.flatMap((log) => [log?.giver, log?.receiver]).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ko"));
}

// 나눔 기록으로 이번 달 랭킹을 계산해요.
// 다른 데이터로 테스트할 수 있게 export 해 뒀어요.
export function calculateRanking(logs, today) {
  const thisMonth = monthOf(today);
  const points = {};        // 이름 → 이번 달 점수
  const dailyPoints = {};   // "이름|날짜" → 그날 받은 점수
  const receivedItems = {}; // 옷 번호 → 그 옷을 받은 사람들
  const excluded = [];      // 점수에 안 들어간 기록과 이유
  let shareCount = 0;       // 이번 달에 인정된 나눔 횟수

  // 날짜 순서대로 하나씩 살펴봐요. (원래 목록은 그대로 두고 복사본을 정렬)
  const sorted = [...logs].sort((a, b) => String(a?.date).localeCompare(String(b?.date)));

  for (const log of sorted) {
    const problem = checkLog(log);
    if (problem) {
      excluded.push({ log, reason: problem });
      continue;
    }

    // 규칙 5: 내가 받은 옷은 다시 나눌 수 없어요.
    const receivers = receivedItems[log.itemId] || [];
    if (receivers.includes(log.giver)) {
      if (monthOf(log.date) === thisMonth) {
        excluded.push({ log, reason: "받은 옷은 다시 나눌 수 없어요." });
      }
      continue;
    }
    receivedItems[log.itemId] = [...receivers, log.receiver];

    // 규칙 3: 이번 달 기록만 점수에 넣어요.
    if (monthOf(log.date) !== thisMonth) continue;
    shareCount += 1;

    // 규칙 1, 2: 준 사람과 받은 사람 모두 점수를 받아요. (규칙 4: 하루 최대 3점)
    for (const name of [log.giver, log.receiver]) {
      const key = `${name}|${log.date}`;
      const pointsThatDay = dailyPoints[key] || 0;
      if (pointsThatDay >= DAILY_MAX) {
        excluded.push({ log, reason: `${withJosa(name, "은는")} 이날 이미 ${DAILY_MAX}점을 받았어요.` });
        continue;
      }
      dailyPoints[key] = pointsThatDay + POINT_PER_SHARE;
      points[name] = (points[name] || 0) + POINT_PER_SHARE;
    }
  }

  // 점수가 높은 순서로 줄 세워요. 점수가 같으면 이름 가나다순이에요.
  const rows = Object.entries(points)
    .map(([name, point]) => ({ name, point }))
    .sort((a, b) => b.point - a.point || a.name.localeCompare(b.name, "ko"));

  // 점수가 같으면 같은 등수예요. 예) 1등, 2등, 2등, 4등
  rows.forEach((row, index) => {
    const before = rows[index - 1];
    row.rank = before && before.point === row.point ? before.rank : index + 1;
  });

  return { rows, excluded, shareCount, dailyPoints };
}

// 도우미 캐릭터 토리가 할 말들을 만들어요.
function helperMessages(result, me, today) {
  const messages = [];
  const myRow = result.rows.find((row) => row.name === me);
  const month = Number(today.split("-")[1]);
  const nextMonth = month === 12 ? 1 : month + 1;

  if (!myRow) {
    messages.push(`${withJosa(me, "은는")} 이번 달에 아직 점수가 없어. 작아진 옷을 나눠 볼까? 🧺`);
  } else if (myRow.rank === 1) {
    messages.push(`우와! ${withJosa(me, "이가")} 지금 1등이야! 🎉`);
  } else {
    const gap = result.rows[0].point - myRow.point;
    messages.push(`${withJosa(me, "은는")} 지금 ${rankLabel(result.rows, myRow)}이야! 1등까지 ${gap}점 남았어 💪`);
  }

  const todayPoints = result.dailyPoints[`${me}|${today}`] || 0;
  const left = DAILY_MAX - todayPoints;
  messages.push(
    left > 0
      ? `오늘은 ${todayPoints}점 모았어. 하루 ${DAILY_MAX}점까지니까 ${left}점 더 모을 수 있어!`
      : `오늘 모을 수 있는 ${DAILY_MAX}점을 다 모았어! 내일 또 만나 👋`
  );
  messages.push(`${nextMonth}월 1일에 랭킹이 새로 시작돼. ${daysUntilReset(today)}일 남았어! 🗓️`);
  messages.push("친구한테 받은 옷은 다시 나눌 수 없어. 원래 내 옷이었던 걸 나눠 줘! 🙅");
  messages.push("옷을 주는 친구도, 받는 친구도 1점씩 받아. 나눔은 모두에게 좋으니까! 🤝");
  return messages;
}

// 랭킹 한 줄을 HTML로 바꿔요.
function rankRow(row, maxPoint, me) {
  const medal = MEDALS[row.rank - 1] || row.rank;
  const percent = Math.round((row.point / maxPoint) * 100);
  const isMe = row.name === me;

  return `
    <li class="rank-row${isMe ? " is-me" : ""}">
      <span class="rank-medal">${medal}</span>
      <div>
        <div class="rank-name">${safe(row.name)}${isMe ? ' <span class="badge badge-mock">나</span>' : ""}</div>
        <div class="rank-bar"><div class="rank-bar-fill" style="width: ${percent}%"></div></div>
      </div>
      <span class="rank-point">${row.point}점</span>
    </li>
  `;
}

// 점수에 안 들어간 기록 한 줄을 HTML로 바꿔요.
function excludedRow(item) {
  const log = item.log || {};
  return `
    <li>
      ${shortDate(log.date)} · ${safe(log.giver || "?")} → ${safe(log.receiver || "?")}
      <span class="excluded-reason">${safe(item.reason)}</span>
    </li>
  `;
}

export function renderRanking(root, state) {
  const today = getToday(); // 오늘 날짜 (예: "2026-10-10")
  const logs = getShareLogs(); // 예시 기록 + 나눔 탭에서 가져가기 한 기록
  const me = state.student.nickname;
  const month = Number(today.split("-")[1]);
  const result = calculateRanking(logs, today);
  const messages = helperMessages(result, me, today);

  // 내 점수, 내 순위, 오늘 모은 점수
  const myRow = result.rows.find((row) => row.name === me);
  const myPoint = myRow ? myRow.point : 0;
  const myRank = myRow ? rankLabel(result.rows, myRow) : "아직 없음";
  const myTodayPoints = result.dailyPoints[`${me}|${today}`] || 0;
  const nameOptions = allNames(logs)
    .map((name) => `<option value="${safe(name)}"></option>`)
    .join("");

  const rankingHtml = result.rows.length
    ? `<ol class="rank-list">${result.rows.map((row) => rankRow(row, result.rows[0].point, me)).join("")}</ol>`
    : `<div class="placeholder"><p>이번 달은 아직 나눔 기록이 없어요.</p></div>`;

  const excludedHtml = result.excluded.length
    ? `<ul class="excluded-list">${result.excluded.map(excludedRow).join("")}</ul>`
    : `<p class="card-desc">모든 기록이 규칙을 잘 지켰어요 👍</p>`;

  root.innerHTML = `
    <article class="card">
      <h2 class="card-title">🏆 참여 랭킹</h2>
      <p class="card-desc">${safe(state.school.name)} ${month}월 나눔 랭킹이에요. 옷을 주고받으면 점수가 쌓여요!</p>

      <p class="section-label">내 점수</p>
      <form class="me-form" novalidate>
        <label class="field-label" for="me-input">나는 누구? (별명)</label>
        <div class="input-row">
          <input id="me-input" class="text-input" type="text" list="me-names" maxlength="10"
                 autocomplete="off" value="${safe(me)}" />
          <button class="btn" type="submit">내 점수 보기</button>
        </div>
        <datalist id="me-names">${nameOptions}</datalist>
        <p class="form-message is-error" role="alert" hidden></p>
      </form>
      <div class="stat-row">
        <div class="stat">
          <div class="stat-value">${myPoint}점</div>
          <div class="stat-label">${safe(me)}의 이번 달 점수</div>
        </div>
        <div class="stat">
          <div class="stat-value">${myRank}</div>
          <div class="stat-label">내 순위</div>
        </div>
      </div>
      <p class="form-message">오늘 모은 점수: ${myTodayPoints}점 / 하루 최대 ${DAILY_MAX}점</p>

      <div class="helper">
        <div>
          <div class="helper-avatar" aria-hidden="true">${HELPER.emoji}</div>
          <div class="helper-name">${HELPER.name}</div>
        </div>
        <div class="helper-bubble">
          <p class="helper-text" aria-live="polite">${safe(messages[0])}</p>
          <button class="helper-next" type="button">${HELPER.name}야, 다른 말도 해 줘 ▶</button>
        </div>
      </div>

      <p class="section-label">${month}월 현황 <span class="badge badge-mock">예시 데이터</span></p>
      <div class="stat-row">
        <div class="stat">
          <div class="stat-value">${result.shareCount}번</div>
          <div class="stat-label">이번 달 나눔</div>
        </div>
        <div class="stat">
          <div class="stat-value">${result.rows.length}명</div>
          <div class="stat-label">참여한 친구</div>
        </div>
      </div>

      <p class="section-label">${month}월 순위</p>
      ${rankingHtml}

      <p class="section-label">점수 규칙</p>
      <ul class="rule-list">
        <li>🎁 옷을 기부하면 +${POINT_PER_SHARE}점</li>
        <li>🤲 옷을 받아도 +${POINT_PER_SHARE}점</li>
        <li>📅 하루에 최대 ${DAILY_MAX}점까지</li>
        <li>🗓️ 매달 1일에 랭킹이 새로 시작</li>
        <li>🙅 받은 옷은 다시 나눌 수 없어요</li>
      </ul>

      <p class="section-label">점수에 안 들어간 기록</p>
      ${excludedHtml}
    </article>
  `;

  // 버튼을 누르면 토리가 다음 말을 해요. 마지막 말 다음에는 처음으로 돌아가요.
  let messageIndex = 0;
  const helperText = root.querySelector(".helper-text");
  root.querySelector(".helper-next").addEventListener("click", () => {
    messageIndex = (messageIndex + 1) % messages.length;
    helperText.textContent = messages[messageIndex];
  });

  // "내 점수 보기"를 누르면 별명을 바꾸고 랭킹을 다시 그려요.
  // 같은 기기에서 다른 친구도 자기 별명을 넣어 점수를 볼 수 있어요.
  const meForm = root.querySelector(".me-form");
  const meInput = root.querySelector("#me-input");
  const meMessage = root.querySelector(".me-form .form-message");
  meForm.addEventListener("submit", (event) => {
    event.preventDefault(); // 페이지가 새로고침되지 않게 막아요.
    const problem = checkNickname(meInput.value);
    if (problem) {
      meMessage.textContent = problem;
      meMessage.hidden = false;
      meInput.focus();
      return;
    }
    updateStudent({ nickname: meInput.value.trim() });
    renderRanking(root, state);
  });
}
