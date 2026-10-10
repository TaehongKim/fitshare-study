const status = document.querySelector('#round3-status');
const rerun = document.querySelector('#round3-rerun');
const summaryRoot = document.querySelector('#round3-summary');
const backgroundRoot = document.querySelector('#round3-backgrounds');
const photosRoot = document.querySelector('#round3-photos');

const backgrounds = {
  point: '점 배경', cross: '격자 배경', ChArUco: 'ChArUco', ChaArUco_Cross: 'ChArUco 격자'
};
const methodNames = { always: '항상 평판화', conditional: '필요할 때만 평판화' };

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function cm(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}cm` : '측정 실패';
}

function renderSummary(report) {
  const repeatCount = report.repeatCount || 1;
  const trialCountPerMethod = report.trialCountPerMethod || report.imageCount;
  summaryRoot.innerHTML = ['always', 'conditional'].map((key) => {
    const result = report.methods[key];
    return `<article class="round3-summary-card ${key === 'conditional' ? 'is-conditional' : ''}">
      <h3>${methodNames[key]}</h3><div class="round3-metrics">
        <div class="round3-metric"><span>성공</span><strong>${result.successCount}/${result.imageCount}장</strong></div>
        <div class="round3-metric"><span>너비 평균 오차</span><strong>${cm(result.widthMaeCm)}</strong></div>
        <div class="round3-metric"><span>길이 평균 오차</span><strong>${cm(result.lengthMaeCm)}</strong></div>
      </div><p class="round3-repeat-note">사진마다 ${repeatCount}회 반복 · 방법별 총 ${trialCountPerMethod}회 분석<br />사진별 너비 흐들림 평균 ${cm(result.averageWithinPhotoWidthStdDevCm)}, 길이 ${cm(result.averageWithinPhotoLengthStdDevCm)}</p></article>`;
  }).join('');
  if (report.gemini && Array.isArray(report.gemini.rows)) {
    const references = new Map(report.rows.map((row) => [row.imageName, row]));
    const completed = report.gemini.rows.filter((row) => row.status === 'done' && references.has(row.photo));
    const widthMae = completed.length ? completed.reduce((sum, row) => sum + Math.abs(row.widthCm - references.get(row.photo).referenceWidthCm), 0) / completed.length : null;
    const lengthMae = completed.length ? completed.reduce((sum, row) => sum + Math.abs(row.lengthCm - references.get(row.photo).referenceLengthCm), 0) / completed.length : null;
    summaryRoot.innerHTML += `<article class="round3-summary-card"><h3>Gemini (사진당 최대 3회)</h3><div class="round3-metrics">
      <div class="round3-metric"><span>성공</span><strong>${completed.length}/${report.imageCount}</strong></div>
      <div class="round3-metric"><span>너비 평균 오차</span><strong>${cm(widthMae)}</strong></div>
      <div class="round3-metric"><span>길이 평균 오차</span><strong>${cm(lengthMae)}</strong></div>
    </div><p class="round3-repeat-note">네 배경 사진 20장을 사진당 최대 3회 요청해서 비교했어요.</p></article>`;
  }
}

function renderBackgrounds(report) {
  const rows = Object.entries(report.byBackground).map(([id, methods]) => `
    <tr><th scope="row">${safe(backgrounds[id] || id)}</th>
      <td class="num">${methods.always.successCount}/5 · ${cm(methods.always.widthMaeCm)} / ${cm(methods.always.lengthMaeCm)}</td>
      <td class="num">${methods.conditional.successCount}/5 · ${cm(methods.conditional.widthMaeCm)} / ${cm(methods.conditional.lengthMaeCm)}</td></tr>`).join('');
  backgroundRoot.innerHTML = `<table class="round3-table"><thead><tr><th>배경</th><th>항상 평판화 성공 · 너비/길이 오차</th><th>필요할 때만 성공 · 너비/길이 오차</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPhotos(report) {
  const geminiByPhoto = new Map((report.gemini?.rows || []).map((row) => [row.photo, row]));
  photosRoot.innerHTML = report.rows.map((row) => {
    const source = `/${String(row.sourceUrl || '').replace(/^\/+/, '')}`;
    const conditional = row.conditional;
    const image = conditional.overlayDataUrl
      ? `<img src="${safe(conditional.overlayDataUrl)}" alt="${safe(row.garmentName)} 조건부 분석 결과" loading="lazy" />`
      : '<div class="dataset-no-photo">분석 그림 없음</div>';
    const tableRows = ['always', 'conditional'].map((method) => {
      const result = row[method];
      const failure = result.status !== 'done';
      return `<tr class="${failure ? 'round3-failed' : ''}"><th>${methodNames[method]}</th>
        <td>${cm(result.widthCm)}</td><td>${cm(result.lengthCm)}</td>
        <td>${failure ? safe(result.message) : `${cm(result.widthErrorCm)} / ${cm(result.lengthErrorCm)}`}</td></tr>`;
    }).join('');
    const gemini = geminiByPhoto.get(row.imageName);
    const geminiRow = gemini
      ? `<tr class="${gemini.status === 'done' ? '' : 'round3-failed'}"><th>Gemini</th>
        <td>${cm(gemini.widthCm)}</td><td>${cm(gemini.lengthCm)}</td>
        <td>${gemini.status === 'done' ? `${cm(Math.abs(gemini.widthCm - row.referenceWidthCm))} / ${cm(Math.abs(gemini.lengthCm - row.referenceLengthCm))}` : safe(gemini.message || '?? ??')}</td></tr>`
      : '';
    const widthName = row.widthKind === 'waist' ? '허리 너비' : '가슴 너비';
    return `<article class="round3-photo-card">
      <h3>${safe(backgrounds[row.backgroundId] || row.backgroundId)} · ${safe(row.garmentName)}</h3>
      <div class="round3-images"><figure><img src="${safe(source)}" alt="${safe(row.garmentName)} 원본 사진" loading="lazy" /><figcaption>원본 사진</figcaption></figure>
        <figure>${image}<figcaption>조건부 방식의 측정선</figcaption></figure></div>
      <div><p><strong>기준:</strong> ${widthName} ${cm(row.referenceWidthCm)}, 길이 ${cm(row.referenceLengthCm)}</p>
        <table class="round3-result-table"><thead><tr><th>방법</th><th>너비</th><th>길이</th><th>너비/길이 오차</th></tr></thead><tbody>${tableRows}${geminiRow}</tbody></table>
        <p>조건부 방식: ${conditional.rectificationMode === 'perspective' ? '원근을 펴서 분석' : '원근은 펴지 않고 회전·크기만 맞춰 분석'}${Number.isFinite(conditional.perspectiveScore) ? ` (원근 점수 ${conditional.perspectiveScore.toFixed(4)})` : ''}</p>
      </div><p class="round3-repeat-note">100회 반복한 사진별 흐들림(표준편차): 너비 ${cm(row.always.widthStdDevCm)} / ${cm(row.conditional.widthStdDevCm)}, 길이 ${cm(row.always.lengthStdDevCm)} / ${cm(row.conditional.lengthStdDevCm)}</p></article>`;
  }).join('');
}

function showReport(report) {
  const repeatCount = report.repeatCount || 1;
  const trialCountPerMethod = report.trialCountPerMethod || report.imageCount;
  renderSummary(report);
  renderBackgrounds(report);
  renderPhotos(report);
  const date = report.generatedAt ? new Date(report.generatedAt).toLocaleString('ko-KR') : '방금';
  status.textContent = `${date} · 사진 ${report.imageCount}장 · 사진당 ${repeatCount}회 반복 · 방법당 ${trialCountPerMethod}회 분석`;
}

async function requestReport(path, method = 'GET') {
  const response = await fetch(path, { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined, body: method === 'POST' ? '{}' : undefined });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || '실험 결과를 불러오지 못했어요.');
  return body;
}

async function runExperiment() {
  rerun.disabled = true;
  status.textContent = '사진 20장을 방법마다 100회 분석해요. 완료될 때까지 페이지를 닫지 말아 주세요.';
  try {
    showReport(await requestReport('/api/measure-dataset/round3/run', 'POST'));
  } catch (error) {
    status.textContent = error.message;
  } finally {
    rerun.disabled = false;
  }
}

rerun.addEventListener('click', runExperiment);
requestReport('/api/measure-dataset/round3').then(showReport).catch(runExperiment);
