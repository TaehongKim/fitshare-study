// =========================================
// state.js — 앱 전체가 함께 쓰는 "공용 기억 상자"
// 지금 어떤 탭을 보는지, 학생의 키·몸무게가 얼마인지 등을 기억해요.
// 세 모듈 모두 render 함수의 두 번째 값(state)으로 이 상자를 받아요.
// =========================================

import { mockStudent } from "../data/mockData.js";

export const state = {
  // 지금 보고 있는 탭 이름
  currentTab: "measurement",

  // 학교 코드로 입장한 학교 (입장하기 전에는 null)
  school: null,

  // 학생 신체 정보 (스마트 실측 모듈이 바꿔 줘요)
  student: { ...mockStudent },
};

// 탭을 바꿀 때 쓰는 함수 (app.js가 사용해요)
export function setCurrentTab(tabId) {
  state.currentTab = tabId;
}

// 입장한 학교를 바꿀 때 쓰는 함수 (app.js가 사용해요)
export function setSchool(school) {
  state.school = school;
}

// 학생 정보를 일부만 바꿀 때 쓰는 함수
// 예) updateStudent({ height: 145 }) → 키만 145로 바뀌어요
export function updateStudent(changes) {
  state.student = { ...state.student, ...changes };
}
