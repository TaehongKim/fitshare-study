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
  const status = root.querySelector('[data-size-status]');

  if (!form || !measuredWidth || !measuredLength || !garmentType || !autoSize || !status) {
    throw new Error('호수 자동 매핑 입력칸을 페이지에서 찾을 수 없어요.');
  }

  form.addEventListener('submit', (event) => event.preventDefault());

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
}

const matcher = document.querySelector('#size-matcher');
if (matcher) initializeSizeMatcher(matcher);

