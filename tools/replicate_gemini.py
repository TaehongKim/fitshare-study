"""Measure the sample dataset with Gemini through Replicate's HTTP API."""

import json
import math
import os
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from tools.measure_dataset import BACKGROUND_BY_PREFIX, read_dataset_label


MODEL_ID = 'google/gemini-2.5-flash'
REPLICATE_ROOT = 'https://api.replicate.com/v1'
MAX_IMAGE_BYTES = 7 * 1024 * 1024
SAFE_FILE_ID = re.compile(r'^[A-Za-z0-9_.-]{1,160}$')


class ReplicateAPIError(RuntimeError):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def _request(url, token, data=None, headers=None, method=None, timeout=90):
    request_headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json',
        **(headers or {}),
    }
    request = Request(url, data=data, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except HTTPError as error:
        # Replicate error bodies can include request details; don't send them to the page or log.
        raise ReplicateAPIError(f'Replicate API 요청이 HTTP {error.code} 응답을 보냈어요.', error.code) from None
    except (URLError, TimeoutError, OSError):
        raise ReplicateAPIError('Replicate 서버와 연결하지 못했어요. 인터넷 연결을 확인해 주세요.') from None


def _request_json(url, token, payload=None, headers=None, method=None, timeout=90):
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode('utf-8')
    json_headers = {'Content-Type': 'application/json'} if body is not None else {}
    status, raw = _request(url, token, body, {**json_headers, **(headers or {})}, method, timeout)
    if status == 204 or not raw:
        return {}
    try:
        return json.loads(raw.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ReplicateAPIError('Replicate 응답을 읽지 못했어요.') from None


def upload_replicate_file(image_path, token):
    image_path = Path(image_path)
    image = image_path.read_bytes()
    if not image or len(image) > MAX_IMAGE_BYTES:
        raise ValueError('사진 크기는 1바이트보다 크고 7MB 이하여야 해요.')
    boundary = f'FitShare{uuid.uuid4().hex}'
    body = (
        f'--{boundary}\r\n'
        'Content-Disposition: form-data; name="content"; filename="garment-image.jpg"\r\n'
        'Content-Type: image/jpeg\r\n\r\n'
    ).encode('ascii') + image + f'\r\n--{boundary}--\r\n'.encode('ascii')
    status, raw = _request(
        f'{REPLICATE_ROOT}/files', token, body,
        {'Content-Type': f'multipart/form-data; boundary={boundary}'}, method='POST'
    )
    if status < 200 or status >= 300:
        raise ReplicateAPIError(f'Replicate 사진 업로드가 HTTP {status} 응답을 보냈어요.', status)
    try:
        result = json.loads(raw.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ReplicateAPIError('Replicate 사진 업로드 응답을 읽지 못했어요.') from None
    file_id = result.get('id')
    file_url = (result.get('urls') or {}).get('get')
    parsed_url = urlsplit(file_url or '')
    if (not isinstance(file_id, str) or not SAFE_FILE_ID.fullmatch(file_id)
            or parsed_url.scheme != 'https' or parsed_url.netloc != 'api.replicate.com'):
        raise ReplicateAPIError('Replicate에 사진을 올렸지만 파일 주소를 확인하지 못했어요.')
    return file_id, file_url


def delete_replicate_file(file_id, token):
    if not isinstance(file_id, str) or not SAFE_FILE_ID.fullmatch(file_id):
        return
    _request(
        f'{REPLICATE_ROOT}/files/{file_id}', token,
        headers={}, method='DELETE'
    )


def _prediction_text(prediction):
    output = prediction.get('output')
    if isinstance(output, list):
        output = ''.join(item for item in output if isinstance(item, str))
    if not isinstance(output, str):
        raise ValueError('Gemini가 숫자가 들어 있는 결과를 보내지 않았어요.')
    return output


def create_gemini_prediction(file_url, prompt, token):
    result = _request_json(
        f'{REPLICATE_ROOT}/models/google/gemini-2.5-flash/predictions', token,
        {'input': {
            'prompt': prompt,
            'images': [file_url],
            'temperature': 0,
            'max_output_tokens': 256,
            'thinking_budget': 0,
            'dynamic_thinking': False,
        }},
        {'Prefer': 'wait=60', 'Cancel-After': '180s'}, method='POST', timeout=75
    )
    deadline = time.monotonic() + 120
    while result.get('status') in {'starting', 'processing', 'queued'}:
        prediction_url = (result.get('urls') or {}).get('get')
        parsed_url = urlsplit(prediction_url or '')
        if parsed_url.scheme != 'https' or parsed_url.netloc != 'api.replicate.com':
            raise ReplicateAPIError('Gemini 작업 주소를 확인하지 못했어요.')
        if time.monotonic() >= deadline:
            raise ReplicateAPIError('Gemini가 제한 시간 안에 답하지 않았어요.')
        time.sleep(2)
        result = _request_json(prediction_url, token, timeout=30)
    if result.get('status') != 'succeeded':
        raise ReplicateAPIError('Gemini가 이 사진의 측정을 끝내지 못했어요.')
    return _prediction_text(result)


BACKGROUND_SCALES = {
    'point': '점 중심 사이의 간격은 10cm예요.',
    'cross': '격자 한 칸의 간격은 5cm예요.',
    'ChArUco': 'ChArUco 한 칸은 2.5cm이고, 검은 표식 한 변은 1.875cm예요.',
    'ChaArUco_Cross': '네 칸 ChArUco 한 칸은 2.5cm이고, 검은 표식 한 변은 1.875cm예요.',
}


def build_measurement_prompt(label, dimension='both'):
    background = label.get('backgroundId')
    scale_note = BACKGROUND_SCALES.get(background)
    if not scale_note:
        raise ValueError('지원하지 않는 배경 사진이에요.')
    width_name = '허리 너비' if label.get('widthKind') == 'waist' else '가슴 너비'
    if dimension not in {'both', 'width', 'length'}:
        raise ValueError('측정할 방향을 확인해 주세요.')
    if dimension == 'width':
        return (
            '사진의 옷에서 가로 치수 하나만 cm로 재. ' + scale_note + f' {width_name}를 재. '
            f'옷 종류는 {label.get("garmentName", "옷")}야. 사진 속 격자와 표식을 자처럼 이용해. '
            '기준 치수나 파일 이름은 알려주지 않았어. 다른 설명 없이 JSON 한 줄만 답해: '
            '{"width_cm": 42.0}. 확실히 읽지 못하면 값은 null로 적어.'
        )
    if dimension == 'length':
        return (
            '사진의 옷에서 세로 방향 전체 기장 하나만 cm로 재. ' + scale_note + f' {width_name}는 재지 마. '
            f'옷 종류는 {label.get("garmentName", "옷")}야. 사진 속 격자와 표식을 자처럼 이용해. '
            '기준 치수나 파일 이름은 알려주지 않았어. 다른 설명 없이 JSON 한 줄만 답해: '
            '{"length_cm": 90.0}. 확실히 읽지 못하면 값은 null로 적어.'
        )
    return (
        '너는 옷 사진의 길이를 어림하는 실험 도우미야. 사진 속 A0 매트의 인쇄 간격을 자처럼 이용해 cm를 계산해. '
        'A0 종이 크기는 가로 84.1cm, 세로 118.9cm야. ' + scale_note + '\n'
        f"옷 종류는 {label.get('garmentName', '옷')}야. 너비는 {width_name}를 재고, 세로 방향 전체 기장을 재. "
        '사진이 비스듬하면 매트 모양을 보고 정면처럼 생각해. 기준 간격이 분명하지 않으면 숫자를 지어내지 말고 null로 적어. '
        '파일 이름이나 기준 정답은 제공하지 않았어. 설명이나 마크다운 없이 JSON 한 줄만 답해: '
        '{"width_cm": 42.0, "length_cm": 90.0}. '
        'width_cm은 가슴 또는 허리 너비, length_cm은 기장이야. 숫자를 확실히 읽지 못하면 두 값 모두 null로 적어.'
    )


def _json_object(text):
    if isinstance(text, list):
        text = ''.join(item for item in text if isinstance(item, str))
    if not isinstance(text, str):
        raise ValueError('Gemini 응답에 측정 숫자가 없어요.')
    cleaned = text.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\s*|\s*```$', '', cleaned, flags=re.IGNORECASE)
    start, end = cleaned.find('{'), cleaned.rfind('}')
    if start < 0 or end <= start:
        raise ValueError('Gemini 응답에서 JSON 측정값을 찾지 못했어요.')
    try:
        result = json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError:
        raise ValueError('Gemini가 읽을 수 있는 JSON 측정값을 보내지 않았어요.') from None
    if not isinstance(result, dict):
        raise ValueError('Gemini 측정값 모양이 올바르지 않아요.')
    return result


def parse_measurement_output(text, required_fields=('width', 'length')):
    try:
        value = _json_object(text)
    except ValueError:
        # 스트리밍 결과가 끝에서 잘려도 두 숫자가 온전히 있으면 측정값은 읽어요.
        number = r'(-?(?:\d+(?:\.\d*)?|\.\d+))'
        width_match = re.search(r'["\']width_cm["\']\s*:\s*' + number, text, re.IGNORECASE)
        length_match = re.search(r'["\']length_cm["\']\s*:\s*' + number, text, re.IGNORECASE)
        if len(required_fields) == 1:
            single_value = re.search(r'(?<![A-Za-z0-9_])(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:cm)?', text, re.IGNORECASE)
            if single_value:
                key = 'width_cm' if required_fields[0] == 'width' else 'length_cm'
                value = {key: float(single_value.group(1))}
            else:
                raise
        elif ('width' in required_fields and not width_match) or ('length' in required_fields and not length_match):
            raise
        else:
            value = {
                'width_cm': float(width_match.group(1)) if width_match else None,
                'length_cm': float(length_match.group(1)) if length_match else None,
            }
    width = value.get('width_cm', value.get('widthCm'))
    length = value.get('length_cm', value.get('lengthCm'))
    confidence = value.get('confidence')
    invalid_width = width is not None and (
        isinstance(width, bool) or not isinstance(width, (int, float))
        or not math.isfinite(width) or not (5 <= width <= 200)
    )
    invalid_length = length is not None and (
        isinstance(length, bool) or not isinstance(length, (int, float))
        or not math.isfinite(length) or not (15 <= length <= 300)
    )
    if invalid_width or invalid_length or (width is None and 'width' in required_fields) or (length is None and 'length' in required_fields):
        raise ValueError('Gemini 측정값이 옷 크기 범위(너비 5~200cm, 기장 15~300cm)에 맞지 않아요.')
    if confidence is not None and (
            isinstance(confidence, bool) or not isinstance(confidence, (int, float))
            or not math.isfinite(confidence) or not (0 <= confidence <= 1)):
        confidence = None
    note = value.get('note') if isinstance(value.get('note'), str) else ''
    return {
        'widthCm': round(float(width), 1) if width is not None else None,
        'lengthCm': round(float(length), 1) if length is not None else None,
        'confidence': round(float(confidence), 2) if confidence is not None else None,
        'note': note[:300],
    }


def analyze_photo(image_path, label, token):
    started = time.perf_counter()
    file_id = None
    try:
        file_id, file_url = upload_replicate_file(image_path, token)
        measured = {}
        for dimension in ('width', 'length'):
            last_error = None
            for _ in range(3):
                try:
                    answer = create_gemini_prediction(file_url, build_measurement_prompt(label, dimension), token)
                    measured[dimension] = parse_measurement_output(answer, (dimension,))
                    break
                except ValueError as error:
                    last_error = error
            else:
                raise last_error or ValueError('Gemini 응답에서 측정값을 찾지 못했어요.')
        width = measured['width']
        length = measured['length']
        measurements = {
            'widthCm': width['widthCm'], 'lengthCm': length['lengthCm'],
            'confidence': None, 'note': '',
        }
        return {
            'photo': label['imageName'],
            'backgroundId': label['backgroundId'],
            'garmentId': label['garmentId'],
            'status': 'done',
            **measurements,
            'inferenceMs': round((time.perf_counter() - started) * 1000, 1),
        }
    except ReplicateAPIError as error:
        if error.status_code in {401, 403}:
            raise ReplicateAPIError('Replicate 토큰 인증에 실패했어요. .env의 새 토큰을 확인해 주세요.', error.status_code) from None
        return {
            'photo': label['imageName'], 'backgroundId': label['backgroundId'],
            'garmentId': label['garmentId'], 'status': 'failed', 'widthCm': None,
            'lengthCm': None, 'confidence': None, 'note': '', 'message': str(error),
        }
    except (OSError, ValueError) as error:
        return {
            'photo': label['imageName'], 'backgroundId': label['backgroundId'],
            'garmentId': label['garmentId'], 'status': 'failed', 'widthCm': None,
            'lengthCm': None, 'confidence': None, 'note': '', 'message': str(error),
        }
    finally:
        if file_id:
            delete_replicate_file(file_id, token)


def run_dataset_analysis(dataset_root, token):
    if not isinstance(token, str) or not token.strip():
        raise ValueError('Replicate 토큰을 환경 변수에 설정해 주세요.')
    root = Path(dataset_root)
    image_paths = sorted(root.rglob('*.jpg')) if root.is_dir() else []
    labels = [read_dataset_label(path) for path in image_paths]
    counts = {background: sum(row['backgroundId'] == background for row in labels) for background in BACKGROUND_BY_PREFIX.values()}
    if len(labels) != 20 or set(counts.values()) != {5}:
        raise ValueError('네 배경에서 다섯 장씩, 모두 20장의 데이터 사진이 필요해요.')

    results = [None] * len(labels)
    with ThreadPoolExecutor(max_workers=4) as executor:
        jobs = {
            executor.submit(analyze_photo, path, label, token): index
            for index, (path, label) in enumerate(zip(image_paths, labels))
        }
        for future in as_completed(jobs):
            results[jobs[future]] = future.result()
    completed = [row for row in results if row and row['status'] == 'done']
    return {
        'model': MODEL_ID,
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'sampleCount': len(results),
        'successCount': len(completed),
        'failureCount': len(results) - len(completed),
        'averageInferenceMs': round(sum(row['inferenceMs'] for row in completed) / len(completed), 1) if completed else None,
        'rows': results,
    }
