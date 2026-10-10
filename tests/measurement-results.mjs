import assert from 'node:assert/strict';
import test from 'node:test';
import { makeOverlayMap, summarizeRecords } from '../js/measurement/resultSummary.js';

test('배경별 너비와 기장 오차의 평균을 각각 계산한다', () => {
  const records = [
    { matId: 'M1', status: 'done', errorWidthCm: -2, errorLengthCm: 1 },
    { matId: 'M1', status: 'done', errorWidthCm: 4, errorLengthCm: -3 },
    { matId: 'M2', status: 'done', errorWidthCm: 1, errorLengthCm: 2 },
  ];

  const result = summarizeRecords(records, 'matId', ['M1', 'M2', 'M3', 'M4']);

  assert.deepEqual(result[0], { key: 'M1', count: 2, widthMaeCm: 3, lengthMaeCm: 2, overallMaeCm: 2.5 });
  assert.deepEqual(result[1], { key: 'M2', count: 1, widthMaeCm: 1, lengthMaeCm: 2, overallMaeCm: 1.5 });
});

test('결과가 없는 배경은 오차를 0으로 꾸미지 않고 비어 있음을 표시한다', () => {
  const result = summarizeRecords([], 'matId', ['M1']);

  assert.deepEqual(result, [{ key: 'M1', count: 0, widthMaeCm: null, lengthMaeCm: null, overallMaeCm: null }]);
});

test('완료되지 않은 기록은 평균 오차에서 제외한다', () => {
  const records = [
    { matId: 'M1', status: 'done', errorWidthCm: 2, errorLengthCm: -4 },
    { matId: 'M1', status: 'pending', errorWidthCm: 200, errorLengthCm: 200 },
  ];

  const result = summarizeRecords(records, 'matId', ['M1']);

  assert.deepEqual(result[0], { key: 'M1', count: 1, widthMaeCm: 2, lengthMaeCm: 4, overallMaeCm: 3 });
});

test('완료된 사진의 윤곽 분석 그림만 파일 이름으로 연결한다', () => {
  const overlays = makeOverlayMap({ rows: [
    { imageName: 'p_1_w55_h65.jpg', status: 'done', overlayDataUrl: 'data:image/jpeg;base64,outline' },
    { imageName: 'p_2_w54_h50.jpg', status: 'failed', overlayDataUrl: 'data:image/jpeg;base64,wrong' },
    { imageName: 'p_3_w40_h70.jpg', status: 'done', overlayDataUrl: '' },
  ] });

  assert.equal(overlays.get('p_1_w55_h65.jpg'), 'data:image/jpeg;base64,outline');
  assert.equal(overlays.has('p_2_w54_h50.jpg'), false);
  assert.equal(overlays.has('p_3_w40_h70.jpg'), false);
});
