"""Generate a clean reference image for a garment using Replicate's HTTP API."""

import json
import re
import time
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


API_ROOT = 'https://api.replicate.com/v1'
MODEL_SLUG = 'qwen/qwen-image-edit-plus'
MAX_IMAGE_BYTES = 12 * 1024 * 1024
SAFE_ID = re.compile(r'^[A-Za-z0-9_.-]{1,160}$')


class ProductPhotoError(RuntimeError):
    pass


def _call(url, token, data=None, headers=None, method=None, opener=urlopen, timeout=90):
    request = Request(url, data=data, headers={
        'Authorization': f'Bearer {token}', 'Accept': 'application/json', **(headers or {})
    }, method=method)
    try:
        with opener(request, timeout=timeout) as response:
            return response.status, response.headers, response.read()
    except HTTPError as error:
        raise ProductPhotoError(f'이미지 서비스가 HTTP {error.code} 응답을 보냈어요.') from None
    except (URLError, TimeoutError, OSError):
        raise ProductPhotoError('이미지 서비스에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.') from None


def _json(url, token, payload=None, headers=None, method=None, opener=urlopen, timeout=90):
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    extra = {'Content-Type': 'application/json'} if data is not None else {}
    _, _, raw = _call(url, token, data, {**extra, **(headers or {})}, method, opener, timeout)
    try:
        return json.loads(raw.decode('utf-8')) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ProductPhotoError('이미지 서비스 응답을 읽지 못했어요.') from None


def _upload(source, token, opener):
    if not isinstance(source, bytes) or not source or len(source) > MAX_IMAGE_BYTES:
        raise ProductPhotoError('옷 사진 크기를 확인해 주세요.')
    content_type = 'image/png' if source.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg'
    boundary = f'FitShare{uuid.uuid4().hex}'
    filename = 'garment.png' if content_type == 'image/png' else 'garment.jpg'
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="content"; filename="{filename}"\r\n'
            f'Content-Type: {content_type}\r\n\r\n').encode() + source + f'\r\n--{boundary}--\r\n'.encode()
    _, _, raw = _call(f'{API_ROOT}/files', token, body,
                      {'Content-Type': f'multipart/form-data; boundary={boundary}'}, 'POST', opener)
    try:
        result = json.loads(raw.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ProductPhotoError('이미지 업로드 응답을 읽지 못했어요.') from None
    file_id, file_url = result.get('id'), (result.get('urls') or {}).get('get')
    parsed = urlsplit(file_url or '')
    if not isinstance(file_id, str) or not SAFE_ID.fullmatch(file_id) or parsed.scheme != 'https' or parsed.netloc != 'api.replicate.com':
        raise ProductPhotoError('업로드한 사진 주소를 확인하지 못했어요.')
    return file_id, file_url


def _image_result(prediction, opener):
    output = prediction.get('output')
    if isinstance(output, list):
        output = next((value for value in reversed(output) if isinstance(value, str)), None)
    if not isinstance(output, str):
        raise ProductPhotoError('이미지 서비스가 사진 결과를 보내지 않았어요.')
    parsed = urlsplit(output)
    if parsed.scheme != 'https' or not parsed.hostname or not (
            parsed.hostname == 'replicate.delivery' or parsed.hostname.endswith('.replicate.delivery')):
        raise ProductPhotoError('생성된 사진 주소가 안전하지 않아요.')
    try:
        with opener(Request(output, headers={'Accept': 'image/*'}), timeout=90) as response:
            content_type = response.headers.get_content_type()
            body = response.read(MAX_IMAGE_BYTES + 1)
    except (HTTPError, URLError, TimeoutError, OSError):
        raise ProductPhotoError('생성된 사진을 내려받지 못했어요.') from None
    valid_signature = (body.startswith(b'\x89PNG\r\n\x1a\n') or body.startswith(b'\xff\xd8\xff')
                       or (len(body) >= 12 and body[:4] == b'RIFF' and body[8:12] == b'WEBP'))
    if not content_type.startswith('image/') or not valid_signature or len(body) > MAX_IMAGE_BYTES:
        raise ProductPhotoError('이미지 서비스 결과가 올바른 사진 파일이 아니에요.')
    return body, content_type


def generate_product_photo(source_bytes, prompt, token, model_version, opener=urlopen, sleep=time.sleep):
    if not isinstance(token, str) or not token.strip() or not isinstance(model_version, str) or not model_version.strip():
        raise ProductPhotoError('이미지 서비스 토큰과 모델 버전을 서버에 설정해 주세요.')
    if not isinstance(prompt, str) or not prompt.strip():
        raise ProductPhotoError('사진 편집 안내를 확인해 주세요.')
    file_id = None
    try:
        file_id, file_url = _upload(source_bytes, token, opener)
        result = _json(f'{API_ROOT}/models/{MODEL_SLUG}/predictions', token,
                       {'version': model_version, 'input': {'image': [file_url], 'prompt': prompt}},
                       {'Prefer': 'wait=60', 'Cancel-After': '300s'}, 'POST', opener, timeout=75)
        deadline = time.monotonic() + 300
        while result.get('status') in {'starting', 'processing', 'queued'}:
            poll_url = (result.get('urls') or {}).get('get')
            parsed = urlsplit(poll_url or '')
            if parsed.scheme != 'https' or parsed.netloc != 'api.replicate.com':
                raise ProductPhotoError('이미지 작업 주소를 확인하지 못했어요.')
            if time.monotonic() >= deadline:
                raise ProductPhotoError('이미지 생성이 제한 시간 안에 끝나지 않았어요.')
            sleep(2)
            result = _json(poll_url, token, opener=opener, timeout=30)
        if result.get('status') != 'succeeded':
            raise ProductPhotoError('이미지 생성이 완료되지 않았어요. 원본 사진은 그대로 보존했어요.')
        return _image_result(result, opener)
    finally:
        if file_id:
            try:
                _call(f'{API_ROOT}/files/{file_id}', token, headers={}, method='DELETE', opener=opener, timeout=30)
            except ProductPhotoError:
                pass
