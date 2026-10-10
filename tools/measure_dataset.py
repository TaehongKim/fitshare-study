"""Measure garment photos with the project calibration mats."""

from pathlib import Path
import re
import argparse
import json
from datetime import datetime, timezone

try:
    from tools.vision_pipeline import measure_garment, rectify_photo
except ModuleNotFoundError as error:
    # 직접 파일을 실행할 때는 같은 폴더에서 분석 도구를 가져온다.
    if error.name != 'tools':
        raise
    from vision_pipeline import measure_garment, rectify_photo


DATASET_PATTERN = re.compile(r'^(p|c|ch|chc)_([1-5])_w(\d+(?:\.\d+)?)_h(\d+(?:\.\d+)?)\.jpg$', re.IGNORECASE)
BACKGROUND_BY_PREFIX = {'p': 'point', 'c': 'cross', 'ch': 'ChArUco', 'chc': 'ChaArUco_Cross'}
BACKGROUND_BY_FOLDER = {value.casefold(): value for value in BACKGROUND_BY_PREFIX.values()}
GARMENT_INFO = {
    1: {'name': '상의 외투', 'category': 'top', 'widthKind': 'chest'},
    2: {'name': '흰 크롭티셔츠', 'category': 'top', 'widthKind': 'chest'},
    3: {'name': '원피스', 'category': 'dress', 'widthKind': 'chest'},
    4: {'name': '점퍼', 'category': 'top', 'widthKind': 'chest'},
    5: {'name': '바지', 'category': 'pants', 'widthKind': 'waist'},
}


def read_dataset_label(path):
    """Read the reference label from a dataset image's name and folder."""
    image_path = Path(path)
    match = DATASET_PATTERN.fullmatch(image_path.name)
    if not match:
        raise ValueError(f'파일명 형식이 올바르지 않아요: {image_path.name}')

    prefix, garment_text, width_text, length_text = match.groups()
    expected_background = BACKGROUND_BY_PREFIX[prefix.casefold()]
    folder_background = BACKGROUND_BY_FOLDER.get(image_path.parent.name.casefold())
    if folder_background != expected_background:
        raise ValueError(f'파일명과 배경 폴더가 서로 달라요: {image_path.name}')

    garment_id = int(garment_text)
    garment = GARMENT_INFO[garment_id]
    return {
        'imageName': image_path.name,
        'imagePath': image_path.as_posix(),
        'backgroundId': folder_background,
        'garmentId': garment_id,
        'garmentName': garment['name'],
        'category': garment['category'],
        'widthKind': garment['widthKind'],
        'referenceWidthCm': float(width_text),
        'referenceLengthCm': float(length_text),
    }


def _group_summary(rows, key):
    groups = {}
    for row in rows:
        groups.setdefault(row[key], []).append(row)
    summary = {}
    for group_key, group_rows in groups.items():
        completed = [row for row in group_rows if row['status'] == 'done']
        summary[group_key] = {
            'imageCount': len(group_rows),
            'successCount': len(completed),
            'successRatePct': round(len(completed) / len(group_rows) * 100, 1) if group_rows else 0,
            'maeWidthCm': round(sum(row['absoluteWidthErrorCm'] for row in completed) / len(completed), 1) if completed else None,
            'maeLengthCm': round(sum(row['absoluteLengthErrorCm'] for row in completed) / len(completed), 1) if completed else None,
        }
    return summary


def analyze_dataset(dataset_root, output_dir=None):
    """Measure every JPG. Filename values are copied into rows only after vision results exist."""
    root = Path(dataset_root)
    image_paths = sorted(root.rglob('*.jpg')) if root.is_dir() else []
    rows = []
    for image_path in image_paths:
        label = read_dataset_label(image_path)
        row = {
            **label,
            'sourceUrl': label['imagePath'].replace('\\', '/'),
            'status': 'failed',
            'message': '',
            'measuredWidthCm': None,
            'measuredLengthCm': None,
            'absoluteWidthErrorCm': None,
            'absoluteLengthErrorCm': None,
        }
        try:
            flattened = rectify_photo(image_path, label['backgroundId'])
            if not flattened['ok']:
                raise ValueError(flattened['message'])
            measured = measure_garment(flattened['image'], garment_id=label['garmentId'])
            row.update({
                'status': 'done',
                'message': measured['message'],
                'measuredWidthCm': measured['measuredWidthCm'],
                'measuredLengthCm': measured['measuredLengthCm'],
                'absoluteWidthErrorCm': round(abs(measured['measuredWidthCm'] - label['referenceWidthCm']), 1),
                'absoluteLengthErrorCm': round(abs(measured['measuredLengthCm'] - label['referenceLengthCm']), 1),
                'widthLineY': measured['widthLineY'],
                'lengthLineX': measured['lengthLineX'],
                'topY': measured['topY'],
                'bottomY': measured['bottomY'],
                'confidence': measured['confidence'],
                'rectificationMethod': flattened['method'],
                'rectificationConfidence': round(flattened['confidence'], 2),
                'detectedMarkers': flattened['detectedMarkers'],
                'overlayDataUrl': measured['overlayDataUrl'],
            })
        except (ValueError, RuntimeError) as error:
            row['message'] = str(error)
        rows.append(row)

    completed = [row for row in rows if row['status'] == 'done']
    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'summary': {
            'imageCount': len(rows),
            'successCount': len(completed),
            'failureCount': len(rows) - len(completed),
            'successRatePct': round(len(completed) / len(rows) * 100, 1) if rows else 0,
            'maeWidthCm': round(sum(row['absoluteWidthErrorCm'] for row in completed) / len(completed), 1) if completed else None,
            'maeLengthCm': round(sum(row['absoluteLengthErrorCm'] for row in completed) / len(completed), 1) if completed else None,
        },
        'byBackground': _group_summary(rows, 'backgroundId'),
        'byGarment': _group_summary(rows, 'garmentId'),
        'rows': rows,
    }
    if output_dir is not None:
        destination = Path(output_dir)
        destination.mkdir(parents=True, exist_ok=True)
        (destination / 'report.json').write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description='measure_dataset 사진의 자동 측정값을 비교합니다.')
    parser.add_argument('--dataset', default=str(Path(__file__).resolve().parents[1] / 'measure_dataset'))
    parser.add_argument('--output', default=str(Path(__file__).resolve().parents[1] / 'server-data' / 'measure-dataset-report'))
    args = parser.parse_args()
    report = analyze_dataset(args.dataset, args.output)
    summary = report['summary']
    print(f"사진 {summary['imageCount']}장 · 자동 측정 {summary['successCount']}장 · 실패 {summary['failureCount']}장")
    print(f"성공률 {summary['successRatePct']}% · 너비 평균 오차 {summary['maeWidthCm']}cm · 길이 평균 오차 {summary['maeLengthCm']}cm")
    print(f"결과 파일: {Path(args.output) / 'report.json'}")


if __name__ == '__main__':
    main()
