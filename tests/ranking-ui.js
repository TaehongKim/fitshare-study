import { renderRanking } from '../modules/ranking.js';
import { openGarmentDetail } from '../modules/garmentDetail.js';

// 실제 랭킹 화면과 옷 상세 창을 그려 보고 클릭·입력으로 흐름을 확인합니다.
// server.py 로 열어야 서버 저장까지 확인돼요. (이 시험은 저장된 랭킹 기록을 지우고 시작해요.)
const checks = [];
async function check(name, action) {
  try { await action(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

// 로그인해야 나눔 기록을 저장할 수 있어요. 시험용 계정을 하나 만들어 로그인해 둡니다.
const username = `t${Date.now() % 100000000}`;
await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password: 'test-pass-1', name: `시험${Date.now() % 100000}` }) }).catch(() => {});

// 서버 기록을 비웁니다.
const head = await fetch('/api/ranking').then((r) => r.json()).catch(() => ({ rev: 0 }));
await fetch('/api/ranking', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ baseRev: head.rev ?? 0, state: { version: 1, users: [], exchanges: [], badges: [], finalizedMonths: [] } }) }).catch(() => {});
for (const key of ['fitshare.ranking.v1', 'fitshare.ranking.viewer', 'fitshare.ranking.viewerName', 'fitshare.ranking.rev']) localStorage.removeItem(key);

const root = document.createElement('div');
document.body.append(root);
const $ = (selector) => root.querySelector(selector);
const text = () => root.textContent;
// 점수 고르는 목록(1점~10점 옵션)은 빼고, 화면에 '보이는 결과'만 검사할 때 씁니다.
const visibleText = () => { const copy = root.cloneNode(true); copy.querySelectorAll('select').forEach((el) => el.remove()); return copy.textContent; };
const submit = (form) => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
async function viewAs(name) { localStorage.setItem('fitshare.ranking.viewerName', name); renderRanking(root); await settle(); }
async function sendScore(score) { const form = $('.rk-rate'); form.querySelector('select').value = String(score); submit(form); await settle(); }
// 옷장에서 옷을 눌러 예약하는 것과 같아요.
async function reserveAs(name, garment) {
  localStorage.setItem('fitshare.ranking.viewerName', name); // 로그인한 이름
  openGarmentDetail(garment);
  const dialog = [...document.querySelectorAll('dialog.garment-detail')].at(-1);
  await settle();
  dialog.querySelector('.primary-action').click();
  await settle(500);
  const result = { status: dialog.querySelector('.garment-detail-status').textContent, message: dialog.querySelector('.garment-detail-message').textContent, disabled: dialog.querySelector('.primary-action').disabled, error: dialog.querySelector('.garment-detail-message').classList.contains('is-error') };
  dialog.close();
  return result;
}
const jacket = { id: 'g1', name: '파란 점퍼', garmentTypeName: '점퍼', gender: 'unisex', colorName: '파랑', lengthCm: 60, widthCm: 50, ownerName: '지수' };

await check('처음에는 안내가 보이고 오류 없이 그려져요', async () => {
  renderRanking(root); await settle();
  assert(text().includes('첫 화면에서 로그인'), '로그인 안내가 없어요.');
  assert(text().includes('이번 달에 공개된 점수가 아직 없어요'), '빈 순위 안내가 없어요.');
  assert(!text().includes('하늘') && !text().includes('체험용'), '가짜 친구나 체험 버튼이 있으면 안 돼요.');
});
await check('로그인한 이름으로 내 페이지가 맨 위에 자동으로 떠요', async () => {
  await viewAs('민수');
  assert($('#rk-account').textContent.includes('민수 님으로 로그인'), '내 계정 안내');
  assert($('#rk-profile-title').textContent.includes('내 페이지'), '내 페이지 제목');
  assert($('#rk-profile').textContent.includes('민수'), '내 이름이 친구 목록에 자동으로 들어가요.');
  assert(root.querySelector('.rk-mypage') === root.querySelector('.ranking-panel').children[2], '내 페이지가 맨 위에 있어야 해요.');
});
await check('옷 상세 창: 정보가 보이고 예약하면 예약 중으로 바뀌어요', async () => {
  const result = await reserveAs('민수', jacket);
  assert(result.status.includes('민수') && result.status.includes('예약 중'), `예약 상태: ${result.status}`);
  assert(result.disabled, '예약하면 버튼이 꺼져야 해요.');
  openGarmentDetail(jacket); await settle();
  const dialog = [...document.querySelectorAll('dialog.garment-detail')].at(-1);
  assert(dialog.textContent.includes('파란 점퍼') && dialog.textContent.includes('지수') && dialog.textContent.includes('60cm'), '상세 정보');
  assert(dialog.querySelector('.primary-action').disabled, '이미 예약된 옷은 다시 예약할 수 없어요.');
  dialog.close();
});
await check('오류: 내가 올린 옷과 올린 사람이 없는 옷은 예약할 수 없어요', async () => {
  const own = await reserveAs('지수', { ...jacket, id: 'g2' });
  assert(own.error && own.message.includes('내가 올린 옷'), `내 옷: ${own.message}`);
  const nobody = await reserveAs('민수', { ...jacket, id: 'g3', ownerName: '' });
  assert(nobody.status.includes('예약할 수 없어요') && nobody.disabled, '올린 사람 없음');
});
await check('예약한 나눔은 ②에 보이고, 받았다고 확인하기 전에는 점수를 줄 수 없어요', async () => {
  renderRanking(root); await settle();
  assert($('#rk-reservations').textContent.includes('파란 점퍼') && $('#rk-reservations [data-confirm]'), '② 예약 목록과 받았어요 버튼');
  assert(!$('.rk-rate'), '받기 전에는 점수 칸이 없어야 해요.');
});
await check('정상: 받았어요 → 서로 점수 → 둘 다 보낸 뒤에야 공개돼요', async () => {
  $('#rk-reservations [data-confirm]').click(); await settle();
  assert($('.rk-rate'), '확인하면 점수 칸이 생겨야 해요.');
  await sendScore(8);
  assert(text().includes('내 점수 8점을 보냈어요'), '보낸 뒤 안내');
  await viewAs('지수'); // 준 사람
  assert(!visibleText().includes('8점') && !visibleText().includes('+8'), '공개 전 상대 점수 8점이 보이면 안 돼요.');
  assert($('.rk-rate'), '준 사람도 받은 사람에게 점수를 줄 수 있어요.');
  await sendScore(6);
  assert(text().includes('민수 +6점') && text().includes('지수 +8점'), '공개된 점수 목록');
  const rows = [...root.querySelectorAll('.rk-rank')];
  assert(rows.length === 2 && rows[0].textContent.includes('지수') && rows[0].textContent.includes('8점'), '1위는 지수 8점');
  assert($('#rk-profile').textContent.includes('내가 민수에게 준 점수 6점') && $('#rk-profile').textContent.includes('민수가 나에게 준 점수 8점'), '내 나눔 내역에 양쪽 점수');
});
await check('후기: 받은 사람만 쓰고, 준 사람 페이지에 글자 그대로 보여요', async () => {
  assert(!$('.rk-review-form'), '준 사람에게는 후기 칸이 없어야 해요.');
  await viewAs('민수');
  const form = $('.rk-review-form'); assert(form, '받은 사람에게 후기 칸이 보여야 해요.');
  form.querySelector('input').value = '   '; submit(form); await settle();
  assert($('#rk-message').classList.contains('is-error') && $('#rk-message').textContent.includes('후기 내용을 입력'), '빈 후기 거부');
  $('.rk-review-form input').value = '<i>깨끗해요</i>'; submit($('.rk-review-form')); await settle();
  assert(!$('.rk-review-form'), '한 번 쓰면 후기 칸이 사라져요.');
  [...root.querySelectorAll('[data-profile]')].find((b) => b.textContent === '지수').click();
  assert($('.rk-reviews').textContent.includes('<i>깨끗해요</i>') && !$('.rk-reviews i'), '후기가 글자 그대로 보여야 해요.');
  assert(text().includes('내 페이지로 돌아가기'), '내 페이지로 돌아가는 버튼');
});
await check('서버 저장: 다른 기기(새 화면)에서도 같은 기록이 보여요', async () => {
  const server = await fetch('/api/ranking').then((r) => r.json());
  assert(server.rev > 0 && server.state.exchanges.length === 1, '서버에 기록이 있어야 해요.');
  for (const key of ['fitshare.ranking.v1', 'fitshare.ranking.rev']) localStorage.removeItem(key); // 다른 기기처럼 비어 있는 브라우저
  renderRanking(root); await settle(500);
  assert(root.querySelectorAll('.rk-rank').length === 2, '서버 기록으로 순위가 그려져야 해요.');
});
await check('취소: 예약을 취소하면 같은 옷을 다시 예약할 수 있어요', async () => {
  await reserveAs('하준', { ...jacket, id: 'g4', name: '검정 바지' });
  await viewAs('하준');
  $('#rk-reservations [data-cancel]').click(); await settle();
  assert($('#rk-reservations').textContent.includes('예약한 나눔이 없어요'), '취소 뒤 목록이 비어야 해요.');
  const again = await reserveAs('민수', { ...jacket, id: 'g4', name: '검정 바지' });
  assert(again.status.includes('민수'), '다시 예약할 수 있어야 해요.');
});
await check('안전: 이름에 HTML을 넣어도 글자로만 보이고, 망가진 저장값에서도 그려져요', async () => {
  await viewAs('<b>x</b>');
  assert(!root.querySelector('#rk-profile b'), '태그가 해석되면 안 돼요.');
  localStorage.setItem('fitshare.ranking.v1', '{깨진 json');
  const box = document.createElement('div'); document.body.append(box);
  localStorage.removeItem('fitshare.ranking.viewerName');
  renderRanking(box); await settle();
  assert(box.textContent.length > 0, '화면이 그려져야 해요.');
});

await check('로그아웃하면 나눔 기록을 저장할 수 없어요', async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const state = { version: 1, users: [], exchanges: [], badges: [], finalizedMonths: [] };
  const response = await fetch('/api/ranking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev: 0, state }) });
  assert(response.status === 401, `로그인 없이 저장하면 401 이어야 해요: ${response.status}`);
  await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'test-pass-1' }) });
});

const reset = await fetch('/api/ranking').then((r) => r.json()).catch(() => null);
if (reset) await fetch('/api/ranking', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ baseRev: reset.rev, state: { version: 1, users: [], exchanges: [], badges: [], finalizedMonths: [] } }) }).catch(() => {});
for (const key of ['fitshare.ranking.v1', 'fitshare.ranking.viewer', 'fitshare.ranking.viewerName', 'fitshare.ranking.rev']) localStorage.removeItem(key);
document.querySelector('#results').innerHTML = checks.map((item) => `<li style="color:${item.passed ? 'green' : 'red'}">${item.passed ? '통과' : '실패'}: ${item.name}${item.error ? ` — ${item.error}` : ''}</li>`).join('');
document.title = `${checks.filter((c) => c.passed).length}/${checks.length} 통과`;
