// =========================================
// mockData.js — 연습용 "가짜 데이터"
// 진짜 AI·카메라·데이터베이스가 없어도 화면을 바로 볼 수 있게
// 미리 만들어 둔 예시 값이에요. 마음껏 고쳐서 테스트해도 돼요.
// =========================================

// 가상 학교 목록 (학교 이름을 입력하면 이 목록에서 찾아요)
export const mockSchools = [
  { name: "푸른숲초등학교" },
  { name: "햇살초등학교" },
  { name: "햇살마루초등학교" },
  { name: "별빛초등학교" },
  { name: "대전전민초등학교" },
];

// 테스트용 학생 (키: cm, 몸무게: kg, 어깨너비: cm)
export const mockStudent = {
  nickname: "새싹이",
  grade: 4,
  height: 142,
  weight: 36,
  shoulder: 31,
};

// 스마트 옷장에 등록된 옷 (size는 아동복 호수, shoulder는 상의 어깨너비 cm, giver는 나눔한 친구예요)
export const mockClothes = [
  { id: "c1", name: "하늘색 반팔 티", category: "상의", size: 130, shoulder: 30, emoji: "👕", condition: "아주 좋음", giver: "하늘이" },
  { id: "c2", name: "노란 후드 집업", category: "아우터", size: 140, emoji: "🧥", condition: "좋음", giver: "단풍이" },
  { id: "c3", name: "남색 체육복 바지", category: "하의", size: 140, emoji: "👖", condition: "좋음", giver: "구름이" },
  { id: "c4", name: "체크 원피스", category: "원피스", size: 150, emoji: "👗", condition: "아주 좋음", giver: "꼬마별" },
  { id: "c5", name: "초록 반바지", category: "하의", size: 140, emoji: "🩳", condition: "보통", giver: "하늘이" },
  { id: "c6", name: "회색 맨투맨", category: "상의", size: 140, shoulder: 34, emoji: "👚", condition: "좋음", giver: "단풍이" },
];

// 추천 코디 예시 (itemIds는 위 옷의 id예요)
export const mockOutfits = [
  { id: "o1", title: "체육 시간 활동 코디", mood: "🏃 활동적", itemIds: ["c6", "c3"] },
  { id: "o2", title: "쌀쌀한 등굣길 코디", mood: "🍂 따뜻함", itemIds: ["c2", "c3"] },
  { id: "o3", title: "현장체험학습 코디", mood: "📸 산뜻함", itemIds: ["c6", "c5"] },
];

// 옷 나눔 기록 (가상 데이터)
// 나눔 탭에서 "가져가기"를 하면 새 기록이 브라우저에 더해져요. (js/store.js)
// giver: 옷을 준 사람, receiver: 옷을 받은 사람, itemId: 나눈 옷 번호
// ✋ 표시는 규칙에 걸리도록 일부러 넣은 기록이에요.
export const mockShareLogs = [
  // 9월 기록: 10월 랭킹 점수에는 들어가지 않아요. (1달마다 초기화)
  { date: "2026-09-12", giver: "구름이", receiver: "단풍이", itemId: "s10" },
  { date: "2026-09-12", giver: "구름이", receiver: "하늘이", itemId: "s11" },
  { date: "2026-09-25", giver: "꼬마별", receiver: "새싹이", itemId: "s12" },

  // 10월 기록
  { date: "2026-10-02", giver: "하늘이", receiver: "새싹이", itemId: "s1" },
  { date: "2026-10-02", giver: "하늘이", receiver: "꼬마별", itemId: "s2" },
  { date: "2026-10-02", giver: "하늘이", receiver: "단풍이", itemId: "s3" },
  { date: "2026-10-02", giver: "하늘이", receiver: "구름이", itemId: "s4" }, // ✋ 하늘이의 이날 4번째 점수
  { date: "2026-10-05", giver: "새싹이", receiver: "하늘이", itemId: "s5" },
  { date: "2026-10-07", giver: "새싹이", receiver: "단풍이", itemId: "s12" }, // ✋ 9월에 받은 옷을 다시 나눔
  { date: "2026-10-09", giver: "단풍이", receiver: "꼬마별", itemId: "s6" },
  { date: "2026-10-09", giver: "단풍이", receiver: "구름이", itemId: "s7" },
  { date: "2026-10-08", giver: "꼬마별", receiver: "하늘이", itemId: "s8" },
  { date: "2026-10-10", giver: "구름이", receiver: "새싹이", itemId: "s9" },
  { date: "2026-10-10", giver: "새싹이", receiver: "꼬마별", itemId: "s13" },
];
