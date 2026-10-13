function isPositiveMeasurement(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function rankSizeCandidates(measured, candidates) {
  if (
    !measured ||
    !isPositiveMeasurement(measured.widthCm) ||
    !isPositiveMeasurement(measured.lengthCm)
  ) {
    throw new Error('실측한 너비와 기장은 0보다 큰 숫자로 입력해 주세요.');
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('비교할 상품 호수와 치수를 입력해 주세요.');
  }

  return candidates.map((candidate) => {
    if (
      !candidate ||
      typeof candidate.label !== 'string' ||
      !candidate.label.trim() ||
      !isPositiveMeasurement(candidate.widthCm) ||
      !isPositiveMeasurement(candidate.lengthCm)
    ) {
      throw new Error('상품 치수표의 호수, 너비, 기장을 모두 확인해 주세요.');
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
