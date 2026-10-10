import { mockData } from '../data/mockData.js';

// 추천 점수는 학생이 쉽게 비교하도록 항상 1~10점으로 계산합니다.
const SCORE = { size: 4, season: 2, category: 2, style: 1, condition: 1 };
let savedItems = new Set();

export function renderRecommendation(root, state) {
  const data = mockData.recommendation;
  root.dataset.module = 'recommendation';
  root.innerHTML = `
    <section class="recommendation-panel">
      <div class="recommendation-intro">
        <div class="module-emoji">${data.emoji}</div>
        <div><h3>${data.title}</h3><p>${data.description}</p><span class="module-tag">${data.tag}</span></div>
      </div>
      <div class="recommendation-filters" aria-label="추천 조건 선택">
        <label>옷을 입을 사람<select data-filter="gender"><option value="전체">전체</option><option value="남학생">남학생</option><option value="여학생">여학생</option></select></label>
        <label>내 사이즈<select data-filter="size"><option value="150">150</option><option value="145">145</option><option value="155">155</option></select></label>
        <label>계절<select data-filter="season"><option value="봄">봄</option><option value="여름">여름</option></select></label>
        <label>옷 종류<select data-filter="category"><option value="전체">전체</option><option value="상의">상의</option><option value="하의">하의</option><option value="외투">외투</option></select></label>
        <label>스타일<select data-filter="style"><option value="전체">전체</option><option value="편한 스타일">편한 스타일</option><option value="활동적인 스타일">활동적인 스타일</option></select></label>
        <label>색상<select data-filter="color"><option value="전체">전체</option><option value="밝은 색">밝은 색</option><option value="어두운 색">어두운 색</option></select></label>
      </div>
      <div class="recommendation-heading"><h4>나에게 잘 맞는 코디 <span>TOP 3</span></h4><p>조건을 바꾸면 추천도 달라져요.</p></div>
      <div class="recommendation-list" data-recommendation-list></div>
    </section>`;

  const update = () => {
    const filters = Object.fromEntries([...root.querySelectorAll('[data-filter]')].map((select) => [select.dataset.filter, select.value]));
    const ranked = data.items.filter((item) => filters.gender === '전체' || item.gender === filters.gender).map((item) => scoreItem(item, filters)).sort((a, b) => b.score - a.score || Number(b.colorMatch) - Number(a.colorMatch)).slice(0, 3);
    root.querySelector('[data-recommendation-list]').innerHTML = ranked.length ? ranked.map((result) => renderCard(result)).join('') : '<p class="recommendation-empty">선택한 조건에 맞는 옷이 없어요. 성별이나 옷 종류를 전체로 바꿔 보세요.</p>';
    root.querySelectorAll('[data-save-id]').forEach((button) => button.addEventListener('click', () => saveItem(button.dataset.saveId, button)));
  };
  root.querySelectorAll('[data-filter]').forEach((select) => select.addEventListener('change', update));
  update();
}

function scoreItem(item, filters) {
  const matches = { size: item.size === filters.size, season: item.season === filters.season, category: filters.category === '전체' || item.category === filters.category, style: filters.style === '전체' || item.style === filters.style, condition: item.condition === '좋음' };
  const colorMatch = filters.color === '전체' || item.color === filters.color;
  const score = Object.entries(matches).reduce((total, [key, matched]) => total + (matched ? SCORE[key] : 0), 0);
  const reasons = [];
  if (matches.size) reasons.push('내 사이즈와 잘 맞아요');
  if (matches.season) reasons.push(`${item.season}에 입기 좋아요`);
  if (matches.category) reasons.push(`${item.category}가 필요할 때 좋아요`);
  if (matches.style) reasons.push(`${item.style}예요`);
  if (matches.condition) reasons.push('상태가 좋아요');
  if (colorMatch && filters.color !== '전체') reasons.push(`${item.color}이라 마음에 들 거예요`);
  return { item, score: Math.max(1, score), colorMatch, reasons: reasons.slice(0, 2) };
}

function renderCard({ item, score, reasons }) {
  const saved = savedItems.has(String(item.id));
  return `<article class="recommendation-card"><div class="clothing-icon">${item.emoji}</div><div class="clothing-info"><div class="clothing-title"><h5>${item.name}</h5><span class="match-score">${score}점</span></div><p>${item.description}</p><div class="reason-list">${reasons.map((reason) => `<span>✓ ${reason}</span>`).join('')}</div><button class="save-button ${saved ? 'is-saved' : ''}" data-save-id="${item.id}" type="button">${saved ? '저장했어요 ✓' : '코디 저장 +'}</button></div></article>`;
}

function saveItem(id, button) {
  const key = String(id);
  if (savedItems.has(key)) savedItems.delete(key); else savedItems.add(key);
  button.classList.toggle('is-saved', savedItems.has(key));
  button.textContent = savedItems.has(key) ? '저장했어요 ✓' : '코디 저장 +';
}
