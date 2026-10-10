"""아이디·비밀번호 계정과 로그인 기록(세션)을 파일에 저장합니다. 파이썬 표준 라이브러리만 씁니다.

- 비밀번호는 그대로 저장하지 않고, 사람마다 다른 salt 를 섞어 PBKDF2-SHA256 으로 한 번 더 섞은 값만 저장해요.
- 로그인 표(토큰)도 그대로 저장하지 않고 SHA-256 값만 저장해서, 파일이 새어도 바로 쓸 수 없어요.
- 같은 아이디로 비밀번호를 5번 틀리면 1분 동안 로그인을 막아요.
"""
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
from pathlib import Path

USERNAME_PATTERN = re.compile(r'^[a-z0-9_]{3,20}$')
NICKNAME_MAX = 10
PASSWORD_MIN = 6
PASSWORD_MAX = 64
MAX_ACCOUNTS = 1000
ITERATIONS = 200_000
SESSION_SECONDS = 30 * 24 * 60 * 60
LOCK_AFTER_FAILS = 5
LOCK_SECONDS = 60


class AuthError(ValueError):
    """사용자에게 그대로 보여 줘도 되는 안내 문구를 담은 오류입니다."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _hash_password(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, ITERATIONS).hex()


def _token_key(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _read(path, default):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        return value if isinstance(value, type(default)) else default
    except (OSError, json.JSONDecodeError):
        return default


def _write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


class AccountStore:
    def __init__(self, directory, clock=time.time):
        self.accounts_path = Path(directory) / 'accounts.json'
        self.sessions_path = Path(directory) / 'sessions.json'
        self.clock = clock
        self.lock = threading.Lock()
        self.failures = {}  # 아이디 -> (틀린 횟수, 막힌 시각)

    def clean_username(self, username):
        value = username.strip().lower() if isinstance(username, str) else ''
        if not USERNAME_PATTERN.match(value):
            raise AuthError('아이디는 영어 소문자, 숫자, _ 로 3~20글자로 만들어 주세요.')
        return value

    def clean_nickname(self, nickname):
        value = re.sub(r'\s+', ' ', nickname).strip() if isinstance(nickname, str) else ''
        if not value:
            raise AuthError('이름(별명)을 입력해 주세요.')
        if len(value) > NICKNAME_MAX:
            raise AuthError(f'이름(별명)은 {NICKNAME_MAX}글자까지 쓸 수 있어요.')
        return value

    def signup(self, username, password, nickname):
        username = self.clean_username(username)
        nickname = self.clean_nickname(nickname)
        if not isinstance(password, str) or not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
            raise AuthError(f'비밀번호는 {PASSWORD_MIN}~{PASSWORD_MAX}글자로 만들어 주세요.')
        if password.lower() == username:
            raise AuthError('비밀번호를 아이디와 다르게 만들어 주세요.')
        salt = secrets.token_bytes(16)
        password_hash = _hash_password(password, salt)
        with self.lock:
            accounts = _read(self.accounts_path, {})
            if username in accounts:
                raise AuthError('이미 있는 아이디예요. 다른 아이디를 써 주세요.', 409)
            if any(item.get('name', '').lower() == nickname.lower() for item in accounts.values()):
                raise AuthError('이미 있는 이름(별명)이에요. 다른 이름을 써 주세요.', 409)
            if len(accounts) >= MAX_ACCOUNTS:
                raise AuthError('가입할 수 있는 사람 수가 가득 찼어요.', 409)
            accounts[username] = {'name': nickname, 'salt': salt.hex(), 'hash': password_hash, 'createdAt': int(self.clock())}
            _write(self.accounts_path, accounts)
        return {'username': username, 'name': nickname}

    def login(self, username, password):
        # 틀린 이유(아이디/비밀번호)를 알려 주지 않아서 아이디 존재 여부를 추측하기 어렵게 해요.
        wrong = AuthError('아이디 또는 비밀번호가 맞지 않아요.', 401)
        username = username.strip().lower() if isinstance(username, str) else ''
        if not isinstance(password, str) or len(password) > PASSWORD_MAX:
            raise wrong
        now = self.clock()
        with self.lock:
            locked_until = self.failures.get(username, (0, 0))[1]
            if locked_until > now:
                raise AuthError('비밀번호를 여러 번 틀렸어요. 1분 뒤에 다시 해 보세요.', 429)
            account = _read(self.accounts_path, {}).get(username)
        salt = bytes.fromhex(account['salt']) if account else b'\0' * 16
        candidate = _hash_password(password, salt)
        ok = bool(account) and hmac.compare_digest(candidate, account['hash'])
        with self.lock:
            if not ok:
                fails = self.failures.get(username, (0, 0))[0] + 1
                self.failures[username] = (0, now + LOCK_SECONDS) if fails >= LOCK_AFTER_FAILS else (fails, 0)
                raise wrong
            self.failures.pop(username, None)
        return {'username': username, 'name': account['name']}

    def create_session(self, username):
        token = secrets.token_urlsafe(32)
        now = self.clock()
        with self.lock:
            sessions = {key: item for key, item in _read(self.sessions_path, {}).items() if item.get('expires', 0) > now}
            sessions[_token_key(token)] = {'username': username, 'expires': now + SESSION_SECONDS}
            _write(self.sessions_path, sessions)
        return token

    def user_for_token(self, token):
        if not isinstance(token, str) or not token:
            return None
        with self.lock:
            session = _read(self.sessions_path, {}).get(_token_key(token))
            if not session or session.get('expires', 0) <= self.clock():
                return None
            account = _read(self.accounts_path, {}).get(session.get('username'))
        return {'username': session['username'], 'name': account['name']} if account else None

    def destroy_session(self, token):
        if not isinstance(token, str) or not token:
            return
        with self.lock:
            sessions = _read(self.sessions_path, {})
            if sessions.pop(_token_key(token), None) is not None:
                _write(self.sessions_path, sessions)
