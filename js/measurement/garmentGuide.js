// 옷 종류마다 쉬운 측정 이름과 그림을 골라 줍니다.
const clothes = {
  top: {
    name: '상의·외투',
    shape: '<path d="M126 54 91 72 55 118 92 143 114 119 116 222 244 222 246 119 268 143 305 118 269 72 234 54 Q180 76 126 54Z"/><path class="neck" d="M151 58 Q180 89 209 58"/>',
    length: '상의 길이', width: '가슴 너비', lineY: 128,
    instruction: '상의는 앞면을 위로 해 평평하게 펴요. 길이는 목과 어깨가 만나는 가장 높은 곳부터 밑단까지 재요. 가슴 너비는 겨드랑이 봉제선에서 손가락 두 마디 정도(약 2.5cm) 아래를 왼쪽 끝부터 오른쪽 끝까지 재요.'
  },
  bottom: {
    name: '하의',
    shape: '<path d="M113 51 H247 L232 111 224 220 H183 L175 132 166 220 H125 L116 111Z"/>',
    length: '하의 길이', width: '허리 너비', lineY: 68,
    instruction: '하의는 앞면을 위로 해서 쭉 펴요. 길이는 허리 맨 위에서 밑단까지, 너비는 허리 부분의 왼쪽 끝부터 오른쪽 끝까지 재요. 바지와 치마는 길이 선을 옷의 옆선 방향으로 놓아요.'
  },
  dress: {
    name: '원피스',
    shape: '<path d="M133 52 99 70 64 113 97 139 118 115 124 153 78 222 H282 L236 153 242 115 263 139 296 113 261 70 227 52 Q180 75 133 52Z"/><path class="neck" d="M154 57 Q180 86 206 57"/>',
    length: '원피스 길이', width: '가슴 너비', lineY: 125,
    instruction: '원피스는 앞면을 위로 해서 평평하게 펴요. 길이는 어깨와 목이 만나는 높은 곳부터 치마 밑단까지 재요. 가슴 너비는 겨드랑이 봉제선 바로 아래를 왼쪽 끝부터 오른쪽 끝까지 재요.'
  },
  pants: {
    name: '바지',
    shape: '<path d="M113 51 H247 L232 111 224 220 H183 L175 132 166 220 H125 L116 111Z"/>',
    length: '바지 옆길이', width: '허리 너비', lineY: 68,
    instruction: '바지는 앞면을 위로 해서 주름 없이 펴요. 길이는 허리띠 맨 위부터 바짓단까지 옆선을 따라 재요. 너비는 허리띠를 살짝 펴서 왼쪽 끝부터 오른쪽 끝까지 재요. 허리둘레처럼 한 바퀴 재는 게 아니에요.'
  },
  skirt: {
    name: '치마',
    shape: '<path d="M132 52 H228 L287 222 H73Z"/>',
    length: '치마 길이', width: '허리 너비', lineY: 68,
    instruction: '치마는 허리 부분이 위로 오게 평평하게 펴요. 길이는 허리 맨 위부터 밑단까지 재요. 너비는 허리 부분을 왼쪽 끝부터 오른쪽 끝까지 재요. 밑단 너비와 헷갈리지 않도록 해요.'
  },
  other: {
    name: '기타 옷',
    shape: '<path d="M126 54 91 72 55 118 92 143 114 119 116 222 244 222 246 119 268 143 305 118 269 72 234 54 Q180 76 126 54Z"/>',
    length: '가장 긴 길이', width: '가장 넓은 너비', lineY: 128,
    instruction: '옷을 평평하게 펴요. 길이는 가장 긴 방향의 양끝, 너비는 그와 직각인 가장 넓은 곳의 양끝을 재요. 네 번의 사진에서 꼭 같은 자리를 재야 해요.'
  }
};

export function getCategoryName(category) { return clothes[category]?.name || clothes.other.name; }

export function getMeasurementNames(category) {
  const garment = clothes[category] || clothes.other;
  return { length: garment.length, width: garment.width };
}

export function getGarmentInstruction(category) {
  return (clothes[category] || clothes.other).instruction;
}

export function renderGarmentDiagram(category, idSuffix = '') {
  const garment = clothes[category] || clothes.other;
  const markerSuffix = idSuffix ? `-${idSuffix}` : '';
  const lengthMarkerId = `length-arrow${markerSuffix}`;
  const widthMarkerId = `width-arrow${markerSuffix}`;
  const isTop = category === 'top' || category === 'dress' || category === 'other';
  const verticalX = isTop ? 82 : 92;
  const verticalStart = isTop ? 62 : 52;
  const verticalEnd = 220;
  const horizontalStart = isTop ? 111 : 112;
  const horizontalEnd = isTop ? 249 : 248;
  return `<figure class="garment-example">
    <svg viewBox="0 0 360 260" role="img" aria-label="${garment.name}의 길이와 너비를 재는 위치">
      <defs>
        <marker id="${lengthMarkerId}" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0 0 8 4 0 8Z" fill="#e95778"/></marker>
        <marker id="${widthMarkerId}" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0 0 8 4 0 8Z" fill="#3887d9"/></marker>
      </defs>
      <g class="garment-shape">${garment.shape}</g>
      <path class="length-guide" d="M${verticalX} ${verticalStart} V${verticalEnd}" marker-start="url(#${lengthMarkerId})" marker-end="url(#${lengthMarkerId})"/>
      <path class="width-guide" d="M${horizontalStart} ${garment.lineY} H${horizontalEnd}" marker-start="url(#${widthMarkerId})" marker-end="url(#${widthMarkerId})"/>
      <text class="length-label" x="18" y="145">① 길이</text>
      <text class="width-label" x="128" y="${garment.lineY - 9}">② 너비</text>
    </svg>
    <figcaption><span class="length-key">① ${garment.length}</span><span class="width-key">② ${garment.width}</span></figcaption>
  </figure>`;
}

// 옷 입력 카드 안에 선택한 종류의 실측 그림과 설명을 보여 줍니다.
export function renderGarmentInputGuide(category, index) {
  const normalizedCategory = clothes[category] ? category : 'other';
  const garment = clothes[normalizedCategory];
  return `<h3>${garment.name} 실측 방법</h3>
    ${renderGarmentDiagram(normalizedCategory, `form-${index}`)}
    <p class="measurement-guide">${escapeHtml(garment.instruction)}</p>`;
}

// 선택한 옷마다 이름, 측정 그림, 쉬운 설명을 한 묶음으로 보여 줍니다.
export function renderSelectedGarmentGuides(garments) {
  const selectedGarments = Array.isArray(garments) ? garments : [];
  const guideCards = selectedGarments.map((garment, index) => {
    const name = String(garment?.name || `옷 ${index + 1}`);
    const category = clothes[garment?.category] ? garment.category : 'other';
    return `<article class="selected-guide-item">
      <h3>옷 ${index + 1} · ${escapeHtml(name)}</h3>
      <p class="selected-guide-category">종류: ${clothes[category].name}</p>
      ${renderGarmentDiagram(category, `guide-${index + 1}`)}
      <p class="measurement-guide">${getGarmentInstruction(category)}</p>
    </article>`;
  }).join('');

  return `<section class="selected-garment-guides" aria-live="polite">
    <h2>선택한 옷의 실측 위치</h2>
    <p class="selected-guide-help">옷마다 어디를 재는지 그림과 설명을 확인해요.</p>
    ${guideCards ? `<div class="selected-guide-list">${guideCards}</div>` : '<p class="kid-help">옷 종류를 고르면 측정 위치 그림이 여기에 보여요.</p>'}
  </section>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
