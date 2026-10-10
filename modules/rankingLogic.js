// 참여 랭킹의 규칙(규칙/랭킹.md)을 계산으로 옮긴 파일입니다. 화면·저장소와 분리해 두어 따로 시험할 수 있어요.
//
// 규칙 요약
// 1. 나눔(기부)이 한 번 끝나면 준 사람과 받은 사람이 서로에게 1~10점을 줍니다.
// 2. 두 사람이 모두 점수를 넣기 전에는 서로의 점수가 비공개이고, 둘 다 넣으면 동시에 공개되며 그때 포인트가 지급돼요.
// 3. 포인트는 '상대가 나에게 준 점수'입니다. 준 사람은 받은 사람이 준 점수를, 받은 사람은 준 사람이 준 점수를 얻어요.
// 4. 순위는 월별 포인트가 많은 순서입니다. 다음 달이 되면 점수는 0에서 다시 시작하고, 지난 달 1·2·3위 배지는 영구히 남아요.
// 5. 프로필에는 배지, 기부 횟수, 수령 횟수, 받은 후기가 보입니다.
// 6. 옷을 받은 사람은 점수가 공개된 뒤 준 사람에게 후기를 한 번 남길 수 있어요. (포인트와 무관)

export const MIN_SCORE = 1;
export const MAX_SCORE = 10;
export const BADGE_RANKS = [1, 2, 3];
export const BADGE_ICONS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const NAME_MAX = 10;
const ITEM_MAX = 30;
export const REVIEW_MAX = 100;
// 예약(reserved) → 직접 만나 옷을 건넴(completed) → 점수·후기. 취소(cancelled)하면 다시 예약할 수 있어요.
export const EXCHANGE_STATUSES = ['reserved', 'completed', 'cancelled'];

export function createEmptyState() {
  return { version: 1, users: [], exchanges: [], badges: [], finalizedMonths: [] };
}

// 저장소에서 읽은 값이 망가졌어도 앱이 멈추지 않게 모양을 확인하고 고쳐 줍니다.
export function normalizeState(value) {
  const base = createEmptyState();
  if (!value || typeof value !== 'object') return base;
  const list = (name) => (Array.isArray(value[name]) ? value[name] : []);
  const users = list('users').filter((user) => user && typeof user.id === 'string' && typeof user.name === 'string');
  const userIds = new Set(users.map((user) => user.id));
  const exchanges = list('exchanges').filter((item) => item && userIds.has(item.giverId) && userIds.has(item.receiverId) && item.giverId !== item.receiverId);
  const exchangesClean = exchanges.map((raw) => {
    const item = { ...raw, garmentId: typeof raw.garmentId === 'string' ? raw.garmentId : null, status: EXCHANGE_STATUSES.includes(raw.status) ? raw.status : 'completed' };
    const r = item.review;
    const ok = r && typeof r.text === 'string' && r.text.trim() && typeof r.createdAt === 'string';
    return { ...item, review: ok ? { text: r.text.slice(0, REVIEW_MAX), createdAt: r.createdAt } : null };
  });
  const badges = list('badges').filter((badge) => badge && userIds.has(badge.userId) && BADGE_RANKS.includes(badge.rank) && /^\d{4}-\d{2}$/.test(badge.month));
  const finalizedMonths = list('finalizedMonths').filter((month) => /^\d{4}-\d{2}$/.test(month));
  return { ...base, users, exchanges: exchangesClean, badges, finalizedMonths };
}

export function getMonthKey(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) throw new RangeError('날짜를 읽을 수 없어요.');
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(monthKey) {
  const [year, month] = monthKey.split('-');
  return `${year}년 ${Number(month)}월`;
}

export function validateScore(score) {
  if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
    throw new RangeError(`점수는 ${MIN_SCORE}점부터 ${MAX_SCORE}점 사이의 숫자로 골라 주세요.`);
  }
  return score;
}

function cleanText(text, max, label) {
  const value = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  if (!value) throw new RangeError(`${label}을 입력해 주세요.`);
  if (value.length > max) throw new RangeError(`${label}은 ${max}글자까지 쓸 수 있어요.`);
  return value;
}

function findUser(state, userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) throw new RangeError('친구를 찾을 수 없어요. 목록에서 다시 골라 주세요.');
  return user;
}

export function addUser(state, name) {
  const clean = cleanText(name, NAME_MAX, '이름');
  if (state.users.some((user) => user.name.toLowerCase() === clean.toLowerCase())) {
    throw new RangeError('이미 있는 이름이에요. 다른 이름을 써 주세요.');
  }
  const user = { id: `u${state.users.length + 1}`, name: clean };
  return { state: { ...state, users: [...state.users, user] }, user };
}

// 준 사람(기부)과 받는 사람(신청)이 정해진 새 나눔을 만듭니다. 점수는 아직 비어 있어요.
export function createExchange(state, { giverId, receiverId, itemName, garmentId = null, status = 'completed' }, now = new Date()) {
  findUser(state, giverId);
  findUser(state, receiverId);
  if (giverId === receiverId) throw new RangeError('주는 사람과 받는 사람은 서로 다른 친구여야 해요.');
  const item = cleanText(itemName, ITEM_MAX, '나눈 옷 이름');
  const exchange = {
    id: `e${state.exchanges.length + 1}`, giverId, receiverId, itemName: item, garmentId, status,
    createdAt: new Date(now).toISOString(),
    giverToReceiver: null, receiverToGiver: null, revealedAt: null, review: null
  };
  return { state: { ...state, exchanges: [...state.exchanges, exchange] }, exchange };
}

// 한 사람이 상대에게 줄 점수를 비공개로 넣습니다. 두 사람이 모두 넣으면 그 순간 공개되고 포인트가 지급돼요.
export function submitRating(state, exchangeId, raterId, score, now = new Date()) {
  const exchange = state.exchanges.find((item) => item.id === exchangeId);
  if (!exchange) throw new RangeError('나눔 기록을 찾을 수 없어요.');
  validateScore(score);
  if (exchange.status !== 'completed') throw new RangeError('옷을 직접 주고받은 뒤에 점수를 줄 수 있어요. 먼저 "옷을 받았어요"를 눌러 주세요.');
  let field;
  if (raterId === exchange.giverId) field = 'giverToReceiver';
  else if (raterId === exchange.receiverId) field = 'receiverToGiver';
  else throw new RangeError('이 나눔에 참여한 두 친구만 점수를 줄 수 있어요.');
  if (exchange[field] !== null) throw new RangeError('이미 점수를 보냈어요. 보낸 점수는 바꿀 수 없어요.');
  const next = { ...exchange, [field]: score };
  if (next.giverToReceiver !== null && next.receiverToGiver !== null) next.revealedAt = new Date(now).toISOString();
  return { state: { ...state, exchanges: state.exchanges.map((item) => (item.id === exchangeId ? next : item)) }, exchange: next };
}

// 이름으로 친구를 찾고, 없으면 새로 만듭니다. (로그인이 없어서 이름이 곧 나예요.)
export function ensureUser(state, name) {
  const clean = cleanText(name, NAME_MAX, '이름');
  const found = state.users.find((user) => user.name.toLowerCase() === clean.toLowerCase());
  if (found) return { state, user: found };
  return addUser(state, clean);
}

// 옷장의 옷 하나에 걸려 있는 예약/나눔을 찾습니다. 취소된 것은 없는 것으로 봐요.
export function getGarmentExchange(state, garmentId) {
  return state.exchanges.find((item) => item.garmentId === garmentId && item.status !== 'cancelled') ?? null;
}

// 옷장의 옷을 예약합니다. 올린 사람이 주는 사람, 예약한 내가 받는 사람이 돼요.
export function reserveGarment(state, { garmentId, itemName, ownerName, reserverName }, now = new Date()) {
  if (typeof garmentId !== 'string' || !garmentId) throw new RangeError('예약할 옷을 찾을 수 없어요.');
  if (typeof ownerName !== 'string' || !ownerName.trim()) throw new RangeError('이 옷은 올린 사람이 적혀 있지 않아서 예약할 수 없어요. 옷 정보 수정에서 올린 사람 이름을 먼저 써 주세요.');
  if (getGarmentExchange(state, garmentId)) throw new RangeError('이미 예약되었거나 나눔이 끝난 옷이에요.');
  const owner = ensureUser(state, ownerName);
  const reserver = ensureUser(owner.state, reserverName);
  if (owner.user.id === reserver.user.id) throw new RangeError('내가 올린 옷은 예약할 수 없어요.');
  return createExchange(reserver.state, { giverId: owner.user.id, receiverId: reserver.user.id, itemName, garmentId, status: 'reserved' }, now);
}

function updateExchange(state, next) {
  return { ...state, exchanges: state.exchanges.map((item) => (item.id === next.id ? next : item)) };
}

// 받은 사람이 옷을 직접 받았다고 확인하면 나눔이 끝나고 점수·후기를 쓸 수 있어요.
export function confirmReceived(state, exchangeId, userId, now = new Date()) {
  const exchange = state.exchanges.find((item) => item.id === exchangeId);
  if (!exchange) throw new RangeError('나눔 기록을 찾을 수 없어요.');
  if (userId !== exchange.receiverId) throw new RangeError('옷을 받은 친구만 "받았어요"를 누를 수 있어요.');
  if (exchange.status !== 'reserved') throw new RangeError('예약 중인 나눔만 받았다고 확인할 수 있어요.');
  const next = { ...exchange, status: 'completed', completedAt: new Date(now).toISOString() };
  return { state: updateExchange(state, next), exchange: next };
}

// 만나기 전에는 주는 사람도 받는 사람도 예약을 취소할 수 있어요. 취소하면 옷을 다시 예약할 수 있습니다.
export function cancelReservation(state, exchangeId, userId) {
  const exchange = state.exchanges.find((item) => item.id === exchangeId);
  if (!exchange) throw new RangeError('나눔 기록을 찾을 수 없어요.');
  if (userId !== exchange.giverId && userId !== exchange.receiverId) throw new RangeError('이 나눔에 참여한 친구만 예약을 취소할 수 있어요.');
  if (exchange.status !== 'reserved') throw new RangeError('이미 끝났거나 취소된 나눔은 취소할 수 없어요.');
  const next = { ...exchange, status: 'cancelled' };
  return { state: updateExchange(state, next), exchange: next };
}

// 내가 참여한, 아직 만나지 않은 예약들입니다.
export function getReservations(state, userId) {
  return state.exchanges.filter((item) => item.status === 'reserved' && (item.giverId === userId || item.receiverId === userId));
}

// 받은 사람이 준 사람에게 남기는 후기입니다. 점수가 공개된 뒤에 한 번만 쓸 수 있고, 포인트에는 영향이 없어요.
export function addReview(state, exchangeId, reviewerId, text, now = new Date()) {
  const exchange = state.exchanges.find((item) => item.id === exchangeId);
  if (!exchange) throw new RangeError('나눔 기록을 찾을 수 없어요.');
  if (reviewerId !== exchange.receiverId) throw new RangeError('옷을 받은 친구만 후기를 남길 수 있어요.');
  if (!isRevealed(exchange)) throw new RangeError('두 친구의 점수가 공개된 뒤에 후기를 남길 수 있어요.');
  if (exchange.review) throw new RangeError('이미 후기를 남겼어요. 남긴 후기는 바꿀 수 없어요.');
  const clean = cleanText(text, REVIEW_MAX, '후기 내용');
  const next = { ...exchange, review: { text: clean, createdAt: new Date(now).toISOString() } };
  return { state: { ...state, exchanges: state.exchanges.map((item) => (item.id === exchangeId ? next : item)) }, exchange: next };
}

// 준 사람이 받은 후기를 최신순으로 돌려줍니다.
export function getReviewsFor(state, userId, limit = 5) {
  return state.exchanges
    .filter((item) => item.giverId === userId && item.review)
    .sort((a, b) => b.review.createdAt.localeCompare(a.review.createdAt))
    .slice(0, limit)
    .map((item) => ({ exchangeId: item.id, reviewerId: item.receiverId, itemName: item.itemName, text: item.review.text, createdAt: item.review.createdAt }));
}

// 후기를 아직 못 쓴, 내가 받은 공개된 나눔입니다.
export function getReviewable(state, userId) {
  return state.exchanges.filter((item) => item.receiverId === userId && isRevealed(item) && !item.review);
}

export function isRevealed(exchange) {
  return exchange.revealedAt !== null && exchange.giverToReceiver !== null && exchange.receiverToGiver !== null;
}

// 보는 사람 기준으로 보여도 되는 점수만 돌려줍니다. 공개 전에는 상대 점수를 절대 내보내지 않아요.
export function getRatingView(exchange, viewerId) {
  const revealed = isRevealed(exchange);
  const isGiver = viewerId === exchange.giverId;
  const isReceiver = viewerId === exchange.receiverId;
  const mine = isGiver ? exchange.giverToReceiver : isReceiver ? exchange.receiverToGiver : null;
  const theirsRaw = isGiver ? exchange.receiverToGiver : isReceiver ? exchange.giverToReceiver : null;
  return {
    revealed,
    mine,
    theirs: revealed ? theirsRaw : null,
    canRate: (isGiver || isReceiver) && mine === null,
    waitingForOther: (isGiver || isReceiver) && mine !== null && !revealed
  };
}

// 공개된 나눔에서 두 사람이 얻는 포인트입니다. (상대가 나에게 준 점수)
export function getExchangePoints(exchange) {
  if (!isRevealed(exchange)) return { giver: 0, receiver: 0 };
  return { giver: exchange.receiverToGiver, receiver: exchange.giverToReceiver };
}

function summarize(state, userId, filter) {
  let points = 0; let donations = 0; let receipts = 0; let lastAt = '';
  for (const exchange of state.exchanges) {
    if (!isRevealed(exchange) || !filter(exchange)) continue;
    const earned = getExchangePoints(exchange);
    if (exchange.giverId === userId) { points += earned.giver; donations += 1; }
    else if (exchange.receiverId === userId) { points += earned.receiver; receipts += 1; }
    else continue;
    if (exchange.revealedAt > lastAt) lastAt = exchange.revealedAt;
  }
  return { points, donations, receipts, lastAt };
}

// 한 달의 순위표. 포인트 많은 순 → 같으면 나눔 횟수 많은 순 → 같으면 먼저 그 점수에 이른 순 → 이름순.
export function computeRanking(state, monthKey) {
  const inMonth = (exchange) => getMonthKey(exchange.revealedAt) === monthKey;
  const rows = state.users
    .map((user) => ({ userId: user.id, name: user.name, ...summarize(state, user.id, inMonth) }))
    .filter((row) => row.donations + row.receipts > 0);
  rows.sort((a, b) => b.points - a.points
    || (b.donations + b.receipts) - (a.donations + a.receipts)
    || a.lastAt.localeCompare(b.lastAt)
    || a.name.localeCompare(b.name, 'ko'));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

// 끝난 달의 1·2·3위에게 배지를 한 번만 줍니다. 이미 준 달은 건너뛰어서 몇 번을 불러도 결과가 같아요.
export function finalizeMonths(state, now = new Date()) {
  const current = getMonthKey(now);
  const done = new Set(state.finalizedMonths);
  const months = [...new Set(state.exchanges.filter(isRevealed).map((item) => getMonthKey(item.revealedAt)))]
    .filter((month) => month < current && !done.has(month))
    .sort();
  if (months.length === 0) return state;
  const badges = [...state.badges];
  for (const month of months) {
    for (const row of computeRanking(state, month).filter((item) => BADGE_RANKS.includes(item.rank))) {
      badges.push({ userId: row.userId, month, rank: row.rank });
    }
  }
  return { ...state, badges, finalizedMonths: [...state.finalizedMonths, ...months].sort() };
}

export function getProfile(state, userId, now = new Date()) {
  const user = findUser(state, userId);
  const month = getMonthKey(now);
  const ranking = computeRanking(state, month);
  const mine = ranking.find((row) => row.userId === userId);
  const total = summarize(state, userId, () => true);
  return {
    user,
    month,
    monthPoints: mine ? mine.points : 0,
    monthRank: mine ? mine.rank : null,
    donations: total.donations,
    receipts: total.receipts,
    badges: state.badges.filter((badge) => badge.userId === userId).sort((a, b) => b.month.localeCompare(a.month) || a.rank - b.rank)
  };
}

export function getPendingExchanges(state, userId) {
  return state.exchanges
    .filter((exchange) => exchange.status === 'completed' && !isRevealed(exchange) && (exchange.giverId === userId || exchange.receiverId === userId))
    .map((exchange) => ({ exchange, view: getRatingView(exchange, userId) }));
}

export function getRecentRevealed(state, limit = 5) {
  return state.exchanges.filter(isRevealed).sort((a, b) => b.revealedAt.localeCompare(a.revealedAt)).slice(0, limit);
}
