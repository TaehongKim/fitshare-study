const status = document.querySelector('#round7-status');
const summaryRoot = document.querySelector('#round7-summary');
const conclusion = document.querySelector('#round7-conclusion');
const methodsRoot = document.querySelector('#round7-methods');
const photosRoot = document.querySelector('#round7-photos');

const methodIds = ['baseline', 'integrated'];
const backgroundNames = {
  point: '점 배경', cross: '격자 배경', ChArUco: 'ChArUco', ChaArUco_Cross: 'ChArUco 격자'
};
const garmentNames = { 1: '상의 외투', 2: '크롭 티셔츠', 3: '원피스', 4: '점퍼', 5: '바지' };

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function cm(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}cm` : '기록 없음';
}

function elapsed(value) {
  if (!Number.isFinite(value)) return '기록 없음';
  return value >= 1000 ? `${(value / 1000).toFixed(2)}초` : `${Math.round(value)}ms`;
}

function renderSummary(report) {
  summaryRoot.innerHTML = methodIds.map((id) => {
    const value = report.methods[id];
    const tone = id === 'integrated' ? 'is-integrated' : '';
    return `<article class="round7-summary-card ${tone}">
      <h3>${safe(report.methodLabels[id].label)}</h3>
      <div class="round7-metric-grid">
        <div class="round7-metric"><span>성공 장수</span><strong>${value.successCount}/${value.imageCount}</strong><small>성공률 ${value.successRatePct}% · 실패 ${value.failureCount}장</small></div>
        <div class="round7-metric"><span>너비 평균 절대 오차</span><strong>${cm(value.maeWidthCm)}</strong><small>기준 치수와의 평균 차이</small></div>
        <div class="round7-metric"><span>기장 평균 절대 오차</span><strong>${cm(value.maeLengthCm)}</strong><small>기준 치수와의 평균 차이</small></div>
        <div class="round7-metric"><span>사진당 평균 처리 시간</span><strong>${elapsed(value.averageElapsedMs)}</strong><small>사진 보정부터 치수 계산까지</small></div>
      </div>
    </article>`;
  }).join('');
}

function renderMethods(report) {
  methodsRoot.innerHTML = methodIds.map((id) => `<article class="round7-method ${id === 'integrated' ? 'is-integrated' : ''}">
    <h3>${safe(report.methodLabels[id].label)}</h3><p>${safe(report.methodLabels[id].description)}</p></article>`).join('');
}

function betterClass(first, second) {
  if (!Number.isFinite(first) || !Number.isFinite(second) || first === second) return '';
  return first < second ? 'is-better' : 'is-worse';
}

function renderGroupTable(root, groups, labelOf) {
  const rows = Object.entries(groups).map(([key, group]) => {
    const baseline = group.baseline;
    const integrated = group.integrated;
    const cell = (value, axis) => {
      if (!value.successCount) return '<td>측정 실패</td>';
      const metric = axis === 'width' ? 'maeWidthCm' : 'maeLengthCm';
      const cls = betterClass(value[metric], baseline[metric]);
      return `<td class="${cls}">${value.successCount}/${value.imageCount} · ${cm(value.maeWidthCm)} / ${cm(value.maeLengthCm)} · ${elapsed(value.averageElapsedMs)}</td>`;
    };
    return `<tr><th>${safe(labelOf(key))}</th>${cell(baseline)}${cell(integrated)}</tr>`;
  }).join('');
  root.innerHTML = `<thead><tr><th>구분</th><th>현재 기준<br />너비 / 기장 · 시간</th><th>7차 통합<br />너비 / 기장 · 시간</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderPhotos(report) {
  photosRoot.innerHTML = report.rows.map((row) => {
    const resultRows = methodIds.map((id) => {
      const result = row[id];
      if (result.status !== 'done') {
        return `<tr class="round7-failed"><th>${safe(report.methodLabels[id].label)}</th><td colspan="3">측정 실패: ${safe(result.message || '원인을 기록하지 못했어요.')} · ${elapsed(result.elapsedMs)}</td></tr>`;
      }
      return `<tr><th>${safe(report.methodLabels[id].label)}</th><td>${cm(result.measuredWidthCm)} / ${cm(result.measuredLengthCm)}</td><td>${cm(result.absoluteWidthErrorCm)} / ${cm(result.absoluteLengthErrorCm)}</td><td>${elapsed(result.elapsedMs)}</td></tr>`;
    }).join('');
    return `<article class="round7-photo-card"><img class="round7-photo-thumb" src="${safe(row.sourceUrl)}" alt="${safe(row.garmentName)} 원본 사진" loading="lazy" />
      <div><details class="round7-photo" open><summary>${safe(backgroundNames[row.backgroundId] || row.backgroundId)} · ${safe(row.garmentName)} <span>기준 너비 ${cm(row.referenceWidthCm)} / 기장 ${cm(row.referenceLengthCm)}</span></summary>
      <table><thead><tr><th>방식</th><th>측정 너비 / 기장</th><th>절대 오차 너비 / 기장</th><th>시간</th></tr></thead><tbody>${resultRows}</tbody></table>
      <p><a href="${safe(row.sourceUrl)}" target="_blank" rel="noreferrer">사진 원본 보기</a></p></details></div></article>`;
  }).join('');
}

function renderConclusion(report) {
  const base = report.methods.baseline;
  const next = report.methods.integrated;
  const widthDelta = next.maeWidthCm - base.maeWidthCm;
  const lengthDelta = base.maeLengthCm - next.maeLengthCm;
  const speedRatio = next.averageElapsedMs / base.averageElapsedMs;
  conclusion.innerHTML = `<strong>기장은 평균 ${cm(lengthDelta)} 줄었고, 너비는 ${cm(widthDelta)} 늘었어요.</strong> 성공 장수는 ${next.successCount}/${next.imageCount}장으로 기준의 ${base.successCount}/${base.imageCount}장보다 1장 적었습니다. 평균 처리 시간은 약 ${speedRatio.toFixed(1)}배가 됐어요. 이 결과는 20장 데이터셋에 한정됩니다.`;
}

function renderReading(report) {
  const base = report.methods.baseline;
  const next = report.methods.integrated;
  const failed = report.rows.filter((row) => row.integrated.status !== 'done');
  const failureText = failed.length
    ? `실패한 사진은 ${failed.map((row) => `${backgroundNames[row.backgroundId] || row.backgroundId} · ${row.garmentName}`).join(', ')}이고, 옷 마스크가 너무 작다고 판단됐어요.`
    : '통합 방식에서 실패한 사진은 없어요.';
  document.querySelector('#round7-reading').innerHTML = [
    `<strong>기장:</strong> 평균 오차가 ${cm(base.maeLengthCm)}에서 ${cm(next.maeLengthCm)}로 줄었어요. 기장 끝점을 찾는 데 YOLO가 옷을 먼저 찾고 GrabCut이 경계를 다듬는 방식이 이번 표본에서 더 잘 맞았어요.`,
    `<strong>너비:</strong> 평균 오차가 ${cm(base.maeWidthCm)}에서 ${cm(next.maeWidthCm)}로 늘었어요. 너비는 기존 GrabCut을 유지했지만, 작업 해상도 변화가 너비선을 포함한 전체 분할에 영향을 줄 수 있어요.`,
    `<strong>시간:</strong> 통합 방식은 사진당 평균 ${elapsed(next.averageElapsedMs)}가 걸렸어요. 보고서에는 실험 중 모델을 처음 읽는 시간이 포함됐고, 이미 저장된 모델 파일을 사용해 다운로드는 없었어요. 모델 캐시가 비어 있으면 첫 사용 시간은 더 길 수 있어요.`,
    `<strong>실패 사례:</strong> ${safe(failureText)}`,
    '<strong>해석 범위:</strong> 알고리즘을 선택한 4·5차와 같은 20장으로 통합 결과를 다시 확인했어요. 별도의 새 사진 검증이 아니므로 다른 촬영 조건에서의 결과는 추가 실험이 필요해요.'
  ].map((line) => `<li>${line}</li>`).join('');
}

fetch('./data/measure-dataset-round7.json').then((response) => {
  if (!response.ok) throw new Error('결과 파일 요청 실패');
  return response.json();
}).then((report) => {
  renderSummary(report);
  renderMethods(report);
  renderConclusion(report);
  renderGroupTable(document.querySelector('#round7-garment-table'), report.byGarment,
    (key) => garmentNames[key] || key);
  renderGroupTable(document.querySelector('#round7-background-table'), report.byBackground,
    (key) => backgroundNames[key] || key);
  renderPhotos(report);
  renderReading(report);
  status.textContent = `${new Date(report.generatedAt).toLocaleString('ko-KR')} · ${report.imageCount}장 · 기준과 통합 방식을 비교했어요.`;
}).catch(() => {
  status.textContent = '7차 실험 결과 파일을 불러오지 못했어요.';
});

