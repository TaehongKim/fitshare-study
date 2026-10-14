const status = document.querySelector('#round5-status');
const summaryRoot = document.querySelector('#round5-summary');
const photosRoot = document.querySelector('#round5-photos');
const conclusion = document.querySelector('#round5-conclusion');

const backgrounds = {
  point: '점 배경', cross: '격자 배경', ChArUco: 'ChArUco', ChaArUco_Cross: 'ChArUco 격자'
};

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function cm(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}cm` : '측정 실패';
}

function renderSummary(report) {
  const methods = report.testedResolutions.map((resolution) => [`px${resolution}`, `${resolution}px`]);
  summaryRoot.innerHTML = methods.map(([key, name]) => {
    const result = report.methods[key];
    return `<article class="round3-summary-card ${key === 'highResolution' ? 'is-conditional' : ''}">
      <h3>${name}</h3><div class="round3-metrics">
        <div class="round3-metric"><span>성공</span><strong>${result.successCount}/${result.imageCount}장</strong></div>
        <div class="round3-metric"><span>너비 평균 오차</span><strong>${cm(result.maeWidthCm)}</strong></div>
        <div class="round3-metric"><span>기장 평균 오차</span><strong>${cm(result.maeLengthCm)}</strong></div>
        <div class="round3-metric"><span>평균 처리 시간</span><strong>${result.averageElapsedMs}ms</strong></div>
      </div><p class="round3-repeat-note">기준 치수와의 평균 차이예요.</p></article>`;
  }).join('');
  const best = methods.map(([key]) => [key, report.methods[key]])
    .filter(([, result]) => Number.isFinite(result.maeWidthCm) && Number.isFinite(result.maeLengthCm))
    .sort((a, b) => a[1].maeWidthCm + a[1].maeLengthCm - b[1].maeWidthCm - b[1].maeLengthCm)[0];
  conclusion.innerHTML = best
    ? `<strong>너비와 기장 오차 합이 가장 낮은 조건은 ${best[0].slice(2)}px예요.</strong> 오차 합으로 해상도를 고른 참고 결과이며, 너비와 기장 오차도 각각 확인해 주세요.`
    : '성공한 측정이 없어 해상도별 정확도를 비교할 수 없어요.';
}

function renderPhotos(report) {
  const methods = report.testedResolutions.map((resolution) => [`px${resolution}`, `${resolution}px`]);
  photosRoot.innerHTML = report.rows.map((row) => {
    const widthName = row.widthKind === 'waist' ? '허리 너비' : '가슴 너비';
    const cells = Object.entries(methods).map(([key, name]) => {
      const result = row[key];
      const failed = result.status !== 'done';
      const values = failed ? safe(result.message || '측정하지 못했어요.') :
        `${cm(result.measuredWidthCm)} / ${cm(result.measuredLengthCm)}<br />오차 ${cm(result.absoluteWidthErrorCm)} / ${cm(result.absoluteLengthErrorCm)}<br />${result.canvas.width}×${result.canvas.height}px · ${result.elapsedMs}ms`;
      return `<tr class="${failed ? 'round3-failed' : ''}"><th>${name}</th><td>${values}</td></tr>`;
    }).join('');
    return `<article class="round3-photo-card"><h3>${safe(backgrounds[row.backgroundId] || row.backgroundId)} · ${safe(row.garmentName)}</h3>
      <div class="round3-images"><figure><img src="${safe(row.sourceUrl)}" alt="${safe(row.garmentName)} 원본 사진" loading="lazy" /><figcaption>원본 사진</figcaption></figure></div>
      <div><p><strong>기준:</strong> ${widthName} ${cm(row.referenceWidthCm)}, 기장 ${cm(row.referenceLengthCm)}</p>
        <table class="round3-result-table"><thead><tr><th>해상도</th><th>측정 너비/기장 · 절대 오차 · 캔버스/시간</th></tr></thead><tbody>${cells}</tbody></table></div></article>`;
  }).join('');
}

fetch('./data/measure-dataset-round5.json').then((response) => {
  if (!response.ok) throw new Error();
  return response.json();
}).then((report) => {
  renderSummary(report);
  renderPhotos(report);
  status.textContent = `${new Date(report.generatedAt).toLocaleString('ko-KR')} · 사진 ${report.imageCount}장 · 두 방법을 비교했어요.`;
}).catch(() => {
  status.textContent = '5차 실험 결과 파일을 불러오지 못했어요.';
});

