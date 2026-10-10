import { calibrate, measureDistance, calculateError, summarizeMeasurements } from '../js/measurement/calibration.js';

// 브라우저에서 열면 통과/실패를 바로 볼 수 있는 작은 시험입니다.
const checks = [];
function check(name, action) {
  try { action(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); }
}
function equal(actual, expected, message) {
  if (Math.abs(actual - expected) > 0.0001) throw new Error(message || `${actual} !== ${expected}`);
}
function throws(action, Type) {
  try { action(); } catch (error) { if (error instanceof Type) return; throw error; }
  throw new Error(`${Type.name} 오류가 나지 않았어요.`);
}

check('정상: 기준 길이와 오차를 계산해요', () => {
  const scale = calibrate(200, 10);
  equal(measureDistance({ x: 0, y: 0 }, { x: 900, y: 0 }, scale), 45, '45cm가 되어야 해요.');
  equal(calculateError(45, 44).errorCm, 1);
});
check('경계: 1픽셀 기준은 계산할 수 있어요', () => equal(calibrate(1, 1), 1));
check('오류: 0과 음수 기준은 거부해요', () => {
  throws(() => calibrate(0, 10), RangeError);
  throws(() => calibrate(200, -1), RangeError);
});
check('오류: 같은 점 두 개의 길이는 측정하지 않아요', () => {
  throws(() => measureDistance({ x: 2, y: 2 }, { x: 2, y: 2 }, 0.1), RangeError);
});
check('요약: 끝난 기록만 평균에 넣어요', () => {
  const summary = summarizeMeasurements([{ status: 'done', errorCm: 1, edited: true }, { status: 'failed' }]);
  equal(summary.maeCm, 1);
  equal(summary.failureRatePct, 50);
});

const list = document.querySelector('#results');
checks.forEach(({ name, passed, error }) => {
  const item = document.createElement('li');
  item.textContent = `${passed ? '통과' : '실패'} · ${name}${error ? ` · ${error}` : ''}`;
  item.style.color = passed ? 'green' : 'red';
  list.append(item);
});
document.title = checks.every((item) => item.passed) ? '통과 · 실측 계산 확인' : '실패 · 실측 계산 확인';
