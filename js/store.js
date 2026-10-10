// =========================================
// store.js — 나눔 보관함 (공통 파일)
// 새로 나눔한 옷, 예약, "받았어요" 기록을 브라우저(localStorage)에 저장해요.
// 나눔 탭은 여기에 기록을 쓰고, 랭킹 탭은 여기서 기록을 읽어요.
// ⚠️ 기기(브라우저)마다 따로 저장돼요. 다른 기기와는 공유되지 않아요.
// =========================================

import { mockClothes, mockShareLogs } from "../data/mockData.js";

const DONATION_KEY = "fitshare-donations";   // 새로 나눔한 옷 목록
const RESERVE_KEY = "fitshare-reservations"; // 예약 목록
const TAKE_KEY = "fitshare-takes";           // 받았어요(나눔 완료) 기록
const WITHDRAW_KEY = "fitshare-withdrawn";   // 나눔 취소한 예시 옷 번호

export const RESERVE_DAYS = 3;     // 예약하고 며칠 안에 받아 가야 하는지
export const MAX_RESERVATIONS = 3; // 한 사람이 한 번에 예약할 수 있는 옷 수

// 저장된 목록을 꺼내요. 없거나 망가져 있으면 빈 목록이에요.
function load(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

// 목록을 저장해요. 저장에 실패하면 false를 돌려줘요.
function save(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// 저장 공간이 꽉 차면(사진이 많을 때) 저장이 안 될 수 있어요.
const SAVE_ERROR = "저장하지 못했어요. 사진이 많으면 저장 공간이 부족할 수 있어요. 맨 아래 '연습 기록 모두 지우기'를 해 보세요.";

// 오늘 날짜를 "2026-10-10" 모양으로 만들어요.
export function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// 날짜에 며칠을 더해요. 예) addDays("2026-10-10", 3) → "2026-10-13"
function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// 기한이 지나지 않은 예약만 골라요. (기한 날까지는 예약이 살아 있어요)
function activeReservations() {
  const day = today();
  return load(RESERVE_KEY).filter((reservation) => reservation.until >= day);
}

// 랭킹에 쓰는 모든 나눔 기록 = 예시 기록 + 이 브라우저의 "받았어요" 기록
export function getShareLogs() {
  return [...mockShareLogs, ...load(TAKE_KEY)];
}

// 옷장의 모든 옷 = 예시 옷 + 새로 나눔한 옷
// takenBy: 받아 간 사람 (나눔 끝), reservedBy: 예약한 사람, reservedUntil: 예약 기한
export function getClothes() {
  const takenBy = {};
  for (const log of load(TAKE_KEY)) takenBy[log.itemId] = log.receiver;

  const reserved = {};
  for (const reservation of activeReservations()) reserved[reservation.itemId] = reservation;

  const withdrawn = load(WITHDRAW_KEY);
  const all = [...mockClothes, ...load(DONATION_KEY)].filter((item) => !withdrawn.includes(item.id));

  return all.map((item) => {
    const taken = takenBy[item.id] || "";
    const reservation = taken ? null : reserved[item.id];
    return {
      ...item,
      takenBy: taken,
      reservedBy: reservation ? reservation.reserver : "",
      reservedUntil: reservation ? reservation.until : "",
    };
  });
}

// 옷을 나눔 목록에 올려요. 돌려주는 값: 성공하면 { item }, 실패하면 { error }
export function donate(item) {
  const newItem = { ...item, id: `d${Date.now()}` };
  if (!save(DONATION_KEY, [...load(DONATION_KEY), newItem])) return { error: SAVE_ERROR };
  return { item: newItem };
}

// 내가 나눔한 옷을 취소해요(목록에서 내려요). 돌려주는 값: 성공하면 { item }, 안 되면 { error }
export function cancelDonation(itemId, name) {
  const item = getClothes().find((cloth) => cloth.id === itemId);
  if (!item) return { error: "그 옷을 찾지 못했어요." };
  if (item.giver !== name) return { error: "내가 나눔한 옷만 취소할 수 있어요." };
  if (item.takenBy) return { error: "이미 친구가 받아 간 옷은 취소할 수 없어요." };
  if (item.reservedBy) {
    return { error: "친구가 예약한 옷이라 지금은 취소할 수 없어요. 예약이 끝나거나 풀리면 다시 해 주세요." };
  }

  const donations = load(DONATION_KEY);
  const ok = donations.some((donation) => donation.id === itemId)
    ? save(DONATION_KEY, donations.filter((donation) => donation.id !== itemId)) // 새로 나눔한 옷은 지워요.
    : save(WITHDRAW_KEY, [...load(WITHDRAW_KEY), itemId]); // 예시 옷은 "취소함"으로 표시만 해요.
  if (!ok) return { error: SAVE_ERROR };
  return { item };
}

// 옷을 예약해요. 돌려주는 값: 성공하면 { item, until }, 안 되면 { error }
export function reserve(itemId, name) {
  const item = getClothes().find((cloth) => cloth.id === itemId);
  if (!item) return { error: "그 옷을 찾지 못했어요." };
  if (item.takenBy) return { error: "이미 나눔이 끝난 옷이에요." };
  if (item.giver === name) return { error: "내가 나눔한 옷은 예약할 수 없어요." };
  if (item.reservedBy === name) return { error: "이미 내가 예약한 옷이에요." };
  if (item.reservedBy) return { error: "다른 친구가 먼저 예약했어요." };

  const active = activeReservations();
  if (active.filter((reservation) => reservation.reserver === name).length >= MAX_RESERVATIONS) {
    return { error: `예약은 한 번에 ${MAX_RESERVATIONS}벌까지 할 수 있어요. 받거나 취소한 뒤에 다시 예약해 주세요.` };
  }

  const until = addDays(today(), RESERVE_DAYS);
  const reservation = { itemId, reserver: name, date: today(), until };
  // 기한이 지난 예약은 이참에 정리하고 새 예약을 더해요.
  if (!save(RESERVE_KEY, [...active, reservation])) return { error: SAVE_ERROR };
  return { item, until };
}

// 내 예약을 찾아요. (없으면 undefined)
function findMyReservation(itemId, name) {
  return activeReservations().find((reservation) => reservation.itemId === itemId && reservation.reserver === name);
}

// 예약을 취소해요. 돌려주는 값: 성공하면 { ok: true }, 안 되면 { error }
export function cancelReservation(itemId, name) {
  if (!findMyReservation(itemId, name)) return { error: "취소할 예약을 찾지 못했어요." };
  const rest = activeReservations().filter((reservation) => !(reservation.itemId === itemId && reservation.reserver === name));
  if (!save(RESERVE_KEY, rest)) return { error: SAVE_ERROR };
  return { ok: true };
}

// 예약한 옷을 받았어요. 이때 나눔 기록이 생겨서 랭킹 점수가 쌓여요.
// 돌려주는 값: 성공하면 { item }, 안 되면 { error }
export function completeReservation(itemId, name) {
  if (!findMyReservation(itemId, name)) return { error: "예약이 없거나 기한이 지났어요. 다시 예약해 주세요." };
  const item = getClothes().find((cloth) => cloth.id === itemId);
  if (!item || item.takenBy) return { error: "이미 나눔이 끝난 옷이에요." };

  const log = { date: today(), giver: item.giver, receiver: name, itemId };
  if (!save(TAKE_KEY, [...load(TAKE_KEY), log])) return { error: SAVE_ERROR };
  cancelReservation(itemId, name); // 받았으니 예약 목록에서는 지워요.
  return { item };
}

// 연습하면서 쌓인 나눔·예약·받았어요·나눔 취소 기록을 모두 지워요. (예시 데이터는 그대로)
export function clearPractice() {
  try {
    localStorage.removeItem(DONATION_KEY);
    localStorage.removeItem(RESERVE_KEY);
    localStorage.removeItem(TAKE_KEY);
    localStorage.removeItem(WITHDRAW_KEY);
  } catch {
    // 지울 수 없으면 그냥 넘어가요.
  }
}
