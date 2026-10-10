import { findClothingBox, inspectMat } from '../js/measurement/vision.js';
import { createPerspectiveTransform, transformPoint, rectifyPhoto } from '../js/measurement/homography.js';
import * as geometry from '../js/measurement/homography.js';

const checks = [];
function check(name, action) { try { action(); checks.push({ name, passed: true }); } catch (error) { checks.push({ name, passed: false, error: error.message }); } }
function close(actual, expected) { if (Math.abs(actual - expected) > 1) throw new Error(`예상 ${expected}, 실제 ${actual}`); }
function fakeImage() {
  const width = 100; const height = 100; const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4; const isCloth = x >= 30 && x <= 69 && y >= 20 && y <= 79;
    data[at] = isCloth ? 220 : 255; data[at + 1] = isCloth ? 30 : 255; data[at + 2] = isCloth ? 70 : 255; data[at + 3] = 255;
  }
  return { data, width, height };
}
function patternImage(draw) {
  const width = 100; const height = 100; const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) { const at = index * 4; data[at] = 255; data[at + 1] = 255; data[at + 2] = 255; data[at + 3] = 255; }
  draw((x, y) => { const at = (y * width + x) * 4; data[at] = 0; data[at + 1] = 0; data[at + 2] = 0; });
  return { data, width, height };
}
check('정상: 단색 옷의 대략적인 테두리를 찾아요', () => {
  const result = findClothingBox(fakeImage());
  if (!result.ok) throw new Error('옷 테두리가 없다고 나왔어요.');
  close(result.box.left, 30); close(result.box.right, 68); close(result.box.top, 20); close(result.box.bottom, 78);
});
check('경계: 네 모서리가 같은 사진은 표식 대비가 부족해요', () => {
  const result = inspectMat(fakeImage(), 'M1');
  if (result.ok) throw new Error('표식 대비가 낮은 사진을 통과시켰어요.');
});
check('정상: 반복된 점은 M1 무늬로 찾아요', () => {
  const image = patternImage((dark) => { for (let y = 10; y < 90; y += 15) for (let x = 10; x < 90; x += 15) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) dark(x + dx, y + dy); });
  if (!inspectMat(image, 'M1').ok) throw new Error('점 무늬를 찾지 못했어요.');
});
check('정상: 반복된 선은 M2 격자로 찾아요', () => {
  const image = patternImage((dark) => { for (let position = 10; position < 90; position += 20) for (let n = 5; n < 95; n++) { dark(position, n); dark(n, position); } });
  if (!inspectMat(image, 'M2').ok) throw new Error('격자 무늬를 찾지 못했어요.');
});
check('정상: 반복된 사각 표식 후보를 찾아요', () => {
  const image = patternImage((dark) => { for (let y = 8; y < 90; y += 30) for (let x = 8; x < 90; x += 30) for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) dark(x + dx, y + dy); });
  if (!inspectMat(image, 'M3').ok) throw new Error('사각 표식 후보를 찾지 못했어요.');
});
check('오류: 겹친 기준점으로 원근 변환을 만들 수 없어요', () => {
  try { createPerspectiveTransform([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]); }
  catch (error) { if (error instanceof RangeError) return; throw error; }
  throw new Error('잘못된 모서리를 거부하지 않았어요.');
});
check('오류: 순서가 꼬여 교차한 모서리는 거부해요', () => {
  const source = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  const target = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  try { createPerspectiveTransform(source, target); }
  catch (error) { if (error instanceof RangeError) return; throw error; }
  throw new Error('교차한 모서리 순서를 거부하지 않았어요.');
});
check('정상: 네 모서리의 사진 왜곡을 펴는 좌표를 계산해요', () => {
  const source = [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 100, y: 120 }, { x: 20, y: 120 }];
  const target = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const matrix = createPerspectiveTransform(source, target);
  const point = transformPoint({ x: 10, y: 20 }, matrix);
  close(point.x, 0); close(point.y, 0);
});

check('정상: 화면에 맞춰 여백이 생긴 세로 사진의 클릭점을 이미지 좌표로 바꿔요', () => {
  const point = geometry.mapPointerToImagePoint(100, 100, { left: 0, top: 0, width: 200, height: 200 }, 400, 800);
  if (!point || point.x !== 200 || point.y !== 400) throw new Error('세로 사진 중앙의 클릭 좌표가 어긋났어요.');
});

check('경계: 사진이 그려지지 않은 여백 클릭은 점으로 받지 않아요', () => {
  const point = geometry.mapPointerToImagePoint(20, 100, { left: 0, top: 0, width: 200, height: 200 }, 400, 800);
  if (point !== null) throw new Error('사진 밖 여백이 모서리 점으로 등록됐어요.');
});

const list = document.querySelector('#results');
function showResults() {
  list.innerHTML = '';
  checks.forEach(({ name, passed, error }) => { const item = document.createElement('li'); item.textContent = `${passed ? '통과' : '실패'} · ${name}${error ? ` · ${error}` : ''}`; item.style.color = passed ? 'green' : 'red'; list.append(item); });
  document.title = checks.every((item) => item.passed) ? '통과 · 사진 분석 확인' : '실패 · 사진 분석 확인';
}
showResults();
const smallCanvas = document.createElement('canvas'); smallCanvas.width = 20; smallCanvas.height = 20;
const smallContext = smallCanvas.getContext('2d'); smallContext.fillStyle = '#ff0000'; smallContext.fillRect(0, 0, 20, 20);
smallCanvas.toBlob(async (blob) => {
  try {
    const rectified = await rectifyPhoto(blob, [{ x: 0, y: 0 }, { x: 19, y: 0 }, { x: 19, y: 19 }, { x: 0, y: 19 }], 12, 12);
    const bitmap = await createImageBitmap(rectified);
    checks.push({ name: '정상: 선택한 네 모서리로 기울어진 사진을 펴요', passed: bitmap.width === 12 && bitmap.height === 12, error: bitmap.width === 12 && bitmap.height === 12 ? '' : '보정 사진 크기가 맞지 않아요.' });
    bitmap.close();
  } catch (error) { checks.push({ name: '정상: 선택한 네 모서리로 기울어진 사진을 펴요', passed: false, error: error.message }); }
  showResults();
});
