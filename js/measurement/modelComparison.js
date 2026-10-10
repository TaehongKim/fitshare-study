// 저장된 모델 실험을 초등학생도 비교할 수 있는 표와 사진으로 보여줘요.
function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function displayCm(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}cm` : '값 없음';
}

function displayMae(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}cm` : '값 없음';
}

function displaySpeed(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}ms/장` : '기록 없음';
}

function imageMarkup(url, alt) {
  if (typeof url !== 'string' || !url) {
    return '<div class="model-comparison-no-image">결과 그림 없음</div>';
  }
  return `<img src="${safeText(url)}" alt="${safeText(alt)}" loading="lazy" decoding="async" />`;
}

export function renderModelComparison(elements, comparison) {
  const methodById = new Map(comparison.methods.map((method) => [method.id, method]));
  elements.summary.innerHTML = `<table class="dataset-table model-comparison-table">
    <thead><tr><th scope="col">방법</th><th scope="col">측정 성공</th><th scope="col">너비 평균 오차</th><th scope="col">기장 평균 오차</th><th scope="col">처리 시간</th></tr></thead>
    <tbody>${comparison.methods.map((method) => `<tr>
      <th scope="row">${safeText(method.name)}</th>
      <td>${method.successCount}/${comparison.sampleCount}장</td>
      <td>${displayMae(method.widthMaeCm)}</td>
      <td>${displayMae(method.lengthMaeCm)}</td>
      <td>${displaySpeed(method.averageInferenceMs)}</td>
    </tr>`).join('')}</tbody>
  </table>`;

  elements.details.innerHTML = comparison.rows.map((row) => {
    const widthName = row.widthKind === 'waist' ? '허리 너비' : '가슴 너비';
    const methodPictures = comparison.methods.map((method) => {
      const result = row.measurements[method.id] || {};
      const image = imageMarkup(result.overlayUrl, `${row.garmentName} · ${method.name} 결과 그림`);
      return `<figure class="model-comparison-figure">
        ${image}
        <figcaption><strong>${safeText(method.name)}</strong><br />${widthName} ${displayCm(result.widthCm)} · 기장 ${displayCm(result.lengthCm)}</figcaption>
      </figure>`;
    }).join('');
    return `<article class="model-comparison-card">
      <header><h3>${safeText(row.garmentName)}</h3><p>기준 ${displayCm(row.referenceWidthCm)} × ${displayCm(row.referenceLengthCm)}</p></header>
      <div class="model-comparison-images">
        <figure class="model-comparison-figure">${imageMarkup(row.sourceUrl, `${row.garmentName} 원본 사진`)}<figcaption><strong>원본 사진</strong></figcaption></figure>
        ${methodPictures}
      </div>
    </article>`;
  }).join('');

  const bestWidth = comparison.methods
    .filter((method) => Number.isFinite(method.widthMaeCm))
    .sort((left, right) => left.widthMaeCm - right.widthMaeCm)[0];
  const bestLength = comparison.methods
    .filter((method) => Number.isFinite(method.lengthMaeCm))
    .sort((left, right) => left.lengthMaeCm - right.lengthMaeCm)[0];
  const pipeline = methodById.get('fitshare');
  const yolo = methodById.get('yolo');
  elements.status.textContent = `${comparison.sampleCount}장 같은 사진 비교 완료 · 너비는 ${safeText(bestWidth?.name || '비교할 방법 없음')}, 기장은 ${safeText(bestLength?.name || '비교할 방법 없음')}의 평균 오차가 가장 작아요. 작은 오차가 기준값에 가까워요.`;
  if (!pipeline || !yolo) {
    elements.status.textContent = '비교 표를 만들 결과가 부족해요. 저장된 실험 파일을 확인해 주세요.';
  }
  elements.deepFashion2.textContent = comparison.deepFashion2Note || 'DeepFashion2는 의류 데이터셋이에요.';
  if (comparison.dataProvenanceWarning) {
    elements.warning.textContent = 'YOLO 모델 설명에는 DeepFashion2 학습이라고 적혀 있지만, 모델 파일 안에는 다른 학습 자료와 AGPL-3.0 정보가 있어요. 이 결과는 비교 실험으로만 보고, 실제 배포 전에는 출처와 사용 조건을 다시 확인해야 해요.';
    elements.warning.hidden = false;
  } else {
    elements.warning.textContent = '';
    elements.warning.hidden = true;
  }
}

export function renderModelComparisonError(elements, message) {
  elements.status.textContent = message || 'AI 실험 결과를 불러오지 못했어요.';
  elements.summary.innerHTML = '<p class="analysis-note">저장된 실험 결과 파일이 있는지 확인해 주세요.</p>';
  elements.details.replaceChildren();
  elements.deepFashion2.textContent = 'DeepFashion2는 의류 데이터셋이며, 측정 알고리즘 자체는 아니에요.';
  elements.warning.hidden = true;
}

// 20장 Gemini 실험은 M4의 다른 모델 비교와 나눠서 보여줘요.
export function renderGeminiComparison(elements, comparison) {
  const names = {
    point: '점 배경', cross: '격자 배경',
    ChArUco: 'ChArUco 배경', ChaArUco_Cross: 'ChArUco 격자 배경'
  };
  if (!comparison || !Array.isArray(comparison.rows) || comparison.rows.length === 0) {
    elements.summary.replaceChildren();
    elements.details.replaceChildren();
    elements.status.textContent = '아직 저장된 Gemini 결과가 없어요. 버튼을 눌러 20장을 분석해 보세요.';
    return;
  }

  const methods = comparison.methods || [];
  const metricTable = (items, heading) => `<h3>${safeText(heading)}</h3><table class="dataset-table">
    <thead><tr><th>측정 방법</th><th>측정 성공</th><th>너비 평균 오차</th><th>기장 평균 오차</th></tr></thead>
    <tbody>${items.map((item) => `<tr><th>${safeText(item.name)}</th><td>${item.successCount}/${item.sampleCount ?? comparison.sampleCount}장</td><td>${displayMae(item.widthMaeCm)}</td><td>${displayMae(item.lengthMaeCm)}</td></tr>`).join('')}</tbody></table>`;
  elements.summary.innerHTML = metricTable(methods, '전체 20장 결과') +
    Object.entries(comparison.byBackground || {}).map(([id, group]) => metricTable(group.methods || [], `${names[id] || id} · ${group.sampleCount}장`)).join('');

  const grouped = new Map();
  for (const row of comparison.rows) {
    if (!grouped.has(row.backgroundId)) grouped.set(row.backgroundId, []);
    grouped.get(row.backgroundId).push(row);
  }
  elements.details.innerHTML = [...grouped.entries()].map(([backgroundId, rows]) => `<section class="gemini-background-group">
    <h3>${safeText(names[backgroundId] || backgroundId)} 사진 결과 (${rows.length}장)</h3>
    <div class="gemini-photo-grid">${rows.map((row) => {
      const fit = row.measurements?.fitshare || {};
      const gemini = row.measurements?.gemini || {};
      const widthLabel = row.widthKind === 'waist' ? '허리 너비' : '가슴 너비';
      const note = row.measurements?.geminiNote;
      return `<article class="gemini-photo-card"><img src="${safeText(row.sourceUrl)}" alt="${safeText(row.garmentName)} 원본 사진" loading="lazy" decoding="async" />
        <h4>${safeText(row.garmentName)}</h4><dl>
        <div><dt>기준 ${widthLabel}</dt><dd>${displayCm(row.referenceWidthCm)}</dd></div>
        <div><dt>FitShare ${widthLabel}</dt><dd>${displayCm(fit.widthCm)}</dd></div>
        <div><dt>Gemini ${widthLabel}</dt><dd>${displayCm(gemini.widthCm)}</dd></div>
        <div><dt>기준 기장</dt><dd>${displayCm(row.referenceLengthCm)}</dd></div>
        <div><dt>FitShare 기장</dt><dd>${displayCm(fit.lengthCm)}</dd></div>
        <div><dt>Gemini 기장</dt><dd>${displayCm(gemini.lengthCm)}</dd></div>
        </dl>${note ? `<p class="gemini-photo-note">${safeText(note)}</p>` : ''}</article>`;
    }).join('')}</div></section>`).join('');
  elements.status.textContent = `${comparison.sampleCount}장 비교 결과예요. Gemini의 숫자는 추정값이며, 오차가 작을수록 기준 크기에 가까워요.`;
}
