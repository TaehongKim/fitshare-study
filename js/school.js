// =========================================
// school.js — 학교 이름으로 입장하기 (공통 파일)
// 한글로 입력한 학교 이름을 검사하고, 브라우저에 기억해 두는 일을 해요.
// =========================================

import { mockSchools } from "../data/mockData.js";

const SAVE_KEY = "fitshare-school-name";

// 입력한 학교 이름으로 학교를 찾아요.
// "푸른숲초등학교"처럼 전체 이름도, "푸른숲"처럼 앞부분만 써도 찾아요.
// 돌려주는 값: 찾으면 { school }, 문제가 있으면 { error }
export function findSchool(text) {
  const name = String(text).replace(/\s/g, ""); // 띄어쓰기는 모두 없애고 비교해요.
  if (name === "") return { error: "학교 이름을 입력해 주세요." };
  if (!/^[가-힣0-9]+$/.test(name)) return { error: "학교 이름은 한글로 입력해 주세요." };
  if (name.length < 2) return { error: "학교 이름을 2글자 이상 써 주세요." };

  // 이름이 똑같은 학교가 있으면 바로 그 학교예요.
  const exact = mockSchools.find((school) => school.name === name);
  if (exact) return { school: exact };

  // 아니면 앞부분이 같은 학교를 찾아요.
  const found = mockSchools.filter((school) => school.name.startsWith(name));
  if (found.length === 1) return { school: found[0] };
  if (found.length > 1) {
    const names = found.map((school) => school.name).join(", ");
    return { error: `학교가 여러 곳이에요 (${names}). 이름을 더 정확히 써 주세요.` };
  }
  return { error: "그런 학교를 찾지 못했어요. 학교 이름을 다시 확인해 주세요." };
}

// 입장한 학교 이름을 브라우저에 기억해 둬요. 새로고침해도 다시 입력하지 않아도 돼요.
// 브라우저 설정에 따라 저장이 안 될 수도 있어서 try로 감싸고, 그때는 그냥 넘어가요.
export function saveSchoolName(name) {
  try {
    localStorage.setItem(SAVE_KEY, name);
  } catch {
    // 저장이 안 되면 다음에 이름을 다시 입력하면 돼요.
  }
}

export function loadSchoolName() {
  try {
    return localStorage.getItem(SAVE_KEY) || "";
  } catch {
    return "";
  }
}

export function forgetSchoolName() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없으면 그냥 넘어가요.
  }
}
