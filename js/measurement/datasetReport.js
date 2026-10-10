import { renderModelComparison, renderModelComparisonError, renderGeminiComparison } from './modelComparison.js?v=gemini-comparison-1';

const BACKGROUND_NAMES = {
  point: '점 배경', cross: '격자 배경', ChArUco: 'ChArUco 테두리', ChaArUco_Cross: 'ChArUco 격자'
};

const elements = {
  status: document.querySelector('#dataset-status'),
  summary: document.querySelector('#dataset-summary'),
  backgrounds: document.querySelector('#background-results'),
  garments: document.querySelector('#garment-results'),
  photos: document.querySelector('#dataset-photos'),
  backgroundFilter: document.querySelector('#filter-background'),
  garmentFilter: document.querySelector('#filter-garment'),
  rerun: document.querySelector('#dataset-rerun'),
  saveRound: document.querySelector('#dataset-save-round'),
  saveStatus: document.querySelector('#dataset-save-status'),
  modelStatus: document.querySelector('#ai-model-status'),
  modelSummary: document.querySelector('#ai-model-summary'),
  modelDetails: document.querySelector('#ai-model-details'),
  deepFashion2Note: document.querySelector('#deepfashion2-note'),
  modelWarning: document.querySelector('#model-provenance-warning'),
  geminiRun: document.querySelector('#gemini-run'),
  geminiStatus: document.querySelector('#gemini-status'),
  geminiSummary: document.querySelector('#gemini-summary'),
  geminiDetails: document.querySelector('#gemini-details')
};

let report = null;

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function displayCm(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}cm` : '값 없음';
}

function tableMarkup(rows, labelFor) {
  return `<table class="dataset-table"><thead><tr><th scope="col">구분</th><th scope="col">측정 성공</th><th scope="col">너비 평균 오차</th><th scope="col">기장 평균 오차</th></tr></thead><tbody>${rows.map(([key, item]) => `
    <tr><th scope="row">${safeText(labelFor(key))}</th><td>${item.successCount}/${item.imageCount}장</td><td>${displayCm(item.maeWidthCm)}</td><td>${displayCm(item.maeLengthCm)}</td></tr>`).join('')}</tbody></table>`;
}

function renderSummary(summary) {
  const items = [
    ['분석한 사진', `${summary.imageCount}장`],
    ['측정값 나온 사진', `${summary.successCount}/${summary.imageCount}장`],
    ['너비 평균 오차', displayCm(summary.maeWidthCm)],
    ['기장 평균 오차', displayCm(summary.maeLengthCm)]
  ];
  elements.summary.innerHTML = items.map(([label, value]) => `<article class="dataset-stat"><span>${safeText(label)}</span><strong>${safeText(value)}</strong></article>`).join('');
}

function fillFilters(rows) {
  const backgroundOptions = [...new Set(rows.map((row) => row.backgroundId))];
  const garmentOptions = [...new Map(rows.map((row) => [row.garmentId, row.garmentName])).entries()];
  elements.backgroundFilter.innerHTML = '<option value="all">모든 배경</option>' + backgroundOptions.map((id) => `<option value="${safeText(id)}">${safeText(BACKGROUND_NAMES[id] || id)}</option>`).join('');
  elements.garmentFilter.innerHTML = '<option value="all">모든 옷</option>' + garmentOptions.map(([id, name]) => `<option value="${safeText(id)}">${safeText(name)}</option>`).join('');
}

function renderPhotoRows() {
  if (!report) return;
  const background = elements.backgroundFilter.value;
  const garment = elements.garmentFilter.value;
  const rows = report.rows.filter((row) => (background === 'all' || row.backgroundId === background)
    && (garment === 'all' || String(row.garmentId) === garment));
  elements.photos.innerHTML = rows.map((row) => {
    const widthName = row.widthKind === 'waist' ? '허리 너비' : '가슴 너비';
    const sourceUrl = `/${String(row.sourceUrl || '').replace(/^\/+/, '')}`;
    const errorCopy = row.status === 'done'
      ? `${widthName} 오차 ${displayCm(row.absoluteWidthErrorCm)} · 기장 오차 ${displayCm(row.absoluteLengthErrorCm)}`
      : `측정을 마치지 못했어요: ${safeText(row.message)}`;
    const reviewLabel = row.status === 'done' ? '측정값 생성' : '측정 실패';
    const resultPicture = row.overlayDataUrl
      ? `<img src="${row.overlayDataUrl}" alt="${safeText(row.garmentName)} 측정 위치를 색과 선으로 표시한 사진" loading="lazy" />`
      : '<div class="dataset-no-photo">분석 사진 없음</div>';
    return `<article class="dataset-photo-card">
      <div class="dataset-photo-heading"><h3>${safeText(BACKGROUND_NAMES[row.backgroundId] || row.backgroundId)} · ${safeText(row.garmentName)}</h3><span class="${row.status === 'done' ? '' : 'needs-review'}">${reviewLabel}</span></div>
      <div class="dataset-picture-pair"><figure><img src="${safeText(sourceUrl)}" alt="${safeText(row.garmentName)}를 ${safeText(BACKGROUND_NAMES[row.backgroundId] || row.backgroundId)}에서 찍은 원본 사진" loading="lazy" /><figcaption>원본 사진</figcaption></figure><figure>${resultPicture}<figcaption>컴퓨터가 찾은 위치</figcaption></figure></div>
      <div class="dataset-values"><p><strong>${widthName}</strong><br />기준 ${displayCm(row.referenceWidthCm)} <span>→</span> 측정 ${displayCm(row.measuredWidthCm)}</p><p><strong>기장</strong><br />기준 ${displayCm(row.referenceLengthCm)} <span>→</span> 측정 ${displayCm(row.measuredLengthCm)}</p></div>
      <p class="dataset-error">${errorCopy}</p>
    </article>`;
  }).join('') || '<p class="analysis-note">선택한 조건에 해당하는 사진이 없어요.</p>';
}

function renderReport(value) {
  report = value;
  renderSummary(value.summary);
  const backgroundOrder = ['point', 'cross', 'ChArUco', 'ChaArUco_Cross'];
  const backgroundRows = Object.entries(value.byBackground || {}).sort((a, b) => backgroundOrder.indexOf(a[0]) - backgroundOrder.indexOf(b[0]));
  const garmentRows = Object.entries(value.byGarment || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  elements.backgrounds.innerHTML = tableMarkup(backgroundRows, (id) => BACKGROUND_NAMES[id] || id);
  elements.garments.innerHTML = tableMarkup(garmentRows, (id) => value.rows.find((row) => String(row.garmentId) === id)?.garmentName || `옷 ${id}`);
  fillFilters(value.rows);
  renderPhotoRows();
  elements.status.textContent = `마지막 분석: ${new Date(value.generatedAt).toLocaleString('ko-KR')} · 측정을 마치지 못한 사진 ${value.summary.failureCount}장`;
}

async function loadModelComparison() {
  elements.modelStatus.textContent = '같은 M4 사진의 저장된 실험을 비교하고 있어요.';
  try {
    const response = await fetch('/api/measure-dataset/model-comparison');
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '모델 비교 결과를 불러오지 못했어요.');
    renderModelComparison({
      status: elements.modelStatus,
      summary: elements.modelSummary,
      details: elements.modelDetails,
      deepFashion2: elements.deepFashion2Note,
      warning: elements.modelWarning
    }, result);
    renderGeminiComparison({
      status: elements.geminiStatus,
      summary: elements.geminiSummary,
      details: elements.geminiDetails
    }, result.geminiComparison);
  } catch (error) {
    renderModelComparisonError({
      status: elements.modelStatus,
      summary: elements.modelSummary,
      details: elements.modelDetails,
      deepFashion2: elements.deepFashion2Note,
      warning: elements.modelWarning
    }, error.message);
    elements.geminiStatus.textContent = error.message;
  }
}

async function runGeminiMeasurement() {
  elements.geminiRun.disabled = true;
  elements.geminiStatus.textContent = '사진 20장을 Gemini에 보내고 있어요. 끝날 때까지 이 페이지를 열어 두세요.';
  try {
    const response = await fetch('/api/measure-dataset/gemini', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Gemini 분석을 끝내지 못했어요.');
    elements.geminiStatus.textContent = `Gemini 분석 완료: ${result.successCount}/${result.sampleCount}장 성공, ${result.failureCount}장 실패. 결과를 불러오는 중이에요.`;
    await loadModelComparison();
    if (result.failureCount) {
      elements.geminiStatus.textContent = `분석 완료: ${result.successCount}/${result.sampleCount}장 성공, ${result.failureCount}장은 실패했어요. 성공한 사진의 결과를 비교해 보세요.`;
    }
  } catch (error) {
    elements.geminiStatus.textContent = error.message;
  } finally {
    elements.geminiRun.disabled = false;
  }
}

async function loadReport({ rerun = false } = {}) {
  elements.rerun.disabled = true;
  elements.status.textContent = rerun ? '사진 20장을 다시 살펴보고 있어요. 잠시 기다려 주세요.' : '실험 결과를 불러오고 있어요.';
  try {
    const response = await fetch(rerun ? '/api/measure-dataset/run' : '/api/measure-dataset', {
      method: rerun ? 'POST' : 'GET',
      headers: rerun ? { 'Content-Type': 'application/json' } : undefined,
      body: rerun ? '{}' : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '결과를 가져오지 못했어요.');
    renderReport(result);
    await loadModelComparison();
    elements.saveRound.disabled = result.summary.imageCount !== 20 || result.summary.successCount !== 20;
    elements.saveStatus.textContent = elements.saveRound.disabled
      ? '사진 20장 분석이 모두 성공해야 새 회차로 저장할 수 있어요.'
      : '분석 결과 20개를 새 실험 회차로 저장할 수 있어요.';
  } catch (error) {
    elements.status.textContent = `${error.message} server.py로 사이트를 실행했는지 확인해 주세요.`;
    elements.summary.innerHTML = '<p class="analysis-note">아직 결과를 불러오지 못했어요. 서버가 켜져 있는지 확인하고 다시 눌러 주세요.</p>';
    elements.saveRound.disabled = true;
    elements.saveStatus.textContent = '분석 결과를 불러온 뒤 새 회차로 저장할 수 있어요.';
  } finally {
    elements.rerun.disabled = false;
  }
}

async function saveAsExperimentRound() {
  if (!report || report.summary.imageCount !== 20 || report.summary.successCount !== 20) {
    elements.saveStatus.textContent = '먼저 사진 20장의 분석을 모두 성공시켜 주세요.';
    return;
  }
  elements.saveRound.disabled = true;
  elements.rerun.disabled = true;
  elements.saveStatus.textContent = '사진과 측정 결과를 서버에 저장하고 있어요. 잠시만 기다려 주세요.';
  try {
    const response = await fetch('/api/measure-dataset/save-as-experiment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('현재 실행 중인 서버는 회차 저장 기능을 지원하지 않아요. 최신 server.py를 실행해 주세요.');
      }
      throw new Error(result.error || '새 회차를 저장하지 못했어요.');
    }
    const resultUrl = safeText(result.resultUrl || `results/index.html?run=${encodeURIComponent(result.id)}`);
    elements.saveStatus.innerHTML = `${result.round}회차로 저장했어요. <a href="${resultUrl}">사진과 결과 보기</a>`;
  } catch (error) {
    elements.saveStatus.textContent = error.message;
    elements.saveRound.disabled = false;
  } finally {
    elements.rerun.disabled = false;
  }
}

elements.rerun.addEventListener('click', () => loadReport({ rerun: true }));
elements.saveRound.addEventListener('click', saveAsExperimentRound);
elements.backgroundFilter.addEventListener('change', renderPhotoRows);
elements.garmentFilter.addEventListener('change', renderPhotoRows);
elements.geminiRun.addEventListener('click', runGeminiMeasurement);
loadReport();
