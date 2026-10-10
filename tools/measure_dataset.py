"""Measure garment photos with the project calibration mats."""

from pathlib import Path
import re
import argparse
import json
import math
import os
from concurrent.futures import ProcessPoolExecutor, as_completed
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


def _round3_method_trials(task):
    image_path, label, method, policy, repeat_count = task
    trials = []
    preview = None
    for _ in range(repeat_count):
        try:
            rectified = rectify_photo(image_path, label['backgroundId'], perspective_policy=policy)
            if not rectified['ok']:
                raise ValueError(rectified['message'])
            measured = measure_garment(rectified['image'], garment_id=label['garmentId'])
            width = float(measured['measuredWidthCm'])
            length = float(measured['measuredLengthCm'])
            trials.append({
                'widthCm': width,
                'lengthCm': length,
                'widthErrorCm': abs(width - label['referenceWidthCm']),
                'lengthErrorCm': abs(length - label['referenceLengthCm']),
                'rectificationMode': rectified['rectificationMode'],
                'perspectiveScore': rectified['perspectiveScore'],
            })
            if preview is None:
                preview = {
                    'message': measured['message'],
                    'rectificationMethod': rectified['method'],
                    'overlayDataUrl': measured['overlayDataUrl'],
                }
        except (ValueError, RuntimeError) as error:
            trials.append({'message': str(error)})

    successful = [trial for trial in trials if 'widthCm' in trial]

    def average(key):
        return sum(item[key] for item in successful) / len(successful) if successful else None

    def spread(key):
        values = [item[key] for item in successful]
        if not values:
            return None
        mean = sum(values) / len(values)
        return math.sqrt(sum((value - mean) ** 2 for value in values) / len(values))

    return method, {
        'status': 'done' if successful else 'failed',
        'message': (preview or {}).get('message') or next(
            (trial.get('message', '') for trial in trials if trial.get('message')), ''),
        'successCount': len(successful),
        'failureCount': repeat_count - len(successful),
        'widthCm': round(average('widthCm'), 2) if successful else None,
        'lengthCm': round(average('lengthCm'), 2) if successful else None,
        'widthStdDevCm': round(spread('widthCm'), 3) if successful else None,
        'lengthStdDevCm': round(spread('lengthCm'), 3) if successful else None,
        'widthErrorCm': round(average('widthErrorCm'), 2) if successful else None,
        'lengthErrorCm': round(average('lengthErrorCm'), 2) if successful else None,
        'rectificationMode': successful[0].get('rectificationMode') if successful else None,
        'perspectiveScore': successful[0].get('perspectiveScore') if successful else None,
        'rectificationMethod': (preview or {}).get('rectificationMethod'),
        'overlayDataUrl': (preview or {}).get('overlayDataUrl'),
    }


def analyze_round3_dataset(dataset_root, output_path=None, repeat_count=100, workers=1):
    """Rerun both photo pipelines for each image and summarize repeat stability."""
    if isinstance(repeat_count, bool) or not isinstance(repeat_count, int) or not 1 <= repeat_count <= 100:
        raise ValueError('반복 횟수는 1~100 사이의 정수로 입력해 주세요.')
    if isinstance(workers, bool) or not isinstance(workers, int) or not 1 <= workers <= 16:
        raise ValueError('동시 작업 수는 1~16 사이의 정수로 입력해 주세요.')
    root = Path(dataset_root)
    image_paths = sorted(root.rglob('*.jpg')) if root.is_dir() else []
    labels = {path: read_dataset_label(path) for path in image_paths}
    tasks = [
        (str(path), labels[path], method, policy, repeat_count)
        for path in image_paths
        for method, policy in (('always', 'always'), ('conditional', 'conditional'))
    ]
    results = {}
    if workers == 1:
        for index, task in enumerate(tasks, start=1):
            method, result = _round3_method_trials(task)
            results[(Path(task[0]), method)] = result
            if repeat_count >= 10 and (index % 2 == 0 or index == len(tasks)):
                print(f'[round3] {index}/{len(tasks)} photo/method jobs complete', flush=True)
    else:
        with ProcessPoolExecutor(max_workers=min(workers, os.cpu_count() or 1)) as executor:
            futures = {executor.submit(_round3_method_trials, task): task for task in tasks}
            for index, future in enumerate(as_completed(futures), start=1):
                method, result = future.result()
                task = futures[future]
                results[(Path(task[0]), method)] = result
                if repeat_count >= 10 and (index % 2 == 0 or index == len(tasks)):
                    print(f'[round3] {index}/{len(tasks)} photo/method jobs complete', flush=True)

    rows = []
    for path in image_paths:
        label = labels[path]
        rows.append({
            **label,
            'sourceUrl': f"/measure_dataset/{label['backgroundId']}/{path.name}",
            'always': results[(path, 'always')],
            'conditional': results[(path, 'conditional')],
        })

    def summarize(items, method):
        completed = [row[method] for row in items if row[method]['successCount']]
        width_mae = [result['widthErrorCm'] for result in completed]
        length_mae = [result['lengthErrorCm'] for result in completed]

        def stats(values):
            if not values:
                return {'mean': None, 'stdDev': None, 'min': None, 'max': None}
            mean = sum(values) / len(values)
            return {
                'mean': round(mean, 2),
                'stdDev': round(math.sqrt(sum((value - mean) ** 2 for value in values) / len(values)), 3),
                'min': round(min(values), 2), 'max': round(max(values), 2),
            }

        return {
            'imageCount': len(items),
            'trialCount': repeat_count,
            'successCount': len(completed),
            'failureCount': len(items) - len(completed),
            'successfulImageCount': len(completed),
            'failedImageCount': len(items) - len(completed),
            'totalSuccessfulRuns': sum(row[method]['successCount'] for row in items),
            'widthMaeCm': stats(width_mae)['mean'],
            'lengthMaeCm': stats(length_mae)['mean'],
            'widthMaeStdDevCm': stats(width_mae)['stdDev'],
            'lengthMaeStdDevCm': stats(length_mae)['stdDev'],
            'widthMaeStability': stats(width_mae),
            'lengthMaeStability': stats(length_mae),
            'averageWithinPhotoWidthStdDevCm': round(sum(result['widthStdDevCm'] for result in completed) / len(completed), 3) if completed else None,
            'averageWithinPhotoLengthStdDevCm': round(sum(result['lengthStdDevCm'] for result in completed) / len(completed), 3) if completed else None,
        }

    background_ids = ('point', 'cross', 'ChArUco', 'ChaArUco_Cross')
    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'imageCount': len(rows),
        'repeatCount': repeat_count,
        'trialCountPerMethod': len(rows) * repeat_count,
        'workers': min(workers, os.cpu_count() or 1),
        'methods': {method: summarize(rows, method) for method in ('always', 'conditional')},
        'byBackground': {
            background: {
                method: summarize([row for row in rows if row['backgroundId'] == background], method)
                for method in ('always', 'conditional')
            }
            for background in background_ids
        },
        'rows': rows,
    }
    if output_path is not None:
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description='measure_dataset 사진의 자동 측정값을 비교합니다.')
    parser.add_argument('--dataset', default=str(Path(__file__).resolve().parents[1] / 'measure_dataset'))
    parser.add_argument('--output', default=str(Path(__file__).resolve().parents[1] / 'server-data' / 'measure-dataset-report'))
    parser.add_argument('--round3', action='store_true', help='compare the two correction methods')
    parser.add_argument('--repeat-count', type=int, default=100)
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()
    if args.round3:
        report_path = Path(args.output)
        if report_path.suffix.lower() != '.json':
            report_path = report_path / 'round3.json'
        report = analyze_round3_dataset(args.dataset, report_path, args.repeat_count, args.workers)
        print(f"[round3] {report['imageCount']} images, {report['repeatCount']} repeats, "
              f"{report['trialCountPerMethod']} runs per method; saved {report_path}", flush=True)
        for method, result in report['methods'].items():
            print(f"[round3] {method}: MAE width={result['widthMaeCm']}cm, "
                  f"length={result['lengthMaeCm']}cm, successful={result['totalSuccessfulRuns']}", flush=True)
        return
    report = analyze_dataset(args.dataset, args.output)
    summary = report['summary']
    print(f"사진 {summary['imageCount']}장 · 자동 측정 {summary['successCount']}장 · 실패 {summary['failureCount']}장")
    print(f"성공률 {summary['successRatePct']}% · 너비 평균 오차 {summary['maeWidthCm']}cm · 길이 평균 오차 {summary['maeLengthCm']}cm")
    print(f"결과 파일: {Path(args.output) / 'report.json'}")


if __name__ == '__main__':
    main()
