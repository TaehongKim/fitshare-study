import { renderModelComparison, renderModelComparisonError, renderGeminiComparison } from './modelComparison.js';

const names = { point: '점 배경', cross: '격자 배경', ChArUco: 'ChArUco 테두리', ChaArUco_Cross: 'ChArUco 격자' };
const el = (selector) => document.querySelector(selector);
const ui = {
  status: el('#dataset-status'), summary: el('#dataset-summary'), backgrounds: el('#background-results'),
  garments: el('#garment-results'), photos: el('#dataset-photos'), backgroundFilter: el('#filter-background'),
  garmentFilter: el('#filter-garment'), modelStatus: el('#ai-model-status'), modelSummary: el('#ai-model-summary'),
  modelDetails: el('#ai-model-details'), deepFashion2: el('#deepfashion2-note'), warning: el('#model-provenance-warning'),
  geminiStatus: el('#gemini-status'), geminiSummary: el('#gemini-summary'), geminiDetails: el('#gemini-details')
};
let report;

function safe(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }
function cm(value) { return Number.isFinite(value) ? `${value.toFixed(1)}cm` : '값 없음'; }
function table(rows, label) {
  return `<table class="dataset-table"><thead><tr><th>구분</th><th>측정 성공</th><th>너비 평균 오차</th><th>기장 평균 오차</th></tr></thead><tbody>${rows.map(([key,item]) => `<tr><th>${safe(label(key))}</th><td>${item.successCount}/${item.imageCount}장</td><td>${cm(item.maeWidthCm)}</td><td>${cm(item.maeLengthCm)}</td></tr>`).join('')}</tbody></table>`;
}
function renderPhotos() {
  const bg = ui.backgroundFilter.value, garment = ui.garmentFilter.value;
  const rows = report.rows.filter((row) => (bg === 'all' || row.backgroundId === bg) && (garment === 'all' || String(row.garmentId) === garment));
  ui.photos.innerHTML = rows.map((row) => {
    const widthName = row.widthKind === 'waist' ? '허리 너비' : '가슴 너비';
    const result = row.overlayDataUrl ? `<img src="${row.overlayDataUrl}" alt="${safe(row.garmentName)} 측정 그림" loading="lazy" />` : '<div class="dataset-no-photo">분석 사진 없음</div>';
    const error = row.status === 'done' ? `${widthName} 오차 ${cm(row.absoluteWidthErrorCm)} · 기장 오차 ${cm(row.absoluteLengthErrorCm)}` : `측정을 마치지 못했어요: ${safe(row.message)}`;
    return `<article class="dataset-photo-card"><div class="dataset-photo-heading"><h3>${safe(names[row.backgroundId] || row.backgroundId)} · ${safe(row.garmentName)}</h3><span>${row.status === 'done' ? '측정값 생성' : '측정 실패'}</span></div>
      <div class="dataset-picture-pair"><figure><img src="${safe(row.sourceUrl)}" alt="${safe(row.garmentName)} 원본 사진" loading="lazy" /><figcaption>웹용 원본 사진</figcaption></figure><figure>${result}<figcaption>컴퓨터가 찾은 위치</figcaption></figure></div>
      <div class="dataset-values"><p><strong>${widthName}</strong><br />기준 ${cm(row.referenceWidthCm)} → 측정 ${cm(row.measuredWidthCm)}</p><p><strong>기장</strong><br />기준 ${cm(row.referenceLengthCm)} → 측정 ${cm(row.measuredLengthCm)}</p></div><p class="dataset-error">${error}</p></article>`;
  }).join('') || '<p class="analysis-note">선택한 조건에 해당하는 사진이 없어요.</p>';
}
function renderReport(data) {
  report = data;
  const summary = [['사진 수', `${data.summary.imageCount}장`], ['측정 성공', `${data.summary.successCount}/${data.summary.imageCount}장`], ['너비 평균 오차', cm(data.summary.maeWidthCm)], ['기장 평균 오차', cm(data.summary.maeLengthCm)]];
  ui.summary.innerHTML = summary.map(([label,value]) => `<article class="dataset-stat"><span>${label}</span><strong>${value}</strong></article>`).join('');
  const bgRows = Object.entries(data.byBackground || {});
  const garmentRows = Object.entries(data.byGarment || {});
  ui.backgrounds.innerHTML = table(bgRows, (key) => names[key] || key);
  ui.garments.innerHTML = table(garmentRows, (key) => data.rows.find((row) => String(row.garmentId) === key)?.garmentName || `옷 ${key}`);
  ui.backgroundFilter.innerHTML = '<option value="all">모든 배경</option>' + [...new Set(data.rows.map((row) => row.backgroundId))].map((key) => `<option value="${safe(key)}">${safe(names[key] || key)}</option>`).join('');
  ui.garmentFilter.innerHTML = '<option value="all">모든 옷</option>' + [...new Map(data.rows.map((row) => [row.garmentId,row.garmentName])).entries()].map(([id,name]) => `<option value="${safe(id)}">${safe(name)}</option>`).join('');
  renderPhotos();
  ui.status.textContent = `저장된 실험 결과 · 분석 사진 ${data.summary.imageCount}장 · 측정 실패 ${data.summary.failureCount}장`;
}
async function load() {
  try {
    const [data, models] = await Promise.all([
      fetch('./data/measure-dataset.json').then((response) => { if (!response.ok) throw new Error(); return response.json(); }),
      fetch('./data/model-comparison.json').then((response) => { if (!response.ok) throw new Error(); return response.json(); })
    ]);
    renderReport(data);
    renderModelComparison({ status: ui.modelStatus, summary: ui.modelSummary, details: ui.modelDetails, deepFashion2: ui.deepFashion2, warning: ui.warning }, models);
    renderGeminiComparison({ status: ui.geminiStatus, summary: ui.geminiSummary, details: ui.geminiDetails }, models.geminiComparison);
  } catch {
    ui.status.textContent = '공개 결과 파일을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.';
    renderModelComparisonError({ status: ui.modelStatus, summary: ui.modelSummary, details: ui.modelDetails, deepFashion2: ui.deepFashion2, warning: ui.warning }, 'AI 실험 결과 파일을 불러오지 못했어요.');
  }
}
ui.backgroundFilter.addEventListener('change', renderPhotos);
ui.garmentFilter.addEventListener('change', renderPhotos);
load();
