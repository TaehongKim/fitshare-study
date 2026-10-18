import { mockData } from '../data/mockData.js';
import { METADATA_CHOICES } from '../js/garmentMetadata.js';
import { mountClothingWishes } from '../js/clothingWishes.js';
import { openVirtualTryOn, closeVirtualTryOn } from '../js/virtualTryOn/index.js';

// 추천 점수는 학생이 쉽게 비교하도록 항상 1~10점으로 계산합니다.
const SCORE = { size: 4, season: 2, category: 2, style: 1, condition: 1 };
let savedItems = new Set();

export function normalizeRecommendationItem(record) {
  record=record&&typeof record==='object'?record:{};
  const descriptors=Object.fromEntries(Object.entries(METADATA_CHOICES).filter(([key])=>key!=='size').map(([key,choices])=>{const value=String(record[key]||'').trim();return [key,choices.includes(value)?value:''];}));
  const gender = ({ male: '남학생', female: '여학생', unisex: '공용', '남학생': '남학생', '여학생': '여학생', '공용': '공용' })[record.gender] || '';
  const colorName = String(record.colorName || '').trim().toLowerCase().replace(/\s+/g, '');
  const dark = ['검정', '검정색', '검은색', '블랙', 'black', '네이비', 'navy', '남색', '진청', '진갈색', '짙은회색', '다크그레이', '차콜', 'charcoal'];
  const light = ['흰색', '흰', '하양', '화이트', 'white', '아이보리', '베이지', '연회색', '회색', '노랑', '노란색', '연분홍', '분홍', '핑크', '민트', '하늘색', '연두', '파랑', '파란색', '초록', '빨강', '보라'];
  const seasons = [...new Set((Array.isArray(record.seasons) ? record.seasons : [record.season]).filter((season) => ['봄','여름','가을','겨울'].includes(season)))];
  return { ...record, ...descriptors, gender, size: String(record.size ?? '').trim(),
    colorName: String(record.colorName || '').trim(),
    category: ({ top: '상의', pants: '하의', '상의': '상의', '하의': '하의' })[record.category] || '',
    seasons, season: seasons[0] || '', style: descriptors.style,
    color: dark.includes(colorName) ? '어두운 색' : light.includes(colorName) ? '밝은 색' : '' };
}

export function matchesRecommendationFilters(item, filters) {
  const match = (key) => !filters[key] || filters[key] === '전체' || Boolean(item[key]) && item[key] === filters[key];
  const sizeMatch = filters.size === '전체' || !filters.size || item.size !== '' && Number.isFinite(Number(item.size)) && Math.abs(Number(item.size) - Number(filters.size)) <= Number(filters.sizeTolerance || 0);
  const rangeMatch = (value, min, max) => (!min && !max) || typeof value === 'number' && Number.isFinite(value) && (!min || value >= Number(min)) && (!max || value <= Number(max));
  return (filters.gender === '전체' || item.gender === '공용' || item.gender === filters.gender)
    && sizeMatch && (!filters.season || filters.season === '전체' || item.seasons.includes(filters.season))
    && ['category','condition','garmentKind','sleeveLength','bottomLength','thickness','stretch','pattern'].every(match)
    && (filters.styleMode === '선호' || match('style'))
    && (filters.colorMode === '선호' || match('color') && match('colorName'))
    && (!filters.referenceLength || typeof item.lengthCm === 'number' && Number.isFinite(item.lengthCm))
    && (!filters.referenceWidth || typeof item.widthCm === 'number' && Number.isFinite(item.widthCm))
    && rangeMatch(item.lengthCm, filters.lengthMin, filters.lengthMax)
    && rangeMatch(item.widthCm, filters.widthMin, filters.widthMax);
}

export function validateRecommendationFilters(filters) {
  if (filters.invalidMeasurementInput) return '옷 치수를 올바른 숫자로 입력해 주세요.';
  for (const [min, max, label] of [['lengthMin', 'lengthMax', '길이'], ['widthMin', 'widthMax', '너비']]) {
    for (const key of [min, max]) if (filters[key] && (!Number.isFinite(Number(filters[key])) || Number(filters[key]) <= 0 || Number(filters[key]) > 300)) return `${label}는 0보다 크고 300cm 이하인 숫자로 입력해 주세요.`;
    if (filters[min] && filters[max] && Number(filters[min]) > Number(filters[max])) return `${label}의 최소값은 최대값보다 클 수 없어요.`;
  }
  if (filters.sizeTolerance && !['0', '10'].includes(String(filters.sizeTolerance))) return '사이즈 허용 범위를 다시 선택해 주세요.';
  for(const key of ['referenceLength','referenceWidth']) if(filters[key] && (!Number.isFinite(Number(filters[key])) || Number(filters[key])<=0 || Number(filters[key])>300))return '기준 옷 치수는 0보다 크고 300cm 이하로 입력해 주세요.';
  if((filters.referenceLength||filters.referenceWidth)&&!['상의','하의'].includes(filters.category))return '기준 옷과 비교할 때는 옷 종류를 상의 또는 하의로 선택해 주세요.';
  if(filters.referenceWidth && Number(filters.referenceWidth)+fitWidthOffset(filters.fitPreference)>300)return '여유를 더한 목표 너비가 300cm를 넘어요. 기준 너비를 확인해 주세요.';
  return '';
}

function fitWidthOffset(preference){return ({'비슷하게':0,'조금 여유있게':2,'여유있게':4})[preference]||0;}

export function compareReferenceFit(item, filters){
  const differences=[];
  if(filters.referenceLength)differences.push(Math.abs(item.lengthCm-Number(filters.referenceLength)));
  if(filters.referenceWidth)differences.push(Math.abs(item.widthCm-Number(filters.referenceWidth)-fitWidthOffset(filters.fitPreference)));
  if(!differences.length)return {score:0,distance:null};
  const distance=differences.reduce((a,b)=>a+b,0)/differences.length;
  return {score:1/(1+distance/3),distance};
}

export function getRecommendationResults(records, filters) {
  if (validateRecommendationFilters(filters)) return [];
  return records.filter(record=>record&&typeof record==='object').map(normalizeRecommendationItem).filter((item) => item.category)
    .filter((item) => matchesRecommendationFilters(item, filters))
    .map((item) => scoreItem(item, filters))
    .sort((a, b) => b.rankScore - a.rankScore || String(a.item.id).localeCompare(String(b.item.id)));
}

function colorFamily(item) {
  const name = String(item.colorName || '').toLowerCase().replace(/\s+/g, '');
  const families = [
    ['white', ['흰색', '흰', '하양', '화이트', 'white', '아이보리']],
    ['black', ['검정', '검정색', '검은색', '블랙', 'black']],
    ['gray', ['회색', '연회색', '짙은회색', '차콜', '다크그레이']],
    ['blue', ['파랑', '파란색', '네이비', 'navy', '남색', '진청', '하늘색']],
    ['brown', ['베이지', '진갈색', '갈색']], ['pink', ['분홍', '연분홍', '핑크']],
    ['green', ['초록', '민트', '연두']], ['yellow', ['노랑', '노란색']],
    ['red', ['빨강']], ['purple', ['보라']]
  ];
  return families.find(([, names]) => names.includes(name))?.[0] || '';
}

export function getOutfitMatches(records, selected, filters) {
  const anchor = normalizeRecommendationItem(selected);
  const pairSize = filters.pairSize && filters.pairSize !== '같은 사이즈' ? filters.pairSize : anchor.size || (filters.size !== '전체' ? filters.size : '');
  const seasons = filters.season && filters.season !== '전체' ? anchor.seasons.filter((season)=>season===filters.season) : anchor.seasons;
  if (!pairSize || !seasons.length || !anchor.category || validateRecommendationFilters(filters)) return [];
  // The first garment's category, color and dimensions describe that garment only.
  const pairFilters = { gender: filters.gender || '전체', size: pairSize, sizeTolerance: filters.sizeTolerance || '0',
    season:'전체', category: anchor.category === '상의' ? '하의' : '상의', style: filters.style || '전체', styleMode:filters.styleMode||'필수', color:'전체', condition:filters.condition||'전체',stretch:filters.stretch||'전체',thickness:filters.thickness||'전체' };
  const anchorFamily = colorFamily(anchor);
  return getRecommendationResults(records.filter((item) => item&&String(item.id) !== String(anchor.id)), pairFilters).filter(({item})=>item.seasons.some(season=>seasons.includes(season))).map(({ item }) => {
    const sharedSeasons=item.seasons.filter(season=>seasons.includes(season));
    const sameSize = item.size === String(pairSize);
    const sameStyle = Boolean(anchor.style) && anchor.style === item.style;
    const family = colorFamily(item);
    const sameTone = Boolean(family) && family === anchorFamily;
    const neutral = Boolean(family && anchorFamily) && [family, anchorFamily].some((value) => ['white', 'black', 'gray', 'brown'].includes(value));
    const contrast = Boolean(anchor.color && item.color) && anchor.color !== item.color;
    const harmonious = filters.harmony === '톤 맞추기' ? sameTone : neutral || contrast;
    const reasons = [sameSize ? `함께 입을 사이즈 ${pairSize}와 같아요` : `허용한 사이즈 범위 안에 있어요 (${item.size})`, `${sharedSeasons.join('·')} 옷끼리 맞췄어요`];
    if (sameTone) reasons.push('비슷한 색 계열이에요');
    else if (neutral) reasons.push('기본색을 활용한 조합이에요');
    else if (contrast) reasons.push('밝고 어두운 색에 대비를 줬어요');
    if (sameStyle) reasons.push('스타일도 같아요');
    const compatibleThickness=Boolean(anchor.thickness&&item.thickness)&&Math.abs(['얇음','보통','두꺼움'].indexOf(anchor.thickness)-['얇음','보통','두꺼움'].indexOf(item.thickness))<=1;
    const patternComplement=Boolean(anchor.pattern&&item.pattern)&&(anchor.pattern==='무지'||item.pattern==='무지');
    if(compatibleThickness)reasons.push('옷 두께의 차이가 크지 않아요');
    if(patternComplement)reasons.push('무지 옷과 조합해 무늬를 정리했어요');
    const rankScore = (sameSize ? 4 : 3) + 2 + Number(sameStyle) + (harmonious ? 2 : 0) + (compatibleThickness?2:0) + Number(patternComplement);
    return { item, rankScore, score:Math.round(rankScore/12*10), reasons, top: anchor.category === '상의' ? anchor : item, bottom: anchor.category === '하의' ? anchor : item };
  }).sort((a, b) => b.rankScore - a.rankScore || String(a.item.id).localeCompare(String(b.item.id))).slice(0, 3);
}

export async function renderRecommendation(root, state) {
  closeVirtualTryOn();
  root.clothingWishes?.dispose();
  root.dataset.module = 'recommendation';
  root.textContent = '등록된 옷 목록을 불러오고 있어요.';
  let records;
  try {
    const response = await fetch('/api/garments', { cache: 'no-store' });
    if (!response.ok) throw new Error('catalog unavailable');
    records = (await response.json()).filter((record) => record&&['top', 'pants'].includes(record.category));
  } catch {
    if (root.dataset.module === 'recommendation') root.textContent = '상품 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
    return;
  }
  if (state.activeTab !== 'recommendation') return;
  const data = { ...mockData.recommendation, tag: `등록된 상의·하의 ${records.length}벌` };
  root.dataset.module = 'recommendation';
  root.innerHTML = `
    <section class="recommendation-panel">
      <div class="recommendation-intro">
        <div class="module-emoji">${data.emoji}</div>
        <div><h3>${data.title}</h3><p>${data.description}</p><span class="module-tag">${data.tag}</span></div>
      </div>
      <div class="recommendation-filters" aria-label="추천 조건 선택">
        <label>옷을 입을 사람<select data-filter="gender"><option value="전체">전체</option><option value="남학생">남학생</option><option value="여학생">여학생</option></select></label>
        <label>내 사이즈<select data-filter="size"><option value="130">130</option><option value="100">100</option><option value="110">110</option><option value="120">120</option><option value="140">140</option><option value="150">150</option><option value="160">160</option><option value="170">170</option><option value="전체">전체</option></select></label>
        <label>계절<select data-filter="season"><option value="봄">봄</option><option value="여름">여름</option><option value="가을">가을</option><option value="겨울">겨울</option><option value="전체">전체</option></select></label>
        <label>옷 종류<select data-filter="category"><option value="전체">전체</option><option value="상의">상의</option><option value="하의">하의</option></select></label>
        <label>스타일<select data-filter="style"><option value="전체">전체</option><option value="편한 스타일">편한 스타일</option><option value="활동적인 스타일">활동적인 스타일</option><option value="단정한 스타일">단정한 스타일</option></select></label>
        <label>색상<select data-filter="color"><option value="전체">전체</option><option value="밝은 색">밝은 색</option><option value="어두운 색">어두운 색</option></select></label>
      </div>
      <section class="clothing-wishes" data-clothing-wishes aria-label="원하는 옷 기부 알림"></section>
      <div class="recommendation-heading"><h4>나에게 잘 맞는 코디 <span>TOP 3</span></h4><p>조건을 바꾸면 추천도 달라져요. 체험용 등록 옷의 치수는 가상 예시 값이에요.</p></div>
      <p data-match-count role="status"></p>
      <p>선택한 조건에 맞는 옷만 최대 3벌 보여줘요. 사이즈·계절 등 선택한 정보가 미등록인 옷은 제외해요.</p>
      <div class="recommendation-list" data-recommendation-list></div>
      <section class="outfit-section" aria-labelledby="outfit-title">
        <h4 id="outfit-title">함께 입을 세트 찾기</h4>
        <div class="recommendation-filters">
          <label><span data-pair-size-label>함께 입을 옷 사이즈</span><select data-pair-setting="pairSize"><option value="같은 사이즈">고른 옷과 같은 사이즈</option>${METADATA_CHOICES.size.map((size) => `<option value="${size}">${size}</option>`).join('')}</select></label>
          <label>색상 조화 우선순위<select data-pair-setting="harmony"><option value="기본색·대비">기본색·밝고 어두운 조합</option><option value="톤 맞추기">비슷한 색 계열 우선</option></select></label>
        </div>
        <p>TOP 3의 ‘이 옷으로 세트 찾기’를 눌러 보세요. 고른 옷과 같은 계절의 반대 종류를 찾아요. 위에서 정한 색상은 처음 고르는 옷에만 적용해요.</p>
        <div data-outfit-results aria-live="polite"><p>아직 고른 옷이 없어요.</p></div>
      </section>
    </section>`;

  let selectedId = null;
  let requestVersion = 0;
  const readFilters = () => ({
    ...Object.fromEntries([...root.querySelectorAll('[data-filter], [data-pair-setting]')].map((input) => [input.dataset.filter || input.dataset.pairSetting, input.value])),
    invalidMeasurementInput: [...root.querySelectorAll('input[data-filter]')].some((input) => input.validity.badInput)
  });
  const showOutfits = async () => {
    const version = ++requestVersion;
    const target = root.querySelector('[data-outfit-results]');
    target.textContent = '함께 입을 옷을 찾고 있어요.';
    try {
      const response = await fetch('/api/garments', { cache: 'no-store' });
      if (!response.ok) throw new Error('목록을 불러오지 못했어요. 다시 선택해 주세요.');
      const live = await response.json();
      if (version !== requestVersion || state.activeTab !== 'recommendation') return;
      const selected = live.find((item) => String(item.id) === selectedId);
      if (!selected) { target.textContent = '고른 옷이 목록에서 삭제됐어요. 추천 목록을 다시 열어 주세요.'; return; }
      const filters = readFilters();
      if (!getRecommendationResults([selected], filters).length) { target.textContent = '고른 옷의 정보가 변경되어 현재 조건에 맞지 않아요. 추천 목록을 다시 열어 주세요.'; return; }
      const matches = getOutfitMatches(live, selected, filters);
      const anchor = normalizeRecommendationItem(selected);
      root.querySelector('[data-pair-size-label]').textContent = `함께 입을 ${anchor.category === '상의' ? '하의' : '상의'} 사이즈`;
      target.innerHTML = `<p class="outfit-selection">고른 옷: <strong>${escapeHtml(anchor.name)}</strong></p>` + (matches.length
        ? `<div class="outfit-list">${matches.map(renderOutfit).join('')}</div>`
        : '<p class="recommendation-empty">같은 계절과 지정한 사이즈에 맞는 짝이 없어요. 함께 입을 옷 사이즈를 확인해 주세요. 사이즈·계절 정보가 없는 옷은 매칭이 제한될 수 있어요.</p>');
      target.querySelectorAll('[data-tryon-pair]').forEach(button=>button.addEventListener('click',()=>{
        const pair=matches[Number(button.dataset.tryonPair)];
        if(pair)openVirtualTryOn([pair.top,pair.bottom],{owner:root.querySelector('[data-recommendation-list]'),isActive:()=>state.activeTab==='recommendation'});
      }));
    } catch { if (version === requestVersion && state.activeTab === 'recommendation') target.textContent = '세트 목록을 불러오지 못했어요. 연결을 확인하고 옷을 다시 선택해 주세요.'; }
  };
  const update = () => {
    root.clothingWishes?.updatePreview();
    const filters = readFilters();
    requestVersion++;
    selectedId = null;
    root.querySelector('[data-outfit-results]').textContent = '조건이 바뀌었어요. TOP 3에서 세트로 입을 옷을 골라 주세요.';
    const validation = validateRecommendationFilters(filters);
    const matches = getRecommendationResults(records, filters);
    const ranked = matches.slice(0, 3);
    root.querySelector('[data-match-count]').textContent = `조건에 맞는 옷 ${matches.length}벌 · ${ranked.length}벌 표시`;
    root.querySelector('[data-recommendation-list]').innerHTML = ranked.length ? ranked.map((result) => renderCard(result)).join('') : '<p class="recommendation-empty">선택한 조건을 모두 만족하는 옷이 없어요. 사이즈·계절·종류·스타일·색상을 바꾸거나 전체로 선택해 보세요.</p>';
    root.querySelectorAll('[data-save-id]').forEach((button) => button.addEventListener('click', () => saveItem(button.dataset.saveId, button)));
    root.querySelectorAll('[data-tryon-id]').forEach(button=>button.addEventListener('click',()=>{
      const item=records.find(record=>String(record.id)===button.dataset.tryonId);
      if(item)openVirtualTryOn([item],{owner:root.querySelector('[data-recommendation-list]'),isActive:()=>state.activeTab==='recommendation'});
    }));
    if (validation) root.querySelector('[data-recommendation-list]').textContent = validation;
    root.querySelectorAll('[data-select-outfit]').forEach((button) => button.addEventListener('click', () => {
      selectedId = button.dataset.selectOutfit;
      root.querySelectorAll('[data-select-outfit]').forEach((other) => {
        other.setAttribute('aria-pressed', String(other === button));
        other.closest('.recommendation-card').classList.toggle('is-selected', other === button);
      });
      showOutfits();
    }));
  };
  root.querySelectorAll('[data-filter]').forEach((select) => select.addEventListener('change', update));
  root.querySelectorAll('input[data-filter]').forEach((input) => input.addEventListener('input', update));
  root.querySelectorAll('[data-pair-setting]').forEach((select) => select.addEventListener('change', () => { if (selectedId) showOutfits(); }));
  root.clothingWishes = mountClothingWishes(root.querySelector('[data-clothing-wishes]'), readFilters, () => state.activeTab === 'recommendation');
  update();
}

function scoreItem(item, filters) {
  const matches = { size: filters.size !== '전체' && item.size === filters.size, season: filters.season !== '전체' && item.seasons.includes(filters.season), category: filters.category !== '전체' && item.category === filters.category, style: filters.style !== '전체' && item.style === filters.style, condition: item.condition === '좋음' };
  const colorMatch = (!filters.color||filters.color==='전체'||item.color===filters.color)&&(!filters.colorName||filters.colorName==='전체'||item.colorName===filters.colorName);
  const score = Object.entries(matches).reduce((total, [key, matched]) => total + (matched ? SCORE[key] : 0), 0);
  const reasons = [];
  if (matches.size) reasons.push('선택한 사이즈와 같아요');
  if (matches.season) reasons.push(`${filters.season}에 입기 좋아요`);
  if (matches.category) reasons.push(`${item.category}가 필요할 때 좋아요`);
  if (matches.style) reasons.push(`${item.style}예요`);
  if (matches.condition) reasons.push('상태가 좋아요');
  if (colorMatch && filters.color !== '전체') reasons.push(`${item.color}이라 마음에 들 거예요`);
  const nearSize = filters.size !== '전체' && item.size && Number.isFinite(Number(item.size)) && !matches.size;
  if (nearSize) reasons.unshift(`허용 범위의 사이즈 ${item.size}예요`);
  const fit=compareReferenceFit(item,filters);
  if(fit.distance!==null)reasons.unshift(`기준 옷 목표 치수와 평균 ${fit.distance.toFixed(1)}cm 차이예요`);
  const colorSelected=filters.color&&filters.color!=='전체'||filters.colorName&&filters.colorName!=='전체';
  const preferenceScore=Number(filters.styleMode==='선호'&&matches.style)+Number(filters.colorMode==='선호'&&colorSelected&&colorMatch);
  if(filters.colorMode==='선호'&&colorSelected&&colorMatch)reasons.unshift('선호한 색상과 같아요');
  if(filters.styleMode==='선호'&&matches.style)reasons.unshift('선호한 스타일과 같아요');
  const rankScore=score+(nearSize?3:0)+fit.score*4+preferenceScore*2;
  return { item, score:Math.min(10,Math.max(1,Math.round(rankScore))),rankScore,fit,preferenceScore,colorMatch,reasons:reasons.slice(0,3) };
}

function renderOutfit({ top, bottom, score, reasons }, index) {
  const garment = (item, label) => `<figure><img src="/api/garments/${encodeURIComponent(item.id)}/photo" alt="${escapeHtml(item.name)}" loading="lazy"><figcaption><strong>${label}: ${escapeHtml(item.name)}</strong><span>사이즈 ${escapeHtml(item.size || '미등록')} · 길이 ${item.lengthCm ?? '-'}cm · 너비 ${item.widthCm ?? '-'}cm</span>${item.isDemo ? '<small>체험용 가상 치수</small>' : ''}</figcaption></figure>`;
  return `<article class="outfit-card"><div class="outfit-card-title"><h5>상의 + 하의 세트</h5><span class="match-score">조합 ${score}점</span></div><div class="outfit-pair">${garment(top, '상의')}${garment(bottom, '하의')}</div><div class="reason-list">${reasons.map((reason) => `<span>✓ ${escapeHtml(reason)}</span>`).join('')}</div><button class="outfit-select" type="button" data-tryon-pair="${index}">이 세트 가상으로 입어보기</button></article>`;
}

function renderCard({ item, score, reasons }) {
  const saved = savedItems.has(String(item.id));
  const attributes=[item.garmentKind,item.sleeveLength!=='해당 없음'?item.sleeveLength:'',item.bottomLength!=='해당 없음'?item.bottomLength:'',item.thickness,item.pattern,item.stretch?`신축성 ${item.stretch}`:'',item.condition?`상태 ${item.condition}`:''].filter(Boolean).join(' · ');
  return `<article class="recommendation-card"><div class="clothing-icon"><img class="clothing-photo" src="/api/garments/${item.id}/photo" alt="${escapeHtml(item.name)}" width="300" height="220" loading="lazy"></div><div class="clothing-info"><div class="clothing-title"><h5>${escapeHtml(item.name)}</h5><span class="match-score">${score}점</span></div><p>사이즈 ${escapeHtml(item.size || '미등록')} · ${escapeHtml(item.seasons.join(' · ') || '계절 미등록')}</p><p>길이 ${item.lengthCm}cm · 너비 ${item.widthCm}cm</p>${attributes?`<p>${escapeHtml(attributes)}</p>`:''}${item.isDemo ? '<p>체험용 가상 등록 · 치수는 예시 값이에요.</p>' : ''}<div class="reason-list">${reasons.map((reason) => `<span>✓ ${escapeHtml(reason)}</span>`).join('')}</div><div class="recommendation-actions"><button class="outfit-select" data-select-outfit="${escapeHtml(item.id)}" type="button" aria-pressed="false">이 옷으로 세트 찾기</button><button class="outfit-select" type="button" data-tryon-id="${escapeHtml(item.id)}">가상으로 입어보기</button><button class="save-button ${saved ? 'is-saved' : ''}" data-save-id="${item.id}" type="button">${saved ? '저장했어요 ✓' : '코디 저장 +'}</button></div></div></article>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function saveItem(id, button) {
  const key = String(id);
  if (savedItems.has(key)) savedItems.delete(key); else savedItems.add(key);
  button.classList.toggle('is-saved', savedItems.has(key));
  button.textContent = savedItems.has(key) ? '저장했어요 ✓' : '코디 저장 +';
}
