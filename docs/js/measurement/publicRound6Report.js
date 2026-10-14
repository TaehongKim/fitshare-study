const status = document.querySelector('#round6-status');
const methodsRoot = document.querySelector('#round6-methods');
const summaryRoot = document.querySelector('#round6-summary');
const conclusion = document.querySelector('#round6-conclusion');
const readingRoot = document.querySelector('#round6-reading');
const photosRoot = document.querySelector('#round6-photos');

const backgrounds = {
  point: '점 배경', cross: '격자 배경', ChArUco: 'ChArUco', ChaArUco_Cross: 'ChArUco 격자'
};
const garments = { 1: '상의 외투', 2: '흰 크롭티셔츠', 3: '원피스', 4: '점퍼', 5: '바지' };

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function cm(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}cm` : '측정 실패';
}

function ms(value) {
  if (!Number.isFinite(value)) return '기록 없음';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}초` : `${Math.round(value)}ms`;
}

function lowest(methods, ids, key) {
  return ids.filter((id) => Number.isFinite(methods[id][key]))
    .sort((a, b) => methods[a][key] - methods[b][key])[0];
}

function renderMethods(report, ids) {
  methodsRoot.innerHTML = ids.map((id) => {
    const info = report.methodLabels[id];
    const cls = id === 'grabcut' ? 'is-baseline' : id === 'hybrid' ? 'is-combo' : '';
    return `<article class="round6-method ${cls}"><h3>${safe(info.label)}</h3><p>${safe(info.description)}</p></article>`;
  }).join('');
}

function bar(label, value, max, className) {
  const width = Number.isFinite(value) ? Math.min(100, value / max * 100) : 0;
  return `<div class="round6-bar"><span>${label}</span><span class="round6-bar-track"><span class="round6-bar-fill ${className}" style="width:${width.toFixed(1)}%"></span></span><strong>${cm(value)}</strong></div>`;
}

function renderSummary(report, ids) {
  const max = Math.max(...ids.flatMap((id) => [report.methods[id].maeWidthCm, report.methods[id].maeLengthCm]
    .filter(Number.isFinite)));
  summaryRoot.innerHTML = ids.map((id) => {
    const result = report.methods[id];
    const iou = Number.isFinite(result.averageMaskIouWithGrabcut)
      ? ` · GrabCut 마스크와 겹침(IoU) ${result.averageMaskIouWithGrabcut.toFixed(2)}` : '';
    return `<article class="round3-summary-card ${id === 'hybrid' ? 'is-conditional' : ''}">
      <h3>${safe(report.methodLabels[id].label)}</h3>
      ${bar('너비', result.maeWidthCm, max, '')}${bar('기장', result.maeLengthCm, max, 'is-length')}
      <p class="round6-extra">성공 ${result.successCount}/${result.imageCount}장 · 평균 ${ms(result.averageElapsedMs)}${iou}</p>
    </article>`;
  }).join('');
}

function tableCells(group, ids) {
  const bestWidth = lowest(group, ids, 'maeWidthCm');
  const bestLength = lowest(group, ids, 'maeLengthCm');
  return ids.map((id) => {
    const result = group[id];
    if (!result.successCount) return '<td class="is-fail">측정 실패</td>';
    const failNote = result.failureCount ? ` <small>(실패 ${result.failureCount})</small>` : '';
    return `<td class="num"><span class="${id === bestWidth ? 'is-best' : ''}">${result.maeWidthCm.toFixed(1)}</span> / <span class="${id === bestLength ? 'is-best' : ''}">${result.maeLengthCm.toFixed(1)}</span>${failNote}</td>`;
  }).join('');
}

function renderTable(root, groups, nameOf, report, ids) {
  const head = `<thead><tr><th>구분</th>${ids.map((id) => `<th>${safe(report.methodLabels[id].label)}</th>`).join('')}</tr></thead>`;
  const body = Object.entries(groups).map(([key, group]) =>
    `<tr><th>${safe(nameOf(key))}</th>${tableCells(group, ids)}</tr>`).join('');
  root.innerHTML = `${head}<tbody>${body}</tbody>`;
}

function renderReading(report, ids) {
  const m = report.methods;
  const bestWidth = lowest(m, ids, 'maeWidthCm');
  const pants = report.byGarment['5'];
  const lines = [
    `<strong>너비</strong>는 ${safe(report.methodLabels[bestWidth].label)}가 가장 정확했어요(${cm(m[bestWidth].maeWidthCm)}). YOLO 계열 마스크는 소매나 가장자리를 더 넓게 잡는 경우가 많아 너비 오차가 ${cm(m.yolo.maeWidthCm)}, ${cm(m.yoloGrabcut.maeWidthCm)}로 커졌어요.`,
    `<strong>기장</strong>은 YOLO→GrabCut이 ${cm(m.yoloGrabcut.maeLengthCm)}로, 기존 GrabCut(${cm(m.grabcut.maeLengthCm)})보다 오차가 줄었어요. 고정 비율 사각형 대신 옷 모양을 씨앗으로 쓰면 윗부분과 밑단을 더 잘 잡았어요.`,
    `<strong>조합</strong>(너비 GrabCut + 기장 YOLO→GrabCut)은 ${cm(m.hybrid.maeWidthCm)} / ${cm(m.hybrid.maeLengthCm)}예요. 새 분할이 아니라 같은 20장에서 잘 맞은 값을 골라 합친 계산이라 실제보다 좋게 보일 수 있어요.`,
    `<strong>SAM</strong>은 사진 한 장에 ${ms(m.samBox.averageElapsedMs)}가 걸려 GrabCut의 ${ms(m.grabcut.averageElapsedMs)}보다 훨씬 느렸어요. 평균 오차는 너비 ${cm(m.samBox.maeWidthCm)}, 기장 ${cm(m.samBox.maeLengthCm)}로 가장 컸지만, 바지만 보면 ${cm(pants.samBox.maeWidthCm)} / ${cm(pants.samBox.maeLengthCm)}로 좋았어요. 마스크 자체는 소매까지 깔끔하게 잡는 경우가 많았어요. 상의와 원피스에서는 너비·기장 오차가 크게 벌어진 사진이 많았어요. SAM 마스크가 소매까지 넓게 잡혀 기존 너비·기장 규칙과 맞지 않았을 것으로 보이지만, 기장 오차의 정확한 원인은 이번에 확인하지 못했어요.`,
    '<strong>한계</strong>: 이번 실험은 마스크 모듈만 바꾸고 색으로 윤곽을 다듬는 단계와 너비·기장 규칙은 GrabCut용 그대로 썼어요. 그래서 새 모듈의 장점이 일부 가려졌을 수 있어요. 다음에는 색 다듬기 단계를 끄거나 모듈별 규칙을 따로 정해 비교해야 해요.'
  ];
  readingRoot.innerHTML = lines.map((line) => `<li>${line}</li>`).join('');
}

function renderConclusion(report, ids) {
  const bestWidth = lowest(report.methods, ids, 'maeWidthCm');
  const bestLength = lowest(report.methods, ids, 'maeLengthCm');
  const baseline = report.methods.grabcut;
  conclusion.innerHTML = `<strong>한 방법이 너비와 기장을 모두 이기지는 못했어요.</strong> 너비는 ${safe(report.methodLabels[bestWidth].label)}(${cm(report.methods[bestWidth].maeWidthCm)}), 기장은 ${safe(report.methodLabels[bestLength].label)}(${cm(report.methods[bestLength].maeLengthCm)})가 가장 낮았어요. 기존 GrabCut은 ${cm(baseline.maeWidthCm)} / ${cm(baseline.maeLengthCm)}예요.`;
}

function renderPhotos(report, ids) {
  photosRoot.innerHTML = report.rows.map((row) => {
    const widthName = row.widthKind === 'waist' ? '허리 너비' : '가슴 너비';
    const figures = ids.filter((id) => id !== 'hybrid').map((id) => {
      const result = row[id];
      const caption = safe(report.methodLabels[id].label);
      return result.status === 'done' && result.overlayUrl
        ? `<figure><img src="${safe(result.overlayUrl)}" alt="${safe(row.garmentName)} ${caption} 결과" loading="lazy" /><figcaption>${caption}</figcaption></figure>`
        : `<figure><div class="round6-failed-image">측정 실패</div><figcaption>${caption}</figcaption></figure>`;
    }).join('');
    const tableRows = ids.map((id) => {
      const result = row[id];
      const failed = result.status !== 'done';
      const values = failed ? safe(result.message || '측정하지 못했어요.')
        : `${cm(result.measuredWidthCm)} / ${cm(result.measuredLengthCm)} · 오차 ${cm(result.absoluteWidthErrorCm)} / ${cm(result.absoluteLengthErrorCm)} · ${ms(result.elapsedMs)}`;
      return `<tr class="${failed ? 'round3-failed' : ''}"><th>${safe(report.methodLabels[id].label)}</th><td>${values}</td></tr>`;
    }).join('');
    return `<article class="round6-photo-card"><h3>${safe(backgrounds[row.backgroundId] || row.backgroundId)} · ${safe(row.garmentName)}</h3>
      <p><strong>기준:</strong> ${widthName} ${cm(row.referenceWidthCm)}, 기장 ${cm(row.referenceLengthCm)}</p>
      <div class="round6-overlays"><figure><img src="${safe(row.sourceUrl)}" alt="${safe(row.garmentName)} 원본 사진" loading="lazy" /><figcaption>원본 사진</figcaption></figure>${figures}</div>
      <table class="round3-result-table"><thead><tr><th>방법</th><th>측정 너비/기장 · 절대 오차 · 시간</th></tr></thead><tbody>${tableRows}</tbody></table></article>`;
  }).join('');
}

fetch('./data/measure-dataset-round6.json').then((response) => {
  if (!response.ok) throw new Error();
  return response.json();
}).then((report) => {
  const ids = Object.keys(report.methods);
  renderMethods(report, ids);
  renderSummary(report, ids);
  renderConclusion(report, ids);
  renderTable(document.querySelector('#round6-garment-table'), report.byGarment, (key) => garments[key] || key, report, ids);
  renderTable(document.querySelector('#round6-background-table'), report.byBackground, (key) => backgrounds[key] || key, report, ids);
  renderReading(report, ids);
  renderPhotos(report, ids);
  status.textContent = `${new Date(report.generatedAt).toLocaleString('ko-KR')} · 사진 ${report.imageCount}장 · ${ids.length}가지 방법을 비교했어요.`;
}).catch(() => {
  status.textContent = '5차 실험 결과 파일을 불러오지 못했어요.';
});

