import * as guide from '../js/measurement/garmentGuide.js';

const { renderGarmentDiagram, getGarmentInstruction, getMeasurementNames } = guide;

const results = [];
function check(name, action) {
  try { action(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}

check('정상: 상의와 원피스에 그림과 측정선이 있어요', () => {
  for (const category of ['top', 'dress']) {
    const diagram = renderGarmentDiagram(category);
    if (!diagram.includes('<svg') || !diagram.includes('길이') || !diagram.includes('너비')) throw new Error(`${category} 안내 그림이 빠졌어요.`);
  }
});
check('정상: 하의·바지·치마에 맞는 이름과 안내가 있어요', () => {
  for (const category of ['bottom', 'pants', 'skirt']) {
    if (!renderGarmentDiagram(category).includes('<svg')) throw new Error(`${category} 그림이 빠졌어요.`);
    if (!getGarmentInstruction(category).includes('펴')) throw new Error(`${category} 안내가 쉬운 말로 없어요.`);
    if (!getMeasurementNames(category).length || !getMeasurementNames(category).width) throw new Error(`${category} 측정 이름이 빠졌어요.`);
  }
});
check('경계: 모르는 종류는 기타 옷 안내를 보여 줘요', () => {
  if (!renderGarmentDiagram('unknown').includes('<svg')) throw new Error('기타 옷 그림이 없어요.');
  if (!getGarmentInstruction('unknown').includes('가장 긴')) throw new Error('기타 옷 안내가 없어요.');
});

check('정상: 서로 다른 옷 두 종류의 안내를 각각 보여 줘요', () => {
  const html = guide.renderSelectedGarmentGuides([
    { name: '후드티', category: 'top' },
    { name: '청바지', category: 'pants' }
  ]);
  if ((html.match(/class="selected-guide-item"/g) || []).length !== 2) throw new Error('안내 그림이 두 개가 아니에요.');
  if (!html.includes('후드티') || !html.includes('청바지')) throw new Error('옷 이름이 각각 표시되지 않아요.');
  const markerIds = Array.from(html.matchAll(/<marker id="([^"]+)"/g), (match) => match[1]);
  if (new Set(markerIds).size !== markerIds.length) throw new Error('그림마다 측정선 화살표 이름이 겹쳐요.');
});

check('정상: 같은 종류를 골라도 옷마다 안내를 반복해요', () => {
  const html = guide.renderSelectedGarmentGuides([
    { name: '긴팔 티셔츠', category: 'top' },
    { name: '점퍼', category: 'top' }
  ]);
  if ((html.match(/class="selected-guide-item"/g) || []).length !== 2) throw new Error('같은 종류의 안내가 각각 나오지 않아요.');
  if (!html.includes('긴팔 티셔츠') || !html.includes('점퍼')) throw new Error('두 옷의 이름이 모두 나오지 않아요.');
});

check('경계: 옷 이름이 비어 있으면 번호로 안내하고, 이름은 HTML로 실행되지 않아요', () => {
  const html = guide.renderSelectedGarmentGuides([
    { name: '', category: 'top' },
    { name: '<img src=x>', category: 'skirt' }
  ]);
  if (!html.includes('옷 1')) throw new Error('빈 이름의 안내 제목이 없어요.');
  if (html.includes('<img src=x>') || !html.includes('&lt;img src=x&gt;')) throw new Error('옷 이름을 안전하게 표시하지 않아요.');
});

const list = document.querySelector('#results');
results.forEach(({ name, passed, error }) => {
  const item = document.createElement('li'); item.textContent = `${passed ? '통과' : '실패'} · ${name}${error ? ` · ${error}` : ''}`;
  item.style.color = passed ? 'green' : 'red'; list.append(item);
});
