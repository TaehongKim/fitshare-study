import { loadPhotoImage, releasePhotoImage } from './photoImage.js?v=photo-load-fallback-2';

// object-fit: contain으로 생긴 빈 공간을 빼고 화면 클릭점을 사진 좌표로 바꿔요.
export function mapPointerToImagePoint(clientX, clientY, rect, imageWidth, imageHeight) {
  const numbers = [clientX, clientY, rect?.left, rect?.top, rect?.width, rect?.height, imageWidth, imageHeight];
  if (!numbers.every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || imageWidth <= 0 || imageHeight <= 0) return null;
  const scale = Math.min(rect.width / imageWidth, rect.height / imageHeight);
  const drawnWidth = imageWidth * scale;
  const drawnHeight = imageHeight * scale;
  const offsetX = (rect.width - drawnWidth) / 2;
  const offsetY = (rect.height - drawnHeight) / 2;
  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;
  if (localX < 0 || localY < 0 || localX > drawnWidth || localY > drawnHeight) return null;
  return { x: localX / scale, y: localY / scale };
}

// 사진의 네 기준점을 종이의 네 모서리 위치로 옮기는 변환을 구합니다.
export function createPerspectiveTransform(sourceCorners, targetCorners) {
  if (!Array.isArray(sourceCorners) || !Array.isArray(targetCorners) || sourceCorners.length !== 4 || targetCorners.length !== 4) {
    throw new RangeError('사진 속 네 모서리를 모두 골라 주세요.');
  }
  if (!hasValidCornerOrder(sourceCorners) || !hasValidCornerOrder(targetCorners)) {
    throw new RangeError('모서리를 왼쪽 위에서 시작해 시계 방향으로 차례대로 골라 주세요. 점이 교차하거나 한 줄로 놓이면 사진을 펼 수 없어요.');
  }
  const rows = [];
  const values = [];
  for (let index = 0; index < 4; index++) {
    const { x, y } = sourceCorners[index];
    const { x: u, y: v } = targetCorners[index];
    if (![x, y, u, v].every(Number.isFinite)) throw new RangeError('모서리 위치가 올바르지 않아요.');
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); values.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]); values.push(v);
  }
  const solved = solve(rows, values);
  return [...solved, 1];
}

function hasValidCornerOrder(points) {
  if (points.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) return false;
  const turns = points.map((point, index) => {
    const next = points[(index + 1) % 4]; const after = points[(index + 2) % 4];
    return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
  });
  return turns.every((turn) => turn > 1e-6) || turns.every((turn) => turn < -1e-6);
}

export function transformPoint(point, matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const divisor = g * point.x + h * point.y + i;
  if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-8) throw new RangeError('사진 보정 기준점을 다시 골라 주세요.');
  return { x: (a * point.x + b * point.y + c) / divisor, y: (d * point.x + e * point.y + f) / divisor };
}

// 사용자가 사진에서 고른 네 모서리를 기준으로 기울기를 펴서 새 사진을 만듭니다.
export async function rectifyPhoto(photoBlob, sourceCorners, width = 600, height = 848) {
  if (!photoBlob || sourceCorners?.length !== 4 || width < 1 || height < 1) throw new RangeError('사진과 네 모서리를 확인해 주세요.');
  const bitmap = await loadPhotoImage(photoBlob);
  const destinationCorners = [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }];
  const forward = createPerspectiveTransform(sourceCorners, destinationCorners);
  const backward = invertTransform(forward);
  const sourceCanvas = document.createElement('canvas'); sourceCanvas.width = bitmap.width; sourceCanvas.height = bitmap.height;
  try {
    sourceCanvas.getContext('2d').drawImage(bitmap, 0, 0);
  } finally {
    releasePhotoImage(bitmap);
  }
  const sourcePixels = sourceCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const outputCanvas = document.createElement('canvas'); outputCanvas.width = width; outputCanvas.height = height;
  const output = outputCanvas.getContext('2d').createImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = transformPoint({ x, y }, backward);
    const sx = Math.round(source.x); const sy = Math.round(source.y);
    const outAt = (y * width + x) * 4;
    if (sx < 0 || sy < 0 || sx >= sourceCanvas.width || sy >= sourceCanvas.height) { output.data[outAt] = 255; output.data[outAt + 1] = 255; output.data[outAt + 2] = 255; output.data[outAt + 3] = 255; continue; }
    const inAt = (sy * sourceCanvas.width + sx) * 4;
    output.data[outAt] = sourcePixels.data[inAt]; output.data[outAt + 1] = sourcePixels.data[inAt + 1];
    output.data[outAt + 2] = sourcePixels.data[inAt + 2]; output.data[outAt + 3] = 255;
  }
  outputCanvas.getContext('2d').putImageData(output, 0, 0);
  return new Promise((resolve, reject) => outputCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('보정 사진을 만들지 못했어요.')), 'image/jpeg', 0.88));
}

function invertTransform(matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const A = e * i - f * h; const B = c * h - b * i; const C = b * f - c * e;
  const D = f * g - d * i; const E = a * i - c * g; const F = c * d - a * f;
  const G = d * h - e * g; const H = b * g - a * h; const I = a * e - b * d;
  const determinant = a * A + b * D + c * G;
  if (Math.abs(determinant) < 1e-10) throw new RangeError('사진 모서리가 겹쳐 보정할 수 없어요.');
  return [A, B, C, D, E, F, G, H, I].map((value) => value / determinant);
}

function solve(matrix, values) {
  const size = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-10) throw new RangeError('모서리가 너무 겹쳐 있어 사진을 보정할 수 없어요.');
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let item = column; item <= size; item++) rows[column][item] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let item = column; item <= size; item++) rows[row][item] -= factor * rows[column][item];
    }
  }
  return rows.map((row) => row[size]);
}
