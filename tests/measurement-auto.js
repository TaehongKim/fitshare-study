import * as vision from '../js/measurement/vision.js';
import * as calibration from '../js/measurement/calibration.js';

const checks = [];
function check(name, action) {
  try { action(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); }
}
function close(actual, expected, tolerance = 8) {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`예상 ${expected}, 실제 ${actual}`);
}
function createImage(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const at = index * 4;
    data[at] = color[0]; data[at + 1] = color[1]; data[at + 2] = color[2]; data[at + 3] = 255;
  }
  return { data, width, height };
}
function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]; const b = points[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function paint(image, x, y, color) {
  const at = (y * image.width + x) * 4;
  image.data[at] = color[0]; image.data[at + 1] = color[1]; image.data[at + 2] = color[2];
}

check('정상: 비스듬한 A0 매트 네 모서리를 찾아요', () => {
  const image = createImage(360, 480, [55, 60, 65]);
  const corners = [{ x: 48, y: 32 }, { x: 290, y: 48 }, { x: 315, y: 438 }, { x: 28, y: 418 }];
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (insidePolygon(x, y, corners)) paint(image, x, y, [245, 245, 242]);
  }
  const result = vision.findMatCorners(image);
  if (!result.ok) throw new Error(result.message);
  result.corners.forEach((point, index) => { close(point.x, corners[index].x); close(point.y, corners[index].y); });
});

check('정상: 가로로 놓인 A0 매트도 세로 기준으로 돌려요', () => {
  const image = createImage(480, 360, [55, 60, 65]);
  const corners = [{ x: 32, y: 48 }, { x: 438, y: 28 }, { x: 420, y: 315 }, { x: 48, y: 330 }];
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (insidePolygon(x, y, corners)) paint(image, x, y, [245, 245, 242]);
  }
  const result = vision.findMatCorners(image);
  if (!result.ok) throw new Error(result.message);
  const portrait = vision.orderMatCornersForPortrait(result.corners);
  close(portrait[0].x, corners[1].x); close(portrait[0].y, corners[1].y);
  close(portrait[1].x, corners[2].x); close(portrait[1].y, corners[2].y);
});

check('경계: 매트와 바닥 색이 같으면 자동 보정을 멈춰요', () => {
  const image = createImage(100, 120, [230, 230, 230]);
  const result = vision.findMatCorners(image);
  if (result.ok) throw new Error('구분할 수 없는 사진을 매트로 잘못 판단했어요.');
});

check('정상: 격자선보다 큰 옷 덩어리를 찾아요', () => {
  const image = createImage(240, 320, [245, 245, 245]);
  for (let position = 20; position < 240; position += 20) {
    for (let n = 0; n < image.height; n++) paint(image, position, n, [25, 25, 25]);
  }
  for (let position = 20; position < 320; position += 20) {
    for (let n = 0; n < image.width; n++) paint(image, n, position, [25, 25, 25]);
  }
  for (let y = 70; y < 250; y++) for (let x = 80; x < 170; x++) paint(image, x, y, [220, 35, 65]);
  const result = vision.findDominantClothingBox(image);
  if (!result.ok) throw new Error(result.message);
  close(result.box.left, 80); close(result.box.right, 169); close(result.box.top, 70); close(result.box.bottom, 249);
});

check('정상: 보정된 A0 사진에서 길이와 너비를 cm로 환산해요', () => {
  const result = calibration.measureA0Garment({ left: 100, right: 200, top: 100, bottom: 528 }, 'top', 600, 848);
  close(result.lengthCm, 60, 0.1); close(result.widthCm, 14, 0.1);
});

check('오류: 범위를 벗어난 옷 상자는 측정하지 않아요', () => {
  try { calibration.measureA0Garment({ left: 10, right: 20, top: 8, bottom: 900 }, 'top', 600, 848); }
  catch (error) { if (error instanceof RangeError) return; throw error; }
  throw new Error('사진 바깥의 옷 상자를 거부하지 않았어요.');
});

check('정상: 옷만 보이게 자를 때 일정한 여백을 남겨요', () => {
  const crop = calibration.getClothingCropBounds({ left: 100, top: 80, right: 300, bottom: 280 }, 500, 400, 0.05);
  if (crop.left !== 90 || crop.top !== 70 || crop.right !== 310 || crop.bottom !== 290) {
    throw new Error('옷 주변의 자르기 영역이나 여백이 맞지 않아요.');
  }
});

check('경계: 옷이 사진 모서리에 있으면 자르기 범위를 사진 안으로 맞춰요', () => {
  const crop = calibration.getClothingCropBounds({ left: 0, top: 0, right: 20, bottom: 30 }, 100, 100, 0.1);
  if (crop.left !== 0 || crop.top !== 0 || crop.right !== 22 || crop.bottom !== 33) {
    throw new Error('사진 모서리에서 자르기 범위를 벗어났어요.');
  }
});

const list = document.querySelector('#results');
checks.forEach(({ name, passed, error }) => {
  const item = document.createElement('li'); item.textContent = `${passed ? '통과' : '실패'} · ${name}${error ? ` · ${error}` : ''}`;
  item.style.color = passed ? 'green' : 'red'; list.append(item);
});
