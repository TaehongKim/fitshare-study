// 첫 화면(index.html)을 iframe 으로 열어 로그인 흐름을 눌러 보며 확인합니다. (시험용 계정이 서버에 하나 만들어져요.)
const checks = [];
async function check(name, action) {
  try { await action(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.message }); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
const frame = document.querySelector('#app');
frame.src = '../index.html?t=' + Date.now();
await new Promise((resolve) => { frame.onload = resolve; });
await settle(600);
const doc = () => frame.contentDocument;
const $ = (selector) => doc().querySelector(selector);
const username = `a${Date.now() % 1000000}`;
const nickname = `별${Date.now() % 1000}`;
function fill(user, password, name) {
  $('#auth-username').value = user; $('#auth-password').value = password;
  if (name !== undefined) $('#auth-name').value = name;
}
async function send() { $('#auth-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await settle(700); }

await check('처음에는 로그인 화면만 보이고 옷장·기능 탭은 숨겨져요', () => {
  assert(!$('#auth-panel').hidden, '로그인 화면이 보여야 해요.');
  assert($('#app-main').hidden, '로그인 전에는 본문이 숨겨져야 해요.');
  assert($('#user-box').hidden, '로그인 전에는 사용자 칸이 없어야 해요.');
});
await check('오류: 없는 계정과 틀린 입력은 이해하기 쉬운 문구로 거부해요', async () => {
  fill('nobody1', 'whatever1'); await send();
  assert($('#auth-message').classList.contains('is-error') && $('#auth-message').textContent.includes('아이디 또는 비밀번호'), $('#auth-message').textContent);
  $('#auth-tab-signup').click();
  assert(!$('#auth-name-row').hidden, '회원가입에는 이름 칸이 보여야 해요.');
  fill('AB', 'secret123', nickname); await send();
  assert($('#auth-message').textContent.includes('아이디는'), '아이디 규칙 문구');
  fill(username, '123', nickname); await send();
  assert($('#auth-message').textContent.includes('비밀번호는'), '비밀번호 규칙 문구');
  assert(!$('#auth-panel').hidden, '실패하면 계속 로그인 화면이어야 해요.');
});
await check('정상: 회원가입하면 바로 들어가고 헤더에 내 이름이 보여요', async () => {
  fill(username, 'secret123', nickname); await send();
  assert($('#auth-panel').hidden && !$('#app-main').hidden, '본문이 보여야 해요.');
  assert($('#user-name').textContent.includes(nickname), '내 이름 표시');
  assert(localStorage.getItem('fitshare.ranking.viewerName') === nickname, '랭킹이 쓰는 내 이름이 맞춰져야 해요.');
});
await check('경계: 새로고침해도 로그인이 유지돼요', async () => {
  frame.contentWindow.location.reload(); await new Promise((resolve) => { frame.onload = resolve; }); await settle(700);
  assert($('#auth-panel').hidden && $('#user-name').textContent.includes(nickname), '로그인 유지');
});
await check('로그아웃하면 다시 로그인 화면으로 돌아가요', async () => {
  $('#logout-button').click(); await settle(700);
  assert(!$('#auth-panel').hidden && $('#app-main').hidden, '로그인 화면');
  assert(localStorage.getItem('fitshare.ranking.viewerName') === '', '내 이름이 지워져야 해요.');
});
await check('정상: 같은 아이디와 비밀번호로 다시 로그인하고, 같은 이름은 가입할 수 없어요', async () => {
  fill(username.toUpperCase(), 'secret123'); await send();
  assert($('#auth-panel').hidden && $('#user-name').textContent.includes(nickname), '다시 로그인');
  $('#logout-button').click(); await settle(700);
  $('#auth-tab-signup').click();
  fill(`b${Date.now() % 1000000}`, 'secret123', nickname); await send();
  assert($('#auth-message').textContent.includes('이미 있는 이름'), $('#auth-message').textContent);
});

await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
document.querySelector('#results').innerHTML = checks.map((item) => `<li style="color:${item.passed ? 'green' : 'red'}">${item.passed ? '통과' : '실패'}: ${item.name}${item.error ? ` — ${item.error}` : ''}</li>`).join('');
document.title = `${checks.filter((c) => c.passed).length}/${checks.length} 통과`;
