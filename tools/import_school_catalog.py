"""Use verified garment photos in normal registrations with explicit fictional demo sizes."""
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
ROWS = [
    ('474833', '69', 'AIRism 코튼 스트라이프 크루넥 긴팔 A', 'top', '네이비', '봄'),
    ('474832', '00', 'AIRism 코튼 크루넥 긴팔', 'top', '흰색', '봄'),
    ('486992', '11', '립 크루넥 긴팔', 'top', '분홍', '봄'),
    ('486637', '64', '저지 레귤러핏 진', 'pants', '파랑', '봄'),
    ('486638', '09', '저지 레귤러핏 컬러 진', 'pants', '검정', '봄'),
    ('488426', '02', '드라이 스웨트 팬츠', 'pants', '연회색', '봄'),
    ('483382', '00', '프릴 티셔츠', 'top', '흰색', '여름'),
    ('474592', '41', 'AIRism 코튼 크루넥 반팔', 'top', '노랑', '여름'),
    ('483417', '10', 'AIRism 코튼 그래픽 크루넥 반팔', 'top', '연분홍', '여름'),
    ('483411', '03', 'AIRism 코튼 하프 팬츠', 'pants', '회색', '여름'),
    ('474703', '67', '데님 쇼트 팬츠', 'pants', '파랑', '여름'),
    ('457729', '64', '데님 페인터 하프 팬츠', 'pants', '파랑', '여름'),
    ('492992', '02', 'KAWS UNIVERSE 스웨트셔츠 B', 'top', '연회색', '가을'),
    ('492991', '09', 'KAWS UNIVERSE 스웨트셔츠 A', 'top', '검정', '가을'),
    ('487338', '02', 'PEANUTS 드라이 스웨트셔츠 B', 'top', '연회색', '가을'),
    ('486630', '67', '배럴 레그 진', 'pants', '파랑', '가을'),
    ('488163', '03', '드라이 스웨트 와이드 팬츠', 'pants', '회색', '가을'),
    ('485162', '09', '드라이 스웨트 카고 팬츠', 'pants', '검정', '가을'),
    ('486658', '61', '소프트니트 후리스 크루넥 긴팔', 'top', '파랑', '겨울'),
    ('478168', '39', '플러피 후리스 풀집 재킷', 'top', '진갈색', '겨울'),
    ('478141', '30', '후리스 풀집 재킷', 'top', '베이지', '겨울'),
    ('478140', '60', '보아 스웨트 팬츠', 'pants', '파랑', '겨울'),
    ('478127', '56', '웜 라인 팬츠', 'pants', '초록', '겨울'),
    ('486629', '68', '웜 라인 데님 팬츠', 'pants', '진청', '겨울'),
]


def build_catalog():
    result = []
    review_path = ROOT / 'data' / 'schoolCatalogImageReviews.json'
    reviews = json.loads(review_path.read_text(encoding='utf-8')) if review_path.exists() else {}
    group_positions = {}
    for index, (code, color, name, category, color_name, season) in enumerate(ROWS):
        record_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'uniqlo-kr-seasonal-flatlay-v2-{code}'))
        group = (season, category)
        position = group_positions.get(group, 0)
        size = [130, 140, 150][position % 3]
        if (ROOT / 'server-data' / 'garments' / record_id / 'photo.jpg').is_file():
            group_positions[group] = position + 1
        length = (46 + (size - 120) * .32) if category == 'top' else ((30 + (size - 120) * .22) if season == '여름' else (70 + (size - 120) * .60))
        width = (36 + (size - 120) * .28) if category == 'top' else (24 + (size - 120) * .18)
        record_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'uniqlo-kr-seasonal-flatlay-v2-{code}'))
        image_url = f'https://image.uniqlo.com/UQ/ST3/AsianCommon/imagesgoods/{code}/item/goods_{color}_{code}_3x4.jpg?width=600'
        if code in ('474592', '483417', '483411'):
            image_url = f'https://image.uniqlo.com/UQ/ST3/AsianCommon/imagesgoods/{code}/sub/goods_{code}_sub14_3x4.jpg?width=600'
        review = reviews.get(code, {})
        reviewed = review.get('sourceImageUrl') == image_url
        result.append(dict(
            id=record_id, name=name, category=category,
            garmentTypeId=1 if category == 'top' else 5,
            garmentTypeName='상의' if category == 'top' else '바지',
            gender='unisex', colorName=color_name, size=str(size),
            ownerName='체험 옷장',
            lengthCm=round(length, 1), widthCm=round(width, 1), measurementStatus='demo',
            isDemo=True, sourceType='demo-registration', brand='UNIQLO', productCode=code,
            photoUrl=f'/api/garments/{record_id}/photo',
            closetPhotoUrl=f'/api/garments/{record_id}/closet-photo',
            backgroundId='M4', closetPhotoSource='provided-garment-only', thumbnailVersion=2,
            sourceUrl=f'https://www.uniqlo.com/kr/ko/products/E{code}-000/00?colorDisplayCode={color}',
            sourceCheckedAt='2026-10-17',
            sourceImageUrl=image_url,
            imageKind='garment-only', imageReviewStatus='verified' if reviewed else 'pending',
            imageReviewSha256=review.get('sha256') if reviewed else None,
            season=season, seasons=[season], style=['편한 스타일','활동적인 스타일','단정한 스타일'][position % 3],
            recommendationTagsSource='demo', condition='보통' if position % 3 == 2 else '좋음',
            garmentKind='바지' if category=='pants' else '점퍼' if '재킷' in name else '맨투맨' if '스웨트셔츠' in name else '티셔츠',
            sleeveLength='해당 없음' if category=='pants' else '반팔' if season=='여름' else '긴팔',
            bottomLength='반바지' if category=='pants' and season=='여름' else '긴바지' if category=='pants' else '해당 없음',
            thickness='두꺼움' if season=='겨울' else '얇음' if season=='여름' else '보통',
            stretch='약간', pattern='줄무늬' if '스트라이프' in name else '프린트' if any(token in name for token in ('그래픽','KAWS','PEANUTS')) else '무지',
            metadataSources={key:'demo' for key in ('size','seasons','style','condition','garmentKind','sleeveLength','bottomLength','thickness','stretch','pattern')},
            genderSource='not-used-as-restriction',
            description='추천 개발과 나눔 기능 체험용으로 등록한 옷이에요. 치수와 등록자는 가상 데이터예요.',
            createdAt='2026-10-17T00:00:00+09:00',
        ))
    return result


def main():
    catalog = build_catalog()
    data_path = ROOT / 'data' / 'schoolCatalog.json'
    data_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    garments = ROOT / 'server-data' / 'garments'
    index_path = garments / 'index.json'
    existing = json.loads(index_path.read_text(encoding='utf-8'))
    imported_ids = {item['id'] for item in catalog}
    preserved = [item for item in existing if item['id'] not in imported_ids]
    for item in catalog:
        directory = garments / item['id']
        if not (directory / 'photo.jpg').is_file():
            continue
        (directory / 'garment.json').write_text(json.dumps(item, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    active = [item for item in catalog if (garments / item['id'] / 'photo.jpg').is_file()]
    index_path.write_text(json.dumps(active + preserved, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Updated {len(active)} demo registrations; preserved {len(preserved)} garments; missing/deleted photos were not restored.')


if __name__ == '__main__':
    main()
