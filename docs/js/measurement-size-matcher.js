function isPositiveMeasurement(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

class SizeMatcherInputError extends Error {}

// 옷 자체의 실측값을 키 호수에 대응시키기 위한 안내용 참고표예요.
// KS의 공식 의류 치수표가 아니며 브랜드별 실제 치수와 다를 수 있어요.
const KOREAN_KIDS_SIZE_REFERENCE = {
  top: [
    { label: '90호', widthCm: 28, lengthCm: 38 },
    { label: '100호', widthCm: 30, lengthCm: 42 },
    { label: '110호', widthCm: 32, lengthCm: 46 },
    { label: '120호', widthCm: 34, lengthCm: 50 },
    { label: '130호', widthCm: 36, lengthCm: 54 },
    { label: '140호', widthCm: 38, lengthCm: 58 },
    { label: '150호', widthCm: 41, lengthCm: 62 },
    { label: '160호', widthCm: 44, lengthCm: 66 }
  ],
  dress: [
    { label: '90호', widthCm: 26, lengthCm: 48 },
    { label: '100호', widthCm: 28, lengthCm: 54 },
    { label: '110호', widthCm: 30, lengthCm: 60 },
    { label: '120호', widthCm: 32, lengthCm: 66 },
    { label: '130호', widthCm: 34, lengthCm: 72 },
    { label: '140호', widthCm: 36, lengthCm: 78 },
    { label: '150호', widthCm: 38, lengthCm: 84 },
    { label: '160호', widthCm: 40, lengthCm: 90 }
  ],
  pants: [
    { label: '90호', widthCm: 21, lengthCm: 50 },
    { label: '100호', widthCm: 22, lengthCm: 56 },
    { label: '110호', widthCm: 23, lengthCm: 62 },
    { label: '120호', widthCm: 24, lengthCm: 68 },
    { label: '130호', widthCm: 25, lengthCm: 74 },
    { label: '140호', widthCm: 26.5, lengthCm: 80 },
    { label: '150호', widthCm: 28, lengthCm: 86 },
    { label: '160호', widthCm: 29.5, lengthCm: 92 }
  ]
};

export function mapKoreanKidsSize({ garmentType, widthCm, lengthCm }) {
  const reference = KOREAN_KIDS_SIZE_REFERENCE[garmentType];
  if (!reference) {
    throw new SizeMatcherInputError('옷 종류를 선택해 주세요.');
  }
  const ranked = rankSizeCandidates({ widthCm, lengthCm }, reference);
  return { ...ranked[0], garmentType };
}

export function rankSizeCandidates(measured, candidates) {
  if (
    !measured ||
    !isPositiveMeasurement(measured.widthCm) ||
    !isPositiveMeasurement(measured.lengthCm)
  ) {
    throw new SizeMatcherInputError('실측한 너비와 기장은 0보다 큰 숫자로 입력해 주세요.');
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new SizeMatcherInputError('비교할 상품 호수와 치수를 입력해 주세요.');
  }

  return candidates.map((candidate) => {
    if (
      !candidate ||
      typeof candidate.label !== 'string' ||
      !candidate.label.trim() ||
      !isPositiveMeasurement(candidate.widthCm) ||
      !isPositiveMeasurement(candidate.lengthCm)
    ) {
      throw new SizeMatcherInputError('상품 치수표의 호수, 너비, 기장을 모두 확인해 주세요.');
    }

    // 너비와 기장 차이를 각각 실측값에 대한 비율로 바꿔요.
    const widthDifferenceCm = Math.abs(candidate.widthCm - measured.widthCm);
    const lengthDifferenceCm = Math.abs(candidate.lengthCm - measured.lengthCm);
    const errorRatio = (
      widthDifferenceCm / measured.widthCm +
      lengthDifferenceCm / measured.lengthCm
    ) / 2;

    // 점수가 작을수록 입력한 옷과 상품 치수표가 더 비슷해요.
    return {
      label: candidate.label.trim(),
      widthCm: candidate.widthCm,
      lengthCm: candidate.lengthCm,
      widthDifferenceCm,
      lengthDifferenceCm,
      errorRatio
    };
  }).sort((first, second) => first.errorRatio - second.errorRatio);
}

export function initializeSizeMatcher(root) {
  const form = root.querySelector('[data-size-matcher-form]');
  const measuredWidth = root.querySelector('[data-measured-width]');
  const measuredLength = root.querySelector('[data-measured-length]');
  const garmentType = root.querySelector('[data-garment-type]');
  const autoSize = root.querySelector('[data-auto-size]');
  const chartOptions = root.querySelector('[data-chart-options]');
  const rowTemplate = root.querySelector('[data-chart-row-template]');
  const status = root.querySelector('[data-size-status]');
  const results = root.querySelector('[data-size-results]');
  const addCandidateButton = root.querySelector('[data-add-candidate]');

  if (!form || !measuredWidth || !measuredLength || !garmentType || !autoSize || !chartOptions || !rowTemplate || !status || !results || !addCandidateButton) {
    throw new Error('사이즈 비교 입력칸을 페이지에서 찾을 수 없어요.');
  }

  let nextCandidateNumber = 1;
  const addCandidateRow = () => {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector('[data-row-title]').textContent = `호수 후보 ${nextCandidateNumber}`;
    nextCandidateNumber += 1;
    chartOptions.append(row);
  };

  addCandidateRow();
  addCandidateRow();

  addCandidateButton.addEventListener('click', () => {
    addCandidateRow();
    status.textContent = '';
  });

  const updateAutoSize = () => {
    status.textContent = '';
    try {
      const match = mapKoreanKidsSize({
        garmentType: garmentType.value,
        widthCm: measuredWidth.valueAsNumber,
        lengthCm: measuredLength.valueAsNumber
      });
      autoSize.value = match.label.replace('호', '');
      status.textContent = `가장 가까운 참고 호수는 ${match.label}예요. 아래에서 직접 바꿀 수 있어요.`;
    } catch (error) {
      if (!(error instanceof SizeMatcherInputError)) throw error;
      autoSize.value = '';
      status.textContent = error.message;
    }
  };

  measuredWidth.addEventListener('input', updateAutoSize);
  measuredLength.addEventListener('input', updateAutoSize);
  garmentType.addEventListener('change', updateAutoSize);

  autoSize.addEventListener('change', () => {
    if (autoSize.value) status.textContent = `선택한 호수를 ${autoSize.value}호로 바꿨어요.`;
  });

  chartOptions.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-candidate]');
    if (!removeButton) return;
    if (chartOptions.querySelectorAll('[data-chart-row]').length === 1) {
      status.textContent = '비교할 호수 후보를 하나 이상 남겨 주세요.';
      return;
    }
    removeButton.closest('[data-chart-row]').remove();
    status.textContent = '';
    results.replaceChildren();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    status.textContent = '';
    results.replaceChildren();

    const candidates = [...chartOptions.querySelectorAll('[data-chart-row]')].map((row) => ({
      label: row.querySelector('[data-candidate-label]').value,
      widthCm: row.querySelector('[data-candidate-width]').valueAsNumber,
      lengthCm: row.querySelector('[data-candidate-length]').valueAsNumber
    }));

    let ranked;
    try {
      ranked = rankSizeCandidates(
        { widthCm: measuredWidth.valueAsNumber, lengthCm: measuredLength.valueAsNumber },
        candidates
      );
    } catch (error) {
      if (!(error instanceof SizeMatcherInputError)) throw error;
      status.textContent = error.message;
      return;
    }

    const closestScore = ranked[0].errorRatio;
    const closestCandidates = ranked.filter(
      (candidate) => Math.abs(candidate.errorRatio - closestScore) <= 1e-12
    );
    const closestLabels = closestCandidates.map((candidate) => candidate.label);
    status.textContent = closestLabels.length === 1
      ? `가장 가까운 호수 후보는 ${closestLabels[0]}예요.`
      : `가장 가까운 후보의 점수가 같아요: ${closestLabels.join(', ')}.`;

    const resultRows = ranked.map((candidate) => {
      const item = document.createElement('li');
      item.className = 'size-result';
      if (Math.abs(candidate.errorRatio - closestScore) <= 1e-12) {
        item.classList.add('is-closest');
      }

      const label = document.createElement('strong');
      label.textContent = candidate.label;
      const difference = document.createElement('p');
      difference.textContent = `너비 ${candidate.widthDifferenceCm.toFixed(1)}cm 차이 · 기장 ${candidate.lengthDifferenceCm.toFixed(1)}cm 차이`;
      item.append(label, difference);
      return item;
    });
    results.replaceChildren(...resultRows);
  });
}

const matcher = document.querySelector('#size-matcher');
if (matcher) initializeSizeMatcher(matcher);

