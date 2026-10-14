const status = document.querySelector('#round4-status');
const summaryRoot = document.querySelector('#round4-summary');
const backgroundRoot = document.querySelector('#round4-backgrounds');
const photosRoot = document.querySelector('#round4-photos');
const conclusion = document.querySelector('#round4-conclusion');

const backgrounds = {
  point: '점 배경', cross: '격자 배경', ChArUco: 'ChArUco', ChaArUco_Cross: 'ChArUco 격자'
};
const methods = { a0: 'A0 전체 크기', pattern: '무늬 간격' };

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function cm(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}cm` : '측정 실패';
}

function scale(value) {
  return Number.isFinite(value) ? `${value.toFixed(3)}cm/px` : '값 없음';
}

function renderSummary(report) {
  summaryRoot.innerHTML = ['a0', 'pattern'].map((key) => {
    const result = report.methods[key];
    return `<article class="round3-summary-card ${key === 'pattern' ? 'is-conditional' : ''}">
      <h3>${methods[key]}</h3><div class="round3-metrics">
        <div class="round3-metric"><span>성공</span><strong>${result.successCount}/${result.imageCount}장</strong></div>
        <div class="round3-metric"><span>너비 평균 오차</span><strong>${cm(result.maeWidthCm)}</strong></div>
        <div class="round3-metric"><span>기장 평균 오차</span><strong>${cm(result.maeLengthCm)}</strong></div>
      </div><p class="round3-repeat-note">사진 전체에서 잰 값과 파일 기준값의 평균 차이예요.</p></article>`;
  }).join('');
  const old = report.methods.a0;
  const next = report.methods.pattern;
  const widthDelta = next.maeWidthCm - old.maeWidthCm;
  const lengthDelta = next.maeLengthCm - old.maeLengthCm;
  const direction = (delta) => `${Math.abs(delta).toFixed(2)}cm ${delta < 0 ? '줄었어요' : delta > 0 ? '늘었어요' : '같아요'}`;
  conclusion.innerHTML = `<strong>이번 20장 결과:</strong> 무늬 간격 환산의 너비 평균 오차는 ${direction(widthDelta)}, 기장 평균 오차는 ${direction(lengthDelta)}예요. 따라서 이번 데이터에서는 전체 정확도가 개선됐다고 보기 어려워요.`;
}

function renderBackgrounds(report) {
  const rows = Object.entries(report.byBackground).map(([id, result]) => `
    <tr><th scope="row">${safe(backgrounds[id] || id)}</th>
      <td>${result.a0.successCount}/${result.a0.imageCount}장 · ${cm(result.a0.maeWidthCm)} / ${cm(result.a0.maeLengthCm)}</td>
      <td>${result.pattern.successCount}/${result.pattern.imageCount}장 · ${cm(result.pattern.maeWidthCm)} / ${cm(result.pattern.maeLengthCm)}</td></tr>`).join('');
  backgroundRoot.innerHTML = `<table class="round3-table"><thead><tr><th>배경</th><th>A0 전체 크기 · 너비/기장 오차</th><th>무늬 간격 · 너비/기장 오차</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPhotos(report) {
  photosRoot.innerHTML = report.rows.map((row) => {
    const widthName = row.widthKind === 'waist' ? '허리 너비' : '가슴 너비';
    const rows = ['a0', 'pattern'].map((key) => {
      const result = row[key];
      const failed = result.status !== 'done';
      return `<tr class="${failed ? 'round3-failed' : ''}"><th>${methods[key]}</th>
        <td>${cm(result.measuredWidthCm)} / ${cm(result.measuredLengthCm)}</td>
        <td>${failed ? safe(result.message || '측정하지 못했어요.') : `${cm(result.absoluteWidthErrorCm)} / ${cm(result.absoluteLengthErrorCm)}`}</td></tr>`;
    }).join('');
    return `<article class="round3-photo-card"><h3>${safe(backgrounds[row.backgroundId] || row.backgroundId)} · ${safe(row.garmentName)}</h3>
      <div class="round3-images"><figure><img src="${safe(row.sourceUrl)}" alt="${safe(row.garmentName)} 원본 사진" loading="lazy" /><figcaption>원본 사진</figcaption></figure></div>
      <div><p><strong>기준:</strong> ${widthName} ${cm(row.referenceWidthCm)}, 기장 ${cm(row.referenceLengthCm)}</p>
        <table class="round3-result-table"><thead><tr><th>환산 방식</th><th>너비 / 기장</th><th>너비 / 기장 오차</th></tr></thead><tbody>${rows}</tbody></table>
        <p>무늬 간격 환산: ${scale(row.patternScaleCmPerPixel?.x)} × ${scale(row.patternScaleCmPerPixel?.y)}</p></div></article>`;
  }).join('');
}

fetch('./data/measure-dataset-round4.json').then((response) => {
  if (!response.ok) throw new Error();
  return response.json();
}).then((report) => {
  renderSummary(report);
  renderBackgrounds(report);
  renderPhotos(report);
  status.textContent = `${new Date(report.generatedAt).toLocaleString('ko-KR')} · 사진 ${report.imageCount}장 · 같은 사진에 두 환산식을 적용했어요.`;
}).catch(() => {
  status.textContent = '4차 실험 결과 파일을 불러오지 못했어요.';
});

