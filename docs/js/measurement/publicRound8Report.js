const status = document.querySelector('#round8-status');
const summaryRoot = document.querySelector('#round8-summary');
const conclusion = document.querySelector('#round8-conclusion');
const garmentRoot = document.querySelector('#round8-garments');
const photosRoot = document.querySelector('#round8-photos');

const garmentNames = { 1: '상의 외투', 2: '크롭 티셔츠', 3: '원피스', 4: '점퍼', 5: '바지' };
const backgrounds = { point: '점 배경', cross: '격자 배경', ChArUco: 'ChArUco', ChaArUco_Cross: 'ChArUco 격자' };

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function cm(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}cm` : '기록 없음';
}

function score(value, candidate) {
  return value > candidate ? 'is-worse' : '';
}

function renderSummary(report) {
  summaryRoot.innerHTML = ['round7', 'round8'].map((id) => {
    const row = report.methods[id];
    const candidate = id === 'round8';
    return `<article class="round8-summary-card ${candidate ? 'is-candidate' : ''}">
      <h3>${safe(report.methodLabels[id].label)}</h3>
      <div class="round8-metrics">
        <div class="round8-metric"><span>전체 성공</span><strong>${row.successCount}/${row.imageCount}</strong><small>실패 ${row.failureCount}장</small></div>
        <div class="round8-metric"><span>전체 너비 MAE</span><strong>${cm(row.maeWidthCm)}</strong><small>20장 기준</small></div>
        <div class="round8-metric"><span>대상 3종 너비 MAE</span><strong>${cm(row.targetMaeWidthCm)}</strong><small>${row.targetSuccessCount}/${row.targetGarmentCount}장 성공</small></div>
        <div class="round8-metric"><span>전체 기장 MAE</span><strong>${cm(row.maeLengthCm)}</strong><small>같은 기장 계산</small></div>
        <div class="round8-metric"><span>평균 처리 시간</span><strong>${Number.isFinite(row.averageElapsedMs) ? `${row.averageElapsedMs.toFixed(0)}ms` : '기록 없음'}</strong><small>사진당</small></div>
      </div>
    </article>`;
  }).join('');

  const base = report.methods.round7;
  const next = report.methods.round8;
  const allChange = next.maeWidthCm - base.maeWidthCm;
  const targetChange = next.targetMaeWidthCm - base.targetMaeWidthCm;
  conclusion.innerHTML = `<strong>60% 위치는 더 정확해지지 않았어요.</strong> 전체 너비 오차가 ${cm(base.maeWidthCm)}에서 ${cm(next.maeWidthCm)}로 ${cm(Math.abs(allChange))} ${allChange >= 0 ? '커졌어요' : '줄었어요'}. 대상 세 종류의 오차는 ${cm(base.targetMaeWidthCm)}에서 ${cm(next.targetMaeWidthCm)}로 ${cm(Math.abs(targetChange))} ${targetChange >= 0 ? '커졌어요' : '줄었어요'}. 성공 장수와 기장 오차는 그대로예요.`;
}

function renderGarments(report) {
  const ids = Object.keys(report.byGarment);
  garmentRoot.innerHTML = `<thead><tr><th>옷 종류</th><th>선택 조합 기준<br>성공 · 너비/기장 MAE</th><th>6차 60%<br>성공 · 너비/기장 MAE</th><th>너비 오차 변화</th></tr></thead><tbody>${ids.map((id) => {
    const baseline = report.byGarment[id].round7;
    const candidate = report.byGarment[id].round8;
    const delta = candidate.maeWidthCm - baseline.maeWidthCm;
    return `<tr><th>${safe(garmentNames[id] || id)}${[2, 3, 4].includes(Number(id)) ? ' · 60% 적용' : ' · 유지'}</th>
      <td>${baseline.successCount}/${baseline.imageCount} · ${cm(baseline.maeWidthCm)} / ${cm(baseline.maeLengthCm)}</td>
      <td>${candidate.successCount}/${candidate.imageCount} · ${cm(candidate.maeWidthCm)} / ${cm(candidate.maeLengthCm)}</td>
      <td class="${score(delta, 0)}">${delta >= 0 ? '+' : ''}${cm(delta)}</td></tr>`;
  }).join('')}</tbody>`;
}

function renderPhotos(report) {
  photosRoot.innerHTML = report.rows.map((row) => {
    const baseline = row.round7;
    const candidate = row.round8;
    const methodLine = (result, name) => result.status === 'done'
      ? `<tr><th>${name}</th><td>${cm(result.measuredWidthCm)} / ${cm(result.measuredLengthCm)}</td><td>${cm(result.absoluteWidthErrorCm)} / ${cm(result.absoluteLengthErrorCm)}</td></tr>`
      : `<tr><th>${name}</th><td colspan="2" class="round8-worse">측정 실패 · ${safe(result.message || '원인을 기록하지 못했어요.')}</td></tr>`;
    return `<article class="round8-photo-card"><img src="${safe(row.sourceUrl)}" alt="${safe(garmentNames[row.garmentId] || '옷')} 원본 사진" loading="lazy" />
      <div><h3>${safe(backgrounds[row.backgroundId] || row.backgroundId)} · ${safe(garmentNames[row.garmentId] || row.garmentId)} · 기준 너비 ${cm(row.referenceWidthCm)} / 기장 ${cm(row.referenceLengthCm)}</h3>
      <table><thead><tr><th>방식</th><th>측정 너비 / 기장</th><th>너비 / 기장 오차</th></tr></thead><tbody>
      ${methodLine(baseline, '선택 조합 기준')}${methodLine(candidate, '6차 60%')}</tbody></table></div></article>`;
  }).join('');
}

fetch('./data/measure-dataset-round8.json').then((response) => {
  if (!response.ok) throw new Error('결과 파일 요청 실패');
  return response.json();
}).then((report) => {
  renderSummary(report);
  renderGarments(report);
  renderPhotos(report);
  status.textContent = `${new Date(report.generatedAt).toLocaleString('ko-KR')} · ${report.imageCount}장 · 대상 옷 ${report.targetImageCount}장을 포함해 비교했어요.`;
}).catch(() => {
  status.textContent = '6차 실험 결과를 불러오지 못했어요.';
});

