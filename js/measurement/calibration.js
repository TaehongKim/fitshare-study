// 기준선을 자로 재어 본 길이와 사진 속 길이를 연결합니다.
export function calibrate(referencePixels, referenceCm) {
  if (!Number.isFinite(referencePixels) || referencePixels <= 0 || !Number.isFinite(referenceCm) || referenceCm <= 0) {
    throw new RangeError('기준 길이는 0보다 큰 숫자로 입력해 주세요.');
  }
  return referenceCm / referencePixels;
}

export function measureDistance(pointA, pointB, cmPerPixel) {
  const points = [pointA?.x, pointA?.y, pointB?.x, pointB?.y, cmPerPixel];
  if (!points.every(Number.isFinite) || cmPerPixel <= 0) throw new RangeError('두 점과 기준 길이를 다시 확인해 주세요.');
  const pixels = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
  if (pixels === 0) throw new RangeError('두 점이 겹쳐 있어요. 선의 양끝을 다시 옮겨 주세요.');
  return pixels * cmPerPixel;
}

// A0 종이 크기(가로 84.1cm, 세로 118.9cm)를 기준으로 옷 상자를 cm로 바꿉니다.
export function measureA0Garment(box, category, imageWidth = 600, imageHeight = 848) {
  const values = [box?.left, box?.top, box?.right, box?.bottom, imageWidth, imageHeight];
  if (!values.every(Number.isFinite) || imageWidth <= 0 || imageHeight <= 0
      || box.left < 0 || box.top < 0 || box.right > imageWidth || box.bottom > imageHeight
      || box.right <= box.left || box.bottom <= box.top) {
    throw new RangeError('사진 속 옷 위치를 확인할 수 없어요. 다시 찍거나 직접 길이를 입력해 주세요.');
  }
  const widthCm = (box.right - box.left) * 84.1 / imageWidth;
  const heightCm = (box.bottom - box.top) * 118.9 / imageHeight;
  const lengthCm = category === 'other' ? Math.max(widthCm, heightCm) : heightCm;
  const acrossCm = category === 'other' ? Math.min(widthCm, heightCm) : widthCm;
  if (lengthCm > 300 || acrossCm > 300) throw new RangeError('옷 크기를 자동으로 계산하기 어려워요. 값을 직접 확인해 주세요.');
  return { lengthCm: Number(lengthCm.toFixed(1)), widthCm: Number(acrossCm.toFixed(1)) };
}

// 자동으로 찾은 옷 상자 주변에 조금 여백을 두고 사진을 자를 범위를 구해요.
export function getClothingCropBounds(box, imageWidth, imageHeight, paddingRatio = 0.05) {
  const values = [box?.left, box?.top, box?.right, box?.bottom, imageWidth, imageHeight, paddingRatio];
  if (!values.every(Number.isFinite) || imageWidth <= 0 || imageHeight <= 0 || paddingRatio < 0 || paddingRatio > 1
      || box.left < 0 || box.top < 0 || box.right > imageWidth || box.bottom > imageHeight
      || box.right <= box.left || box.bottom <= box.top) {
    throw new RangeError('옷과 사진의 크기를 다시 확인해 주세요.');
  }
  const padX = (box.right - box.left) * paddingRatio;
  const padY = (box.bottom - box.top) * paddingRatio;
  const left = Math.max(0, Math.floor(box.left - padX));
  const top = Math.max(0, Math.floor(box.top - padY));
  const right = Math.min(imageWidth, Math.ceil(box.right + padX));
  const bottom = Math.min(imageHeight, Math.ceil(box.bottom + padY));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function calculateError(measuredCm, referenceCm) {
  if (![measuredCm, referenceCm].every(Number.isFinite) || measuredCm < 0 || referenceCm <= 0) {
    throw new RangeError('측정값과 기준값을 확인해 주세요.');
  }
  const errorCm = measuredCm - referenceCm;
  return { errorCm, absoluteErrorCm: Math.abs(errorCm) };
}

export function summarizeMeasurements(records) {
  const all = Array.isArray(records) ? records : [];
  const done = all.filter((record) => record.status === 'done' && Number.isFinite(record.errorCm));
  const errors = done.map((record) => record.errorCm);
  const meanErrorCm = errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : 0;
  const maeCm = errors.length ? errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length : 0;
  const repeatSdCm = errors.length > 1
    ? Math.sqrt(errors.reduce((sum, value) => sum + (value - meanErrorCm) ** 2, 0) / (errors.length - 1))
    : 0;
  const failureRatePct = all.length ? (all.filter((record) => record.status === 'failed').length / all.length) * 100 : 0;
  const editRatePct = all.length ? (all.filter((record) => record.edited).length / all.length) * 100 : 0;
  return { maeCm, meanErrorCm, repeatSdCm, failureRatePct, editRatePct, completedCount: done.length };
}
