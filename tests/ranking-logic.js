import {
  addReview, addUser, cancelReservation, computeRanking, confirmReceived, ensureUser, getGarmentExchange, reserveGarment, createEmptyState, createExchange, finalizeMonths, getMonthKey, getPendingExchanges,
  getProfile, getRatingView, getReviewable, getReviewsFor, normalizeState, submitRating, setAvatar, defaultAvatar
} from '../modules/rankingLogic.js';

// 브라우저에서 열면 통과/실패를 바로 볼 수 있는 작은 시험입니다.
const checks = [];
function check(name, action) {
  try { action(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); }
}
function equal(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message || `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
}
function throws(action, text) {
  try { action(); } catch (error) { if (error instanceof RangeError && (!text || error.message.includes(text))) return; throw error; }
  throw new Error('RangeError 가 나지 않았어요.');
}

const OCT = new Date(2026, 9, 10, 12, 0, 0);
const OCT2 = new Date(2026, 9, 11, 12, 0, 0);
const SEP = new Date(2026, 8, 15, 12, 0, 0);
const NOV = new Date(2026, 10, 2, 9, 0, 0);

// 친구 n명이 있는 상태를 만듭니다. (u1, u2, …)
function withUsers(...names) {
  let state = createEmptyState();
  for (const name of names) state = addUser(state, name).state;
  return state;
}
// 준 사람 → 받는 사람, 두 점수를 모두 넣어 공개된 나눔을 만듭니다.
function deal(state, giverId, receiverId, giverScore, receiverScore, when, item = '옷') {
  const created = createExchange(state, { giverId, receiverId, itemName: item }, when);
  const first = submitRating(created.state, created.exchange.id, giverId, giverScore, when).state;
  return submitRating(first, created.exchange.id, receiverId, receiverScore, when).state;
}

check('정상: 점수는 둘 다 낼 때까지 비공개이고 둘째가 내면 동시에 공개돼요', () => {
  let state = withUsers('하늘', '보리');
  const created = createExchange(state, { giverId: 'u1', receiverId: 'u2', itemName: '후드티' }, OCT);
  const first = submitRating(created.state, 'e1', 'u1', 8, OCT);
  const view1 = getRatingView(first.exchange, 'u2'); // 받은 친구가 보는 화면
  equal(view1.revealed, false); equal(view1.theirs, null, '공개 전에는 상대 점수가 보이면 안 돼요.');
  equal(getRatingView(first.exchange, 'u1').mine, 8);
  equal(getRatingView(first.exchange, 'u1').waitingForOther, true);
  const second = submitRating(first.state, 'e1', 'u2', 6, OCT);
  equal(getRatingView(second.exchange, 'u1'), { revealed: true, mine: 8, theirs: 6, canRate: false, waitingForOther: false });
  equal(getRatingView(second.exchange, 'u2').theirs, 8);
});
check('정상: 포인트는 상대가 나에게 준 점수예요', () => {
  const state = deal(withUsers('하늘', '보리'), 'u1', 'u2', 9, 4, OCT);
  const rows = computeRanking(state, '2026-10');
  equal(rows.map((r) => [r.name, r.points, r.rank]), [['보리', 9, 1], ['하늘', 4, 2]]); // 보리는 하늘이 준 9점, 하늘은 보리가 준 4점
});
check('정상: 공개되기 전 나눔은 순위와 횟수에 넣지 않아요', () => {
  let state = withUsers('하늘', '보리');
  state = createExchange(state, { giverId: 'u1', receiverId: 'u2', itemName: '모자' }, OCT).state;
  state = submitRating(state, 'e1', 'u1', 10, OCT).state;
  equal(computeRanking(state, '2026-10'), []);
  equal(getPendingExchanges(state, 'u2').length, 1);
  equal(getProfile(state, 'u1', OCT).donations, 0);
});
check('경계: 1점과 10점은 받고 0점·11점·소수·문자는 거부해요', () => {
  let state = withUsers('하늘', '보리');
  state = createExchange(state, { giverId: 'u1', receiverId: 'u2', itemName: '양말' }, OCT).state;
  submitRating(state, 'e1', 'u1', 1, OCT); submitRating(state, 'e1', 'u1', 10, OCT);
  for (const bad of [0, 11, -3, 7.5, NaN, '7', null]) throws(() => submitRating(state, 'e1', 'u1', bad, OCT), '1점부터 10점');
});
check('경계: 같은 달 안에서 동점이면 나눔 횟수 → 먼저 도달한 순서로 정해요', () => {
  let state = withUsers('가', '나', '다');
  state = deal(state, 'u1', 'u3', 5, 5, OCT);   // 가 5, 다 5
  state = deal(state, 'u2', 'u3', 5, 5, OCT2);  // 나 5, 다 +5 → 다 10
  const rows = computeRanking(state, '2026-10');
  equal(rows.map((r) => r.name), ['다', '가', '나']);  // 가와 나는 5점 동점 → 먼저 5점이 된 가가 앞
  equal(rows.map((r) => r.rank), [1, 2, 3]);
});
check('월별: 다음 달 순위는 0에서 다시 시작하고 지난달 기록은 그대로예요', () => {
  let state = deal(withUsers('하늘', '보리'), 'u1', 'u2', 7, 9, SEP);
  equal(computeRanking(state, '2026-09').length, 2);
  equal(computeRanking(state, '2026-10'), []);
  equal(getProfile(state, 'u1', OCT).monthPoints, 0);
  equal(getProfile(state, 'u1', OCT).donations, 1, '기부 횟수는 누적으로 남아야 해요.');
});
check('배지: 끝난 달 1·2·3위에게만 한 번 주고 몇 번 불러도 같아요', () => {
  let state = withUsers('가', '나', '다', '라');
  state = deal(state, 'u1', 'u2', 10, 9, SEP);   // 가 9, 나 10
  state = deal(state, 'u3', 'u4', 6, 3, SEP);    // 다 3, 라 6
  const done = finalizeMonths(state, OCT);
  equal(done.badges.map((b) => [b.userId, b.rank]), [['u2', 1], ['u1', 2], ['u4', 3]]);
  equal(done.finalizedMonths, ['2026-09']);
  equal(finalizeMonths(done, OCT), done, '이미 준 달은 다시 계산하지 않아요.');
  equal(finalizeMonths(done, NOV).badges.length, 3);
});
check('배지: 진행 중인 달은 아직 주지 않고, 다음 달에도 배지는 유지돼요', () => {
  let state = deal(withUsers('하늘', '보리'), 'u1', 'u2', 9, 9, OCT);
  equal(finalizeMonths(state, OCT2).badges, []);
  state = finalizeMonths(state, NOV);
  // u1(하늘)은 보리가 준 9점, u2(보리)도 9점으로 동점 → 나눔 횟수도 같고 u1이 먼저 도달하지 않았으므로 이름순(보리<하늘)
  equal(state.badges.map((b) => [b.userId, b.rank]), [['u2', 1], ['u1', 2]]);
  equal(getProfile(state, 'u1', NOV).badges.length, 1);
  equal(getProfile(state, 'u1', NOV).monthPoints, 0, '새 달 점수는 0이에요.');
  const later = finalizeMonths(deal(state, 'u1', 'u2', 1, 1, NOV), new Date(2027, 0, 5));
  equal(getProfile(later, 'u1', new Date(2027, 0, 5)).badges.length, 2);
});
check('프로필: 기부·수령 횟수와 이번 달 순위가 보여요', () => {
  let state = withUsers('하늘', '보리', '달이');
  state = deal(state, 'u1', 'u2', 5, 8, OCT);
  state = deal(state, 'u3', 'u1', 3, 9, OCT2);
  const profile = getProfile(state, 'u1', OCT2);
  equal([profile.donations, profile.receipts, profile.monthPoints, profile.monthRank], [1, 1, 11, 1]);
});
check('오류: 이름·나눔 입력을 확인해요', () => {
  const state = withUsers('하늘', '보리');
  throws(() => addUser(state, '   '), '이름을 입력');
  throws(() => addUser(state, '하늘'), '이미 있는 이름');
  throws(() => addUser(state, '가'.repeat(201)), '200글자');
  throws(() => createExchange(state, { giverId: 'u1', receiverId: 'u1', itemName: '옷' }, OCT), '서로 다른');
  throws(() => createExchange(state, { giverId: 'u1', receiverId: 'u9', itemName: '옷' }, OCT), '찾을 수 없어요');
  throws(() => createExchange(state, { giverId: 'u1', receiverId: 'u2', itemName: '' }, OCT), '옷 이름을 입력');
});
check('오류: 같은 점수를 두 번 보내거나 남이 대신 보낼 수 없어요', () => {
  let state = withUsers('하늘', '보리', '달이');
  state = createExchange(state, { giverId: 'u1', receiverId: 'u2', itemName: '옷' }, OCT).state;
  state = submitRating(state, 'e1', 'u1', 5, OCT).state;
  throws(() => submitRating(state, 'e1', 'u1', 9, OCT), '이미 점수를 보냈어요');
  throws(() => submitRating(state, 'e1', 'u3', 9, OCT), '참여한 두 친구');
  throws(() => submitRating(state, 'e9', 'u1', 9, OCT), '나눔 기록을 찾을 수 없어요');
});
check('오류: 망가진 저장값은 빈 상태로 안전하게 고쳐요', () => {
  equal(normalizeState(null), createEmptyState());
  equal(normalizeState('abc'), createEmptyState());
  const fixed = normalizeState({ users: [{ id: 'u1', name: '하늘' }, 7], exchanges: [{ giverId: 'u1', receiverId: 'u1' }, null], badges: 'x' });
  equal([fixed.users.length, fixed.exchanges.length, fixed.badges.length], [1, 0, 0]);
  throws(() => getMonthKey('아무날'), '날짜');
});

check('정상: 받은 사람은 점수 공개 뒤 후기를 남기고, 준 사람 프로필에 보여요 (포인트는 그대로)', () => {
  const state = deal(withUsers('하늘', '보리'), 'u1', 'u2', 9, 4, OCT);
  equal(getReviewable(state, 'u2').length, 1);
  const done = addReview(state, 'e1', 'u2', '  깨끗하고   딱 맞아요  ', OCT2).state;
  equal(getReviewsFor(done, 'u1').map((r) => [r.reviewerId, r.text]), [['u2', '깨끗하고 딱 맞아요']]);
  equal(getReviewable(done, 'u2').length, 0);
  equal(computeRanking(done, '2026-10').map((r) => r.points), computeRanking(state, '2026-10').map((r) => r.points));
});
check('경계: 후기는 1글자와 100글자까지 받아요', () => {
  const state = deal(withUsers('하늘', '보리'), 'u1', 'u2', 5, 5, OCT);
  addReview(state, 'e1', 'u2', '좋', OCT);
  addReview(state, 'e1', 'u2', '가'.repeat(100), OCT);
  throws(() => addReview(state, 'e1', 'u2', '가'.repeat(101), OCT), '100글자');
});
check('오류: 후기는 받은 사람만, 공개 뒤에, 비어 있지 않게, 한 번만 쓸 수 있어요', () => {
  const open = deal(withUsers('하늘', '보리'), 'u1', 'u2', 5, 5, OCT);
  throws(() => addReview(open, 'e1', 'u1', '고마워요', OCT), '받은 친구만');
  throws(() => addReview(open, 'e1', 'u2', '   ', OCT), '후기 내용을 입력');
  throws(() => addReview(open, 'e9', 'u2', '좋아요', OCT), '찾을 수 없어요');
  const hidden = submitRating(createExchange(withUsers('하늘', '보리'), { giverId: 'u1', receiverId: 'u2', itemName: '옷' }, OCT).state, 'e1', 'u1', 5, OCT).state;
  throws(() => addReview(hidden, 'e1', 'u2', '좋아요', OCT), '공개된 뒤');
  const once = addReview(open, 'e1', 'u2', '좋아요', OCT).state;
  throws(() => addReview(once, 'e1', 'u2', '또 써요', OCT), '이미 후기');
  const fixed = normalizeState({ users: [{ id: 'u1', name: '하늘' }, { id: 'u2', name: '보리' }], exchanges: [{ id: 'e1', giverId: 'u1', receiverId: 'u2', review: { text: 5 } }] });
  equal(fixed.exchanges[0].review, null);
});

check('정상: 옷을 예약하고 받았다고 확인한 뒤에야 점수를 줄 수 있어요', () => {
  let state = createEmptyState();
  const reserved = reserveGarment(state, { garmentId: 'g1', itemName: '파란 점퍼', ownerName: '지수', reserverName: '민수' }, OCT);
  state = reserved.state;
  equal(state.users.map((u) => u.name), ['지수', '민수']);
  equal([reserved.exchange.status, reserved.exchange.giverId, reserved.exchange.receiverId], ['reserved', 'u1', 'u2']);
  equal(getPendingExchanges(state, 'u1').length, 0, '예약만으로는 점수 차례가 아니에요.');
  throws(() => submitRating(state, 'e1', 'u1', 7, OCT), '직접 주고받은 뒤');
  throws(() => confirmReceived(state, 'e1', 'u1', OCT), '받은 친구만');
  state = confirmReceived(state, 'e1', 'u2', OCT).state;
  equal(getPendingExchanges(state, 'u1').length, 1);
  state = submitRating(state, 'e1', 'u1', 7, OCT).state;
  state = submitRating(state, 'e1', 'u2', 9, OCT).state;
  equal(computeRanking(state, '2026-10').map((r) => [r.name, r.points]), [['지수', 9], ['민수', 7]]);
});
check('오류: 이미 예약된 옷, 내 옷, 올린 사람 없는 옷은 예약할 수 없어요', () => {
  const base = reserveGarment(createEmptyState(), { garmentId: 'g1', itemName: '점퍼', ownerName: '지수', reserverName: '민수' }, OCT).state;
  throws(() => reserveGarment(base, { garmentId: 'g1', itemName: '점퍼', ownerName: '지수', reserverName: '하준' }, OCT), '이미 예약');
  throws(() => reserveGarment(base, { garmentId: 'g2', itemName: '바지', ownerName: '지수', reserverName: '지수' }, OCT), '내가 올린 옷');
  throws(() => reserveGarment(base, { garmentId: 'g3', itemName: '바지', ownerName: '', reserverName: '민수' }, OCT), '올린 사람');
  throws(() => reserveGarment(base, { garmentId: 'g3', itemName: '바지', ownerName: '지수', reserverName: '  ' }, OCT), '이름을 입력');
  equal(getGarmentExchange(base, 'g1').status, 'reserved');
});
check('경계: 예약을 취소하면 같은 옷을 다시 예약할 수 있고, 끝난 나눔은 취소할 수 없어요', () => {
  let state = reserveGarment(createEmptyState(), { garmentId: 'g1', itemName: '점퍼', ownerName: '지수', reserverName: '민수' }, OCT).state;
  throws(() => cancelReservation(state, 'e1', 'u9'), '참여한 친구');
  state = cancelReservation(state, 'e1', 'u1').state;
  equal(getGarmentExchange(state, 'g1'), null);
  state = reserveGarment(state, { garmentId: 'g1', itemName: '점퍼', ownerName: '지수', reserverName: '하준' }, OCT).state;
  equal(getGarmentExchange(state, 'g1').receiverId, 'u3');
  state = confirmReceived(state, 'e2', 'u3', OCT).state;
  throws(() => cancelReservation(state, 'e2', 'u3'), '이미 끝났거나');
  equal(ensureUser(state, ' 민수 ').user.id, 'u2');
});

check('정상: 아바타를 꾸미고 저장하며 잘못된 아바타 값은 거부해요', () => {
  let state = withUsers('하늘', '보리');
  const avatar = { bg: '#ffd9d9', face: '🐶', hat: '👑', outfit: '👕' };
  state = setAvatar(state, 'u1', avatar).state;
  equal(state.users[0].avatar, avatar);
  equal(state.users[1].avatar, undefined);
  equal(normalizeState(JSON.parse(JSON.stringify(state))).users[0].avatar, avatar);
  throws(() => setAvatar(state, 'u1', { ...avatar, face: '<img src=x>' }), '목록에서 골라');
  throws(() => setAvatar(state, 'u1', { bg: '#ffd9d9' }), '목록에서 골라');
  throws(() => setAvatar(state, 'u9', avatar), '찾을 수 없어요');
  const broken = normalizeState({ users: [{ id: 'u1', name: '하늘', avatar: { ...avatar, hat: 'x' } }] });
  equal(broken.users[0].avatar, undefined);
  equal(defaultAvatar().hat, '');
});

const list = document.querySelector('#results');
list.innerHTML = checks.map((item) => `<li style="color:${item.passed ? 'green' : 'red'}">${item.passed ? '통과' : '실패'}: ${item.name}${item.error ? ` — ${item.error}` : ''}</li>`).join('');
document.title = `${checks.filter((c) => c.passed).length}/${checks.length} 통과`;
