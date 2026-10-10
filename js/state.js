// 여러 모듈이 함께 사용할 공통 상태입니다.
export const state = { activeTab: 'measurement', schoolCode: '', visitedTabs: new Set() };

export function markTabVisited(tabName) {
  state.activeTab = tabName;
  state.visitedTabs.add(tabName);
}
