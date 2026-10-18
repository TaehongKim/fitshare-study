"""Account-owned clothing alerts, evaluated against newly registered garments."""
import re
import uuid
from datetime import datetime, timezone

CHOICES = {
    'gender': ('전체', '남학생', '여학생'),
    'size': ('전체', '100', '110', '120', '130', '140', '150', '160', '170'),
    'season': ('전체', '봄', '여름', '가을', '겨울'),
    'category': ('전체', '상의', '하의'),
    'style': ('전체', '편한 스타일', '활동적인 스타일', '단정한 스타일'),
    'color': ('전체', '밝은 색', '어두운 색'),
}
DARK = set('검정 검정색 검은색 블랙 black 네이비 navy 남색 진청 진갈색 짙은회색 다크그레이 차콜 charcoal'.split())
LIGHT = set('흰색 흰 하양 화이트 white 아이보리 베이지 연회색 회색 노랑 노란색 연분홍 분홍 핑크 민트 하늘색 연두 파랑 파란색 초록 빨강 보라'.split())


def clean_filters(payload):
    if not isinstance(payload, dict):
        raise ValueError('원하는 옷 조건을 선택해 주세요.')
    result = {key: payload.get(key, '전체') for key in CHOICES}
    if any(not isinstance(value, str) or value not in CHOICES[key] for key, value in result.items()):
        raise ValueError('원하는 옷 조건을 다시 선택해 주세요.')
    if all(value == '전체' for value in result.values()):
        raise ValueError('원하는 옷 조건을 하나 이상 선택해 주세요.')
    return result


def matches(item, filters):
    if item.get('category') not in ('top', 'pants'):
        return False
    # Practice inventory is not an actual donation.
    if item.get('isDemo') or item.get('sourceType') in ('demo-registration', 'product-catalog'):
        return False
    gender = {'male': '남학생', 'female': '여학생', 'unisex': '공용', '남학생': '남학생', '여학생': '여학생', '공용': '공용'}.get(item.get('gender'), '')
    color_name = re.sub(r'\s+', '', str(item.get('colorName') or '').lower())
    values = {'gender': gender, 'size': str(item.get('size') or '').strip(),
              'category': {'top': '상의', 'pants': '하의'}[item['category']],
              'style': item.get('style'), 'color': '어두운 색' if color_name in DARK else '밝은 색' if color_name in LIGHT else ''}
    seasons = item.get('seasons') if isinstance(item.get('seasons'), list) else [item.get('season')]
    for key, value in filters.items():
        if value == '전체':
            continue
        if key == 'season':
            if value not in seasons:
                return False
        elif not (key == 'gender' and gender == '공용') and values[key] != value:
            return False
    return True


def new_wish(username, filters, records):
    return {'id': str(uuid.uuid4()), 'username': username, 'filters': filters,
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'existingIds': [str(item['id']) for item in records], 'readIds': []}


def valid_store(wishes):
    if not isinstance(wishes, list):
        return False
    for wish in wishes:
        if not isinstance(wish, dict) or any(not isinstance(wish.get(key), str) for key in ('id', 'username', 'createdAt')):
            return False
        if any(not isinstance(wish.get(key), list) or any(not isinstance(value, str) for value in wish[key]) for key in ('existingIds', 'readIds')):
            return False
        try:
            if clean_filters(wish.get('filters')) != wish['filters']:
                return False
        except ValueError:
            return False
    return True


def public_wish(wish, records):
    existing = set(wish['existingIds'])
    read = set(wish['readIds'])
    items = [{'id': item['id'], 'name': item.get('name', '새로 등록된 옷'),
              'size': item.get('size', ''), 'createdAt': item.get('createdAt'),
              'unread': str(item['id']) not in read}
             for item in records if str(item['id']) not in existing and matches(item, wish['filters'])]
    return {key: wish[key] for key in ('id', 'filters', 'createdAt')} | {'matches': items}
