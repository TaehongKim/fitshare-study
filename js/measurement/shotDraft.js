// 촬영 전후에 어떤 사진 초안을 화면에 보여 줄지 고릅니다.
export function resolveShotDraft(currentDraft, records, matId, garmentId, preserveCurrentDraft = false) {
  if (preserveCurrentDraft) return currentDraft;
  if (!Array.isArray(records)) return null;

  const savedRecord = records.find((record) => record.matId === matId && record.garmentId === garmentId);
  return savedRecord ? { ...savedRecord } : null;
}

// 자동 보정과 측정이 성공했으면 수동 도구는 사용자가 열 때까지 접어 둡니다.
export function shouldOpenManualCorrection(draft) {
  return !draft?.corrected || !draft?.autoMeasurement?.ok;
}

// 자동 측정 중 생긴 실제 이유를 숨기지 않고 화면에 알려 줘요.
export function getAutomaticFailureMessage(error) {
  const detail = typeof error?.message === 'string' ? error.message.trim() : '';
  return detail
    ? `자동 측정을 마치지 못했어요. ${detail}`
    : '자동 측정을 마치지 못했어요. 사진에 배경 네 모서리가 모두 보이는지 확인해 주세요.';
}

export function addPerspectiveCorner(points, point) {
  const current = Array.isArray(points) ? points : [];
  if (current.length >= 4 || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return current;
  return [...current, { x: point.x, y: point.y }];
}

export function clearPerspectiveCorners() {
  return [];
}

// 틀리게 찍은 점 하나만 골라 지워요. 원래 목록은 그대로 둬서 되돌리기 쉬워요.
export function removePerspectiveCorner(points, index) {
  if (!Array.isArray(points) || !Number.isInteger(index) || index < 0 || index >= points.length) {
    return Array.isArray(points) ? points : [];
  }
  return points.filter((_, pointIndex) => pointIndex !== index);
}

// 위·아래 버튼으로 네 배경 촬영 순서를 바꿔요.
export function moveBackgroundOrder(order, fromIndex, toIndex) {
  if (!Array.isArray(order) || order.length !== 4 || new Set(order).size !== 4
      || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
      || fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) return order;
  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

// 저장된 배경 순서가 잘못되었으면 정해진 네 종류를 기본 순서로 돌려요.
export function normalizeBackgroundOrder(order, availableIds) {
  if (!Array.isArray(availableIds)) return [];
  const isValid = Array.isArray(order) && order.length === availableIds.length
    && new Set(order).size === availableIds.length
    && availableIds.every((id) => order.includes(id));
  return isValid ? [...order] : [...availableIds];
}
