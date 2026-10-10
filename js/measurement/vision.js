// 사진의 가장자리 색과 다른 부분을 찾아 옷의 대략적인 테두리를 제안합니다.
export function findClothingBox(imageData) {
  const { data, width, height } = imageData;
  const corners = [sample(data, width, 0, 0), sample(data, width, width - 1, 0), sample(data, width, 0, height - 1), sample(data, width, width - 1, height - 1)];
  const background = corners.reduce((sum, color) => sum.map((value, index) => value + color[index] / corners.length), [0, 0, 0]);
  let left = width; let top = height; let right = -1; let bottom = -1; let count = 0;
  // Canvas를 줄인 사진에서 배경과 색이 다른 픽셀의 경계 상자를 찾습니다.
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const at = (y * width + x) * 4;
      const distance = Math.abs(data[at] - background[0]) + Math.abs(data[at + 1] - background[1]) + Math.abs(data[at + 2] - background[2]);
      if (distance < 95) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); count++;
    }
  }
  if (count < 20 || right <= left || bottom <= top) return { ok: false, message: '옷 테두리를 찾기 어려워요. 배경과 색이 다른 곳에 옷을 놓거나 직접 선을 정해 주세요.' };
  return { ok: true, box: { left, top, right, bottom }, confidence: Math.min(0.85, count / (width * height * 0.12)) };
}

// 배경 표식의 간격과 모양을 살펴보고, 고른 배경과 비슷한지 알려 줍니다.
export function inspectMat(imageData, matId) {
  const gray = shrinkToGray(imageData, 200);
  const dark = gray.values.map((value) => value < 85 ? 1 : 0);
  const rows = new Array(gray.height).fill(0);
  const columns = new Array(gray.width).fill(0);
  dark.forEach((value, index) => {
    if (!value) return;
    rows[Math.floor(index / gray.width)]++;
    columns[index % gray.width]++;
  });
  const rowLines = countPeaks(rows, gray.width * 0.16);
  const columnLines = countPeaks(columns, gray.height * 0.16);
  const shape = countDarkShapes(dark, gray.width, gray.height);
  const matches = matId === 'M1' ? shape.small >= 8
    : matId === 'M2' ? rowLines >= 4 && columnLines >= 4
      : shape.squares >= (matId === 'M4' ? 8 : 3);
  const score = matId === 'M1' ? Math.min(1, shape.small / 20)
    : matId === 'M2' ? Math.min(1, Math.min(rowLines, columnLines) / 9)
      : Math.min(1, shape.squares / (matId === 'M4' ? 20 : 12));
  return {
    ok: matches,
    matId,
    detected: matches ? matId : null,
    confidence: score,
    message: matches ? `${matId} 배경과 비슷한 표식 무늬를 찾았어요. 그래도 사진을 한 번 확인해 주세요.` : `${matId} 표식을 충분히 찾지 못했어요. 매트를 더 밝게, 네 모서리가 다 보이게 다시 찍어 주세요.`
  };
}

// 사진 가장자리 색과 다른 큰 판을 찾아 A0 매트의 네 모서리를 추정합니다.
export function findMatCorners(imageData) {
  if (!imageData?.data || !Number.isInteger(imageData.width) || !Number.isInteger(imageData.height)) {
    return { ok: false, message: '사진을 읽지 못했어요. 다시 골라 주세요.' };
  }
  const small = shrinkToPixels(imageData, 320);
  const background = edgeColor(small);
  const backgroundLight = luminance(background);
  const mask = new Uint8Array(small.width * small.height);
  let foregroundCount = 0;
  for (let index = 0; index < mask.length; index++) {
    const at = index * 4;
    const red = small.data[at]; const green = small.data[at + 1]; const blue = small.data[at + 2];
    const difference = Math.abs(red - background[0]) + Math.abs(green - background[1]) + Math.abs(blue - background[2]);
    if (difference >= 70 || (luminance([red, green, blue]) > 220 && backgroundLight < 195)) {
      mask[index] = 1; foregroundCount++;
    }
  }
  const area = mask.length;
  if (foregroundCount < area * 0.08 || foregroundCount > area * 0.96) {
    return { ok: false, message: '매트와 바닥을 구분하기 어려워요. 네 모서리와 바닥이 함께 보이게 다시 찍어 주세요.' };
  }

  const boundary = [];
  for (let y = 1; y < small.height - 1; y++) for (let x = 1; x < small.width - 1; x++) {
    const index = y * small.width + x;
    if (!mask[index]) continue;
    if (!mask[index - 1] || !mask[index + 1] || !mask[index - small.width] || !mask[index + small.width]) boundary.push({ x, y });
  }
  if (boundary.length < 20) return { ok: false, message: '매트 모서리를 찾지 못했어요. 매트 테두리가 모두 나오게 다시 찍어 주세요.' };

  const sums = boundary.map((point) => point.x + point.y);
  const differences = boundary.map((point) => point.x - point.y);
  const smallCorners = [
    boundary[indexOfMinimum(sums)], boundary[indexOfMaximum(differences)],
    boundary[indexOfMaximum(sums)], boundary[indexOfMinimum(differences)]
  ];
  if (new Set(smallCorners.map((point) => `${point.x},${point.y}`)).size !== 4) {
    return { ok: false, message: '사진이 너무 비스듬하거나 매트 모서리가 가려졌어요. 다시 찍어 주세요.' };
  }
  if (smallCorners.some((point) => point.x < 2 || point.y < 2 || point.x >= small.width - 2 || point.y >= small.height - 2)) {
    return { ok: false, message: '매트가 사진 밖으로 잘렸어요. 네 모서리를 모두 담아 다시 찍어 주세요.' };
  }
  const [topLeft, topRight, bottomRight, bottomLeft] = smallCorners;
  const turns = smallCorners.map((point, index) => {
    const next = smallCorners[(index + 1) % 4]; const after = smallCorners[(index + 2) % 4];
    return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
  });
  if (!(turns.every((value) => value > 0) || turns.every((value) => value < 0))) {
    return { ok: false, message: '매트 모서리를 구별하지 못했어요. 매트를 평평하게 놓고 다시 찍어 주세요.' };
  }
  const topWidth = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const bottomWidth = Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y);
  const leftHeight = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  const rightHeight = Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y);
  const ratio = ((topWidth + bottomWidth) / 2) / ((leftHeight + rightHeight) / 2);
  if (ratio < 0.42 || ratio > 2.2) return { ok: false, message: 'A0 매트 모양을 확인하기 어려워요. 매트 전체가 사진 안에 들어오게 찍어 주세요.' };

  const xScale = imageData.width / small.width; const yScale = imageData.height / small.height;
  return {
    ok: true,
    corners: smallCorners.map((point) => ({ x: point.x * xScale, y: point.y * yScale })),
    confidence: Math.min(0.95, foregroundCount / (area * 0.65))
  };
}

// 가로로 놓인 매트는 긴 변이 세로로 오도록 모서리 순서를 돌립니다.
export function orderMatCornersForPortrait(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) throw new TypeError('매트 모서리 네 점이 필요해요.');
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const topWidth = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const leftHeight = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  return topWidth > leftHeight ? [topRight, bottomRight, bottomLeft, topLeft] : corners;
}

// 보정된 사진에서 큰 색 덩어리를 옷으로 보고, 얇은 격자선을 먼저消します.
export function findDominantClothingBox(imageData) {
  if (!imageData?.data || !Number.isInteger(imageData.width) || !Number.isInteger(imageData.height)) {
    return { ok: false, message: '보정 사진을 읽지 못했어요.' };
  }
  const small = shrinkToPixels(imageData, 320);
  const background = brightNeutralColor(small);
  if (!background) return { ok: false, message: '사진 배경을 확인하기 어려워요. 옷을 매트 가운데 놓아 주세요.' };
  const width = small.width; const height = small.height; const size = width * height;
  const mask = new Uint8Array(size);
  for (let index = 0; index < size; index++) {
    const at = index * 4;
    const distance = Math.abs(small.data[at] - background[0]) + Math.abs(small.data[at + 1] - background[1]) + Math.abs(small.data[at + 2] - background[2]);
    if (distance > 105) mask[index] = 1;
  }

  // 3x3 열기 처리는 한두 픽셀 굵기의 점과 격자선을 줄여 줍니다.
  const eroded = new Uint8Array(size);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const index = y * width + x;
    if (mask[index] && mask[index - 1] && mask[index + 1] && mask[index - width] && mask[index + width]
        && mask[index - width - 1] && mask[index - width + 1] && mask[index + width - 1] && mask[index + width + 1]) eroded[index] = 1;
  }
  const opened = new Uint8Array(size);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const index = y * width + x;
    if (!eroded[index]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) opened[index + dy * width + dx] = 1;
  }

  const visited = new Uint8Array(size); const queue = [];
  let best = null; let bestArea = 0;
  const minimumArea = Math.max(30, size * 0.004);
  for (let start = 0; start < size; start++) {
    if (!opened[start] || visited[start]) continue;
    queue.length = 0; queue.push(start); visited[start] = 1;
    let left = width; let top = height; let right = 0; let bottom = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]; const x = index % width; const y = Math.floor(index / width);
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (next >= 0 && opened[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
      }
    }
    const touchesEdge = left < width * 0.025 || top < height * 0.025 || right > width * 0.975 || bottom > height * 0.975;
    if (queue.length > bestArea && queue.length >= minimumArea && !touchesEdge) {
      bestArea = queue.length; best = { left, top, right, bottom };
    }
  }
  if (!best || (best.right - best.left) * (best.bottom - best.top) > size * 0.75) {
    return { ok: false, message: '옷 테두리를 자동으로 찾지 못했어요. 옷과 매트 색이 다르게 보이게 놓고, 직접 길이를 입력해 주세요.' };
  }
  const xScale = imageData.width / width; const yScale = imageData.height / height;
  return {
    ok: true,
    box: { left: best.left * xScale, top: best.top * yScale, right: best.right * xScale, bottom: best.bottom * yScale },
    confidence: Math.min(0.95, bestArea / (size * 0.08))
  };
}

function shrinkToGray(imageData, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(imageData.width, imageData.height));
  const width = Math.max(1, Math.round(imageData.width * scale));
  const height = Math.max(1, Math.round(imageData.height * scale));
  const pixels = imageData.data;
  const values = new Uint8Array(width * height);
  for (let index = 0; index < values.length; index++) {
    const x = index % width; const y = Math.floor(index / width);
    const sourceX = Math.min(imageData.width - 1, Math.floor(x / scale));
    const sourceY = Math.min(imageData.height - 1, Math.floor(y / scale));
    const at = (sourceY * imageData.width + sourceX) * 4;
    values[index] = (pixels[at] * 3 + pixels[at + 1] * 6 + pixels[at + 2]) / 10;
  }
  return { values, width, height };
}

function countPeaks(counts, minimum) {
  let peaks = 0; let insidePeak = false;
  for (const count of counts) {
    const isPeak = count >= minimum;
    if (isPeak && !insidePeak) peaks++;
    insidePeak = isPeak;
  }
  return peaks;
}

function countDarkShapes(dark, width, height) {
  const visited = new Uint8Array(dark.length);
  let small = 0; let squares = 0;
  for (let start = 0; start < dark.length; start++) {
    if (!dark[start] || visited[start]) continue;
    const queue = [start]; visited[start] = 1;
    let area = 0; let left = width; let right = 0; let top = height; let bottom = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]; const x = index % width; const y = Math.floor(index / width);
      area++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (next >= 0 && dark[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
      }
    }
    const boxWidth = right - left + 1; const boxHeight = bottom - top + 1;
    if (area >= 2 && area <= 35) small++;
    if (area >= 12 && boxWidth >= 4 && boxHeight >= 4 && boxWidth / boxHeight > 0.65 && boxWidth / boxHeight < 1.45) squares++;
  }
  return { small, squares };
}

function sample(data, width, x, y) {
  const at = (y * width + x) * 4;
  return [data[at], data[at + 1], data[at + 2]];
}

function shrinkToPixels(imageData, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(imageData.width, imageData.height));
  const width = Math.max(1, Math.round(imageData.width * scale)); const height = Math.max(1, Math.round(imageData.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sourceX = Math.min(imageData.width - 1, Math.floor(x / scale)); const sourceY = Math.min(imageData.height - 1, Math.floor(y / scale));
    const source = (sourceY * imageData.width + sourceX) * 4; const target = (y * width + x) * 4;
    data[target] = imageData.data[source]; data[target + 1] = imageData.data[source + 1]; data[target + 2] = imageData.data[source + 2]; data[target + 3] = 255;
  }
  return { data, width, height };
}

function edgeColor(image) {
  const colors = [[], [], []]; const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / 80));
  for (let x = 0; x < image.width; x += step) for (const y of [0, image.height - 1]) {
    const at = (y * image.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) colors[channel].push(image.data[at + channel]);
  }
  for (let y = 0; y < image.height; y += step) for (const x of [0, image.width - 1]) {
    const at = (y * image.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) colors[channel].push(image.data[at + channel]);
  }
  return colors.map((values) => { values.sort((a, b) => a - b); return values[Math.floor(values.length / 2)]; });
}

function brightNeutralColor(image) {
  const samples = [[], [], []]; const xMargin = Math.max(2, Math.floor(image.width * 0.06)); const yMargin = Math.max(2, Math.floor(image.height * 0.06));
  for (const [startX, startY] of [[0, 0], [image.width - xMargin, 0], [0, image.height - yMargin], [image.width - xMargin, image.height - yMargin]]) {
    for (let y = startY; y < Math.min(image.height, startY + yMargin); y++) for (let x = startX; x < Math.min(image.width, startX + xMargin); x++) {
      const at = (y * image.width + x) * 4; const red = image.data[at]; const green = image.data[at + 1]; const blue = image.data[at + 2];
      if (luminance([red, green, blue]) > 170 && Math.max(red, green, blue) - Math.min(red, green, blue) < 55) {
        for (let channel = 0; channel < 3; channel++) samples[channel].push(image.data[at + channel]);
      }
    }
  }
  if (samples[0].length < 10) return null;
  return samples.map((values) => { values.sort((a, b) => a - b); return values[Math.floor(values.length / 2)]; });
}

function luminance(color) { return color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114; }
function indexOfMinimum(values) { return values.reduce((best, value, index) => value < values[best] ? index : best, 0); }
function indexOfMaximum(values) { return values.reduce((best, value, index) => value > values[best] ? index : best, 0); }
