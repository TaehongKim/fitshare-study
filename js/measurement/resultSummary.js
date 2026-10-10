// 완료된 측정값의 절대 오차 평균을 그룹별로 계산해요.
export function summarizeRecords(records, groupKey, expectedGroups) {
  return expectedGroups.map((key) => {
    const completed = records.filter((record) => record.status === 'done' && record[groupKey] === key);
    const widthErrors = completed.map((record) => record.errorWidthCm)
      .filter((value) => typeof value === 'number' && Number.isFinite(value)).map(Math.abs);
    const lengthErrors = completed.map((record) => record.errorLengthCm)
      .filter((value) => typeof value === 'number' && Number.isFinite(value)).map(Math.abs);
    const widthMaeCm = mean(widthErrors);
    const lengthMaeCm = mean(lengthErrors);
    const overallMaeCm = widthMaeCm === null || lengthMaeCm === null
      ? null : roundToOne((widthMaeCm + lengthMaeCm) / 2);

    return { key, count: completed.length, widthMaeCm, lengthMaeCm, overallMaeCm };
  });
}

// 분석이 끝난 사진에 한해서 원본 파일 이름과 윤곽 그림을 연결해요.
export function makeOverlayMap(report) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  return new Map(rows
    .filter((row) => row.status === 'done' && typeof row.imageName === 'string'
      && row.imageName && typeof row.overlayDataUrl === 'string' && row.overlayDataUrl.startsWith('data:image/'))
    .map((row) => [row.imageName, row.overlayDataUrl]));
}

function mean(values) {
  if (!values.length) return null;
  return roundToOne(values.reduce((total, value) => total + value, 0) / values.length);
}

function roundToOne(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
