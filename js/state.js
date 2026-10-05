// 상태 저장소: 현재 탭, 학교 코드 같은 공통 상태를 한곳에서 관리합니다.
export function createAppState(initialTab = "measurement") {
  const listeners = new Set();

  const state = {
    activeTab: initialTab,
    schoolCode: "",
  };

  function getState() {
    // 바깥 코드가 원본을 직접 바꾸지 못하도록 복사본을 돌려줍니다.
    return { ...state };
  }

  function setActiveTab(nextTab) {
    state.activeTab = nextTab;
    notify();
  }

  function setSchoolCode(code) {
    state.schoolCode = code.trim();
    notify();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notify() {
    const snapshot = getState();
    listeners.forEach((listener) => listener(snapshot));
  }

  return {
    getState,
    setActiveTab,
    setSchoolCode,
    subscribe,
  };
}
