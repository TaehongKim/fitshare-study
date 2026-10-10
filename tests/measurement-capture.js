import * as shotDraft from '../js/measurement/shotDraft.js';
import * as geometry from '../js/measurement/homography.js';

const results = [];
function check(name, action) {
  try { action(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}

check('정상: 새로 촬영한 사진은 저장 전까지 화면 초안으로 유지해요', () => {
  const captured = { id: 'M1-garment-1', photo: { type: 'image/jpeg' } };
  const result = shotDraft.resolveShotDraft(captured, [], 'M1', 'garment-1', true);
  if (result !== captured) throw new Error('새 사진 초안이 화면에서 사라졌어요.');
});

check('정상: 이전 옷으로 돌아가면 그 옷의 저장된 사진을 불러와요', () => {
  const saved = { id: 'M1-garment-1', matId: 'M1', garmentId: 'garment-1', photoUrl: '/photo.jpg' };
  const result = shotDraft.resolveShotDraft(null, [saved], 'M1', 'garment-1');
  if (!result || result.id !== saved.id || result.photoUrl !== saved.photoUrl) throw new Error('저장된 사진을 다시 불러오지 못했어요.');
});

check('경계: 새 옷에 저장된 사진이 없으면 빈 초안으로 시작해요', () => {
  const result = shotDraft.resolveShotDraft(null, [], 'M1', 'garment-2');
  if (result !== null) throw new Error('다른 옷의 사진이 섞였어요.');
});

check('오류: 기록 목록이 잘못되면 앱 대신 빈 초안으로 처리해요', () => {
  const result = shotDraft.resolveShotDraft(null, null, 'M1', 'garment-1');
  if (result !== null) throw new Error('잘못된 기록 목록을 안전하게 처리하지 못했어요.');
});

check('정상: 자동 보정과 측정이 끝나면 수동 절차를 접어 둬요', () => {
  if (shotDraft.shouldOpenManualCorrection({ corrected: true, autoMeasurement: { ok: true } })) {
    throw new Error('자동 처리가 끝났는데 수동 절차가 펼쳐져 있어요.');
  }
});

check('경계: 자동 처리가 덜 되면 수동 도움말을 열어 둬요', () => {
  if (!shotDraft.shouldOpenManualCorrection({ corrected: true, autoMeasurement: { ok: false } })) {
    throw new Error('자동 측정이 실패했는데 수동 도움말이 접혀 있어요.');
  }
});

check('정상: 네 모서리 점을 모두 지우고 처음부터 다시 찍을 수 있어요', () => {
  let points = [];
  for (let number = 0; number < 4; number++) points = shotDraft.addPerspectiveCorner(points, { x: number, y: number });
  points = shotDraft.addPerspectiveCorner(points, { x: 99, y: 99 });
  if (points.length !== 4) throw new Error('네 점을 넘어서 저장했어요.');
  points = shotDraft.clearPerspectiveCorners();
  if (points.length !== 0) throw new Error('기존 네 점을 지우지 못했어요.');
  points = shotDraft.addPerspectiveCorner(points, { x: 10, y: 10 });
  if (points.length !== 1 || points[0].x !== 10) throw new Error('점 지우기 뒤 다시 찍지 못했어요.');
});

check('정상: 잘못 찍은 모서리 점 하나만 골라 지울 수 있어요', () => {
  const points = [{ x: 10, y: 10 }, { x: 90, y: 12 }, { x: 88, y: 95 }, { x: 8, y: 92 }];
  const remaining = shotDraft.removePerspectiveCorner(points, 1);
  if (remaining.length !== 3 || remaining[1].x !== 88 || points.length !== 4) {
    throw new Error('선택한 점 하나만 지우고 나머지 점을 보존하지 못했어요.');
  }
});

check('경계: 없는 번호를 지우려고 해도 점 목록이 바뀌지 않아요', () => {
  const points = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
  const remaining = shotDraft.removePerspectiveCorner(points, 5);
  if (remaining.length !== 2 || remaining[0] !== points[0]) throw new Error('An invalid index changed the corner list.');
});

check('정상: 자동 측정에서 받은 오류 이유를 보존해요', () => {
  const message = shotDraft.getAutomaticFailureMessage(new Error('매트 네 모서리를 찾지 못했어요.'));
  if (!message.includes('매트 네 모서리를 찾지 못했어요.')) throw new Error('자동 측정의 구체적인 실패 이유가 사라졌어요.');
});

check('경계: 오류 설명이 비어 있으면 이해하기 쉬운 안내를 보여줘요', () => {
  const message = shotDraft.getAutomaticFailureMessage(new Error('  '));
  if (!message.includes('배경 네 모서리')) throw new Error('오류 설명이 비어 있을 때 안내가 없어요.');
});

check('정상: 배경 촬영 순서를 바꾸고 각 배경은 그대로 한 번씩 남겨요', () => {
  const order = ['M1', 'M2', 'M3', 'M4'];
  const moved = shotDraft.moveBackgroundOrder(order, 0, 2);
  if (moved.join(',') !== 'M2,M3,M1,M4' || new Set(moved).size !== 4) {
    throw new Error('배경 촬영 순서가 바르게 바뀌지 않았어요.');
  }
});

check('경계: 범위를 벗어난 배경 순서 이동은 기존 순서를 유지해요', () => {
  const order = ['M1', 'M2', 'M3', 'M4'];
  const moved = shotDraft.moveBackgroundOrder(order, 0, 9);
  if (moved.join(',') !== order.join(',')) throw new Error('잘못된 이동이 배경 순서를 망가뜨렸어요.');
});

check('오류: 저장된 순서가 망가지면 기본 네 배경 순서로 안전하게 돌아가요', () => {
  const result = shotDraft.normalizeBackgroundOrder(['M1', 'M1', 'M3', 'M4'], ['M1', 'M2', 'M3', 'M4']);
  if (result.join(',') !== 'M1,M2,M3,M4') throw new Error('잘못된 저장 순서를 기본값으로 바꾸지 못했어요.');
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
results.forEach(({ name, passed, error }) => {
  const item = document.createElement('li'); item.textContent = `${passed ? '통과' : '실패'} · ${name}${error ? ` · ${error}` : ''}`;
  item.style.color = passed ? 'green' : 'red'; list.append(item);
});
