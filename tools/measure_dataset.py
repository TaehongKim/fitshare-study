"""Measure garment photos with the project calibration mats."""

from pathlib import Path
import re
import argparse
import json
import math
import os
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone

try:
    from tools.vision_pipeline import (A0_HEIGHT_CM, A0_WIDTH_CM, OUTPUT_HEIGHT, OUTPUT_WIDTH,
                                      _cv2_modules, measure_garment, rectify_photo, width_line_y)
except ModuleNotFoundError as error:
    # 직접 파일을 실행할 때는 같은 폴더에서 분석 도구를 가져온다.
    if error.name != 'tools':
        raise
    from vision_pipeline import (A0_HEIGHT_CM, A0_WIDTH_CM, OUTPUT_HEIGHT, OUTPUT_WIDTH,
                                 _cv2_modules, measure_garment, rectify_photo, width_line_y)


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
            measured = measure_garment(flattened['image'], garment_id=label['garmentId'],
                                       scale_cm_per_pixel=flattened['scaleCmPerPixel'])
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


def analyze_round4_dataset(dataset_root, output_path=None):
    """Compare A0-canvas conversion with mat-pitch conversion on identical flattened photos."""
    root = Path(dataset_root)
    image_paths = sorted(root.rglob('*.jpg')) if root.is_dir() else []
    rows = []
    for image_path in image_paths:
        label = read_dataset_label(image_path)
        rectified = rectify_photo(image_path, label['backgroundId'])
        row = {
            **label,
            'sourceUrl': f"assets/photos/{label['backgroundId']}/{image_path.stem}.jpg",
            'patternScaleCmPerPixel': rectified.get('scaleCmPerPixel') if rectified.get('ok') else None,
            'rectificationMethod': rectified.get('method'),
            'pattern': {'status': 'failed', 'message': '', 'measuredWidthCm': None,
                        'measuredLengthCm': None, 'absoluteWidthErrorCm': None,
                        'absoluteLengthErrorCm': None},
            'a0': {'status': 'failed', 'message': '', 'measuredWidthCm': None,
                   'measuredLengthCm': None, 'absoluteWidthErrorCm': None,
                   'absoluteLengthErrorCm': None},
        }
        if not rectified.get('ok'):
            reason = rectified.get('message', '사진을 보정하지 못했어요.')
            row['pattern']['message'] = reason
            row['a0']['message'] = reason
        else:
            scales = {
                'pattern': rectified['scaleCmPerPixel'],
                'a0': {'x': A0_WIDTH_CM / OUTPUT_WIDTH, 'y': A0_HEIGHT_CM / OUTPUT_HEIGHT},
            }
            for method, scale in scales.items():
                try:
                    # GrabCut은 RNG 상태를 사용하므로 두 계산에서 같은 마스크가 나오게 초기화해요.
                    cv2, _ = _cv2_modules()
                    cv2.setRNGSeed(0)
                    measured = measure_garment(rectified['image'], garment_id=label['garmentId'],
                                               scale_cm_per_pixel=scale)
                    row[method].update({
                        'status': 'done',
                        'measuredWidthCm': measured['measuredWidthCm'],
                        'measuredLengthCm': measured['measuredLengthCm'],
                        'absoluteWidthErrorCm': round(abs(measured['measuredWidthCm'] - label['referenceWidthCm']), 1),
                        'absoluteLengthErrorCm': round(abs(measured['measuredLengthCm'] - label['referenceLengthCm']), 1),
                    })
                except (ValueError, RuntimeError) as error:
                    row[method]['message'] = str(error)
        rows.append(row)

    def summarize(items, method):
        successful = [row[method] for row in items if row[method]['status'] == 'done']
        count = len(items)
        return {
            'imageCount': count,
            'successCount': len(successful),
            'failureCount': count - len(successful),
            'successRatePct': round(len(successful) / count * 100, 1) if count else 0,
            'maeWidthCm': round(sum(item['absoluteWidthErrorCm'] for item in successful) / len(successful), 2) if successful else None,
            'maeLengthCm': round(sum(item['absoluteLengthErrorCm'] for item in successful) / len(successful), 2) if successful else None,
        }

    methods = {method: summarize(rows, method) for method in ('a0', 'pattern')}
    backgrounds = ('point', 'cross', 'ChArUco', 'ChaArUco_Cross')
    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'experiment': 'round4-pattern-pitch-calibration',
        'imageCount': len(rows),
        'methods': methods,
        'byBackground': {
            background: {
                method: summarize([row for row in rows if row['backgroundId'] == background], method)
                for method in ('a0', 'pattern')
            }
            for background in backgrounds
        },
        'rows': rows,
    }
    if output_path is not None:
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
    return report


def analyze_round5_dataset(dataset_root, output_path=None, resolutions=(848, 1000, 1600, 2400, 4000)):
    """Find a useful ratio-preserving canvas resolution using identical source photos."""
    root = Path(dataset_root)
    image_paths = sorted(root.rglob('*.jpg')) if root.is_dir() else []
    rows = []
    for image_path in image_paths:
        label = read_dataset_label(image_path)
        row = {**label,
               'imagePath': f"measure_dataset/{label['backgroundId']}/{label['imageName']}",
               'sourceUrl': f"assets/photos/{label['backgroundId']}/{image_path.stem}.jpg"}
        for resolution in resolutions:
            method = f'px{resolution}'
            started = time.perf_counter()
            try:
                rectified = rectify_photo(image_path, label['backgroundId'], preserve_resolution=True,
                                          max_output_long_side=resolution)
                if not rectified.get('ok'):
                    raise ValueError(rectified.get('message', '사진을 보정하지 못했어요.'))
                cv2, _ = _cv2_modules()
                cv2.setRNGSeed(0)
                measured = measure_garment(rectified['image'], garment_id=label['garmentId'],
                                           scale_cm_per_pixel=rectified['scaleCmPerPixel'],
                                           max_working_long_side=resolution)
                row[method] = {
                    'status': 'done', 'canvas': rectified['canvas'],
                    'measuredWidthCm': measured['measuredWidthCm'],
                    'measuredLengthCm': measured['measuredLengthCm'],
                    'absoluteWidthErrorCm': round(abs(measured['measuredWidthCm'] - label['referenceWidthCm']), 1),
                    'absoluteLengthErrorCm': round(abs(measured['measuredLengthCm'] - label['referenceLengthCm']), 1),
                    'elapsedMs': round((time.perf_counter() - started) * 1000, 1),
                }
            except (ValueError, RuntimeError) as error:
                row[method] = {'status': 'failed', 'message': str(error),
                               'elapsedMs': round((time.perf_counter() - started) * 1000, 1)}
        rows.append(row)

    def summarize(method):
        successful = [row[method] for row in rows if row[method]['status'] == 'done']
        return {
            'imageCount': len(rows), 'successCount': len(successful), 'failureCount': len(rows) - len(successful),
            'successRatePct': round(len(successful) / len(rows) * 100, 1) if rows else 0,
            'maeWidthCm': round(sum(item['absoluteWidthErrorCm'] for item in successful) / len(successful), 2) if successful else None,
            'maeLengthCm': round(sum(item['absoluteLengthErrorCm'] for item in successful) / len(successful), 2) if successful else None,
            'averageElapsedMs': round(sum(item['elapsedMs'] for item in successful) / len(successful), 1) if successful else None,
        }

    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'experiment': 'round5-ratio-preserving-resolution', 'imageCount': len(rows),
        'testedResolutions': list(resolutions),
        'methods': {f'px{resolution}': summarize(f'px{resolution}') for resolution in resolutions},
        'rows': rows,
    }
    if output_path is not None:
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
    return report


def summarize_round7(rows, method_id):
    successful = [row[method_id] for row in rows if row.get(method_id, {}).get('status') == 'done']
    count = len(successful)
    return {
        'imageCount': len(rows), 'successCount': count, 'failureCount': len(rows) - count,
        'successRatePct': round(count / len(rows) * 100, 1) if rows else 0,
        'maeWidthCm': round(sum(row['absoluteWidthErrorCm'] for row in successful) / count, 2) if count else None,
        'maeLengthCm': round(sum(row['absoluteLengthErrorCm'] for row in successful) / count, 2) if count else None,
        'averageElapsedMs': round(sum(row['elapsedMs'] for row in successful) / count, 1) if count else None,
    }


def summarize_round8(rows, method_id):
    summary = summarize_round7(rows, method_id)
    target_rows = [row for row in rows if row.get('garmentId') in {2, 3, 4}]
    target = summarize_round7(target_rows, method_id)
    summary.update({
        'targetGarmentCount': len(target_rows),
        'targetSuccessCount': target['successCount'],
        'targetFailureCount': target['failureCount'],
        'targetMaeWidthCm': target['maeWidthCm'],
        'targetMaeLengthCm': target['maeLengthCm'],
    })
    return summary


ROUND7_WIDTH_RATIOS = {1: .40, 2: .325, 3: .15, 4: .20, 5: .10}
ROUND8_WIDTH_RATIO = .60


def analyze_round8_dataset(dataset_root, output_path=None):
    """Compare 7th-round width lines with 60% lines for shirts, dresses, and jumpers."""
    try:
        from tools.garment_segmentation import get_yolo_grabcut_provider
    except ModuleNotFoundError as error:
        if error.name != 'tools':
            raise
        from garment_segmentation import get_yolo_grabcut_provider

    cv2, _ = _cv2_modules()
    image_paths = sorted(Path(dataset_root).rglob('*.jpg')) if Path(dataset_root).is_dir() else []
    rows = []
    for image_path in image_paths:
        label = read_dataset_label(image_path)
        row = {**label, 'sourceUrl': f"assets/photos/{label['backgroundId']}/{image_path.stem}.jpg"}
        for method_id in ('round7', 'round8'):
            started = time.perf_counter()
            try:
                rectified = rectify_photo(image_path, label['backgroundId'], preserve_resolution=True,
                                          max_output_long_side=848)
                if not rectified.get('ok'):
                    raise ValueError(rectified.get('message', '사진을 보정하지 못했어요.'))
                length_provider = get_yolo_grabcut_provider(garment_id=label['garmentId'])
                cv2.setRNGSeed(0)
                measured = measure_garment(
                    rectified['image'], garment_id=label['garmentId'],
                    scale_cm_per_pixel=rectified['scaleCmPerPixel'], max_working_long_side=848,
                    length_mask_provider=length_provider,
                    width_ratio_override=(ROUND7_WIDTH_RATIOS[label['garmentId']] if method_id == 'round7'
                                          else ROUND8_WIDTH_RATIO if label['garmentId'] in {2, 3, 4} else None))
                row[method_id] = {
                    'status': 'done', 'measuredWidthCm': measured['measuredWidthCm'],
                    'measuredLengthCm': measured['measuredLengthCm'],
                    'absoluteWidthErrorCm': round(abs(measured['measuredWidthCm'] - label['referenceWidthCm']), 1),
                    'absoluteLengthErrorCm': round(abs(measured['measuredLengthCm'] - label['referenceLengthCm']), 1),
                    'elapsedMs': round((time.perf_counter() - started) * 1000, 1),
                    'widthRatio': ROUND7_WIDTH_RATIOS[label['garmentId']] if method_id == 'round7'
                                  else (ROUND8_WIDTH_RATIO if label['garmentId'] in {2, 3, 4}
                                        else ROUND7_WIDTH_RATIOS[label['garmentId']]),
                    'maskMethods': measured['maskMethods'],
                }
            except (ValueError, RuntimeError, OSError) as error:
                row[method_id] = {'status': 'failed', 'message': str(error),
                                  'elapsedMs': round((time.perf_counter() - started) * 1000, 1)}
        rows.append(row)
        print(f"[round8] {len(rows)}/{len(image_paths)} {image_path.name}", flush=True)

    methods = ('round7', 'round8')
    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'experiment': 'round8-width-line-at-60-percent', 'imageCount': len(rows),
        'targetGarmentIds': [2, 3, 4], 'targetImageCount': sum(row['garmentId'] in {2, 3, 4} for row in rows),
        'methodLabels': {
            'round7': {'label': '7차 기준', 'description': '848px · 너비 GrabCut · 기장 YOLO→GrabCut · 옷별 기존 너비 비율'},
            'round8': {'label': '8차 60% 너비선', 'description': '동일한 848px·분할 조합 · 티셔츠·원피스·점퍼 너비선을 위에서 60%로 이동'},
        },
        'notes': [
            '동일한 20장 사진과 848px 측정 흐름을 사용하고, 너비 비율만 바꿔 비교했습니다.',
            '60% 적용 대상은 크롭 티셔츠·원피스·점퍼 12장입니다. 상의 외투와 바지는 기존 너비 비율을 유지했습니다.',
            '결과는 이 20장 데이터셋에 한정되며, 다른 옷이나 촬영 조건의 정확도를 보장하지 않습니다.',
        ],
        'methods': {method: summarize_round8(rows, method) for method in methods},
        'byGarment': {str(garment_id): {method: summarize_round8(
            [row for row in rows if row['garmentId'] == garment_id], method) for method in methods}
            for garment_id in sorted(GARMENT_INFO)},
        'rows': rows,
    }
    if output_path is not None:
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
    return report


def analyze_round7_dataset(dataset_root, output_path=None):
    """Compare today's 600px GrabCut service with the selected 848px hybrid pipeline."""
    try:
        from tools.garment_segmentation import get_yolo_grabcut_provider
    except ModuleNotFoundError as error:
        if error.name != 'tools':
            raise
        from garment_segmentation import get_yolo_grabcut_provider

    cv2, _ = _cv2_modules()
    root = Path(dataset_root)
    image_paths = sorted(root.rglob('*.jpg')) if root.is_dir() else []
    rows = []
    for image_path in image_paths:
        label = read_dataset_label(image_path)
        row = {**label, 'sourceUrl': f"assets/photos/{label['backgroundId']}/{image_path.stem}.jpg"}
        for method_id in ('baseline', 'integrated'):
            started = time.perf_counter()
            try:
                if method_id == 'baseline':
                    rectified = rectify_photo(image_path, label['backgroundId'])
                    working_side, length_provider = 600, None
                else:
                    rectified = rectify_photo(image_path, label['backgroundId'], preserve_resolution=True,
                                              max_output_long_side=848)
                    working_side = 848
                    length_provider = get_yolo_grabcut_provider(garment_id=label['garmentId'])
                if not rectified.get('ok'):
                    raise ValueError(rectified.get('message', '사진을 보정하지 못했어요.'))
                cv2.setRNGSeed(0)
                measured = measure_garment(
                    rectified['image'], garment_id=label['garmentId'],
                    scale_cm_per_pixel=rectified['scaleCmPerPixel'], max_working_long_side=working_side,
                    length_mask_provider=length_provider)
                row[method_id] = {
                    'status': 'done', 'canvas': rectified['canvas'],
                    'measuredWidthCm': measured['measuredWidthCm'], 'measuredLengthCm': measured['measuredLengthCm'],
                    'absoluteWidthErrorCm': round(abs(measured['measuredWidthCm'] - label['referenceWidthCm']), 1),
                    'absoluteLengthErrorCm': round(abs(measured['measuredLengthCm'] - label['referenceLengthCm']), 1),
                    'elapsedMs': round((time.perf_counter() - started) * 1000, 1),
                    'maskMethods': measured['maskMethods'],
                }
            except (ValueError, RuntimeError, OSError) as error:
                row[method_id] = {'status': 'failed', 'message': str(error),
                                  'elapsedMs': round((time.perf_counter() - started) * 1000, 1)}
        rows.append(row)
        print(f"[round7] {len(rows)}/{len(image_paths)} {image_path.name}", flush=True)

    backgrounds = ('point', 'cross', 'ChArUco', 'ChaArUco_Cross')
    methods = ('baseline', 'integrated')
    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'experiment': 'round7-integrated-pipeline', 'imageCount': len(rows), 'resolutionLongSidePx': 848,
        'methodLabels': {
            'baseline': {'label': '현재 기준', 'description': '600px 작업 크기 · 너비와 기장 GrabCut'},
            'integrated': {'label': '7차 통합', 'description': '848px 비율 유지 · 너비 GrabCut · 기장 YOLO→GrabCut'},
        },
        'notes': [
            '848px는 입력 원본과 A0 보정 사진의 비율을 유지하면서 처리 긴 변을 제한한 값입니다.',
            '오차와 성공률은 이 20장 데이터셋에서 다시 측정한 값이며, 새로운 사진에서의 성능을 보장하지 않습니다.',
            '처리 시간은 보정과 마스크 생성, 치수 계산 및 실험 중 모델을 처음 읽는 시간을 포함합니다. 이 실행은 이미 저장된 모델 파일을 사용했고 다운로드하지 않았습니다. 캐시가 비어 있으면 첫 실행 시간은 더 길 수 있습니다.',
        ],
        'methods': {method: summarize_round7(rows, method) for method in methods},
        'byBackground': {background: {method: summarize_round7(
            [row for row in rows if row['backgroundId'] == background], method)
            for method in methods} for background in backgrounds},
        'byGarment': {str(garment_id): {method: summarize_round7(
            [row for row in rows if row['garmentId'] == garment_id], method)
            for method in methods} for garment_id in sorted(GARMENT_INFO)},
        'rows': rows,
    }
    if output_path is not None:
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
    return report


def analyze_round6_dataset(dataset_root, output_path=None, overlay_dir=None, model_dir=None, include_sam=True):
    """Swap only the segmentation module (GrabCut, YOLO, YOLO+GrabCut, SAM) and keep every other step fixed."""
    import base64
    import onnxruntime as ort
    from experiments.garment_ai.round6_masks import METHODS, build_providers, mask_iou
    from tools.vision_pipeline import _component_mask

    cv2, np = _cv2_modules()
    cache = Path(model_dir) if model_dir else Path(__file__).resolve().parents[1] / 'server-data' / 'model-cache'
    session = ort.InferenceSession(str(cache / 'deepfashion2-yolo26s-seg.onnx'), providers=['CPUExecutionProvider'])
    predictor = None
    if include_sam:
        from experiments.garment_ai.sam_experiment import create_predictor
        predictor = create_predictor(cache / 'sam_vit_b_01ec64.pth')
    providers = build_providers(session, predictor)
    method_ids = [method_id for method_id, _, _ in METHODS if method_id in providers]

    root = Path(dataset_root)
    image_paths = sorted(root.rglob('*.jpg')) if root.is_dir() else []
    rows = []
    for image_path in image_paths:
        label = read_dataset_label(image_path)
        row = {**label, 'sourceUrl': f"assets/photos/{label['backgroundId']}/{image_path.stem}.jpg"}
        rectified = rectify_photo(image_path, label['backgroundId'])
        if not rectified.get('ok'):
            for method_id in method_ids:
                row[method_id] = {'status': 'failed', 'message': rectified.get('message', '사진을 보정하지 못했어요.')}
            rows.append(row)
            continue
        cv2.setRNGSeed(0)
        baseline_mask = _component_mask(rectified['image'], label['garmentId'])[1]
        for method_id in method_ids:
            captured = {}
            provider = providers[method_id]
            if provider is not None:
                def recording(image, garment_id, _provider=provider, _captured=captured):
                    _captured['mask'] = np.asarray(_provider(image, garment_id)) > 0
                    return _captured['mask']
            else:
                recording = None
            started = time.perf_counter()
            try:
                cv2.setRNGSeed(0)
                measured = measure_garment(rectified['image'], garment_id=label['garmentId'],
                                           scale_cm_per_pixel=rectified['scaleCmPerPixel'],
                                           mask_provider=recording)
                entry = {
                    'status': 'done',
                    'measuredWidthCm': measured['measuredWidthCm'],
                    'measuredLengthCm': measured['measuredLengthCm'],
                    'absoluteWidthErrorCm': round(abs(measured['measuredWidthCm'] - label['referenceWidthCm']), 1),
                    'absoluteLengthErrorCm': round(abs(measured['measuredLengthCm'] - label['referenceLengthCm']), 1),
                    'elapsedMs': round((time.perf_counter() - started) * 1000, 1),
                    'maskIouWithGrabcut': round(mask_iou(baseline_mask, captured['mask']), 3)
                    if 'mask' in captured and captured['mask'].shape == baseline_mask.shape else None,
                }
                if overlay_dir is not None:
                    decoded = cv2.imdecode(np.frombuffer(
                        base64.b64decode(measured['overlayDataUrl'].split(',', 1)[1]), np.uint8), cv2.IMREAD_COLOR)
                    small = cv2.resize(decoded, (360, round(decoded.shape[0] * 360 / decoded.shape[1])),
                                       interpolation=cv2.INTER_AREA)
                    destination = Path(overlay_dir) / method_id / f'{image_path.stem}.jpg'
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    cv2.imwrite(str(destination), small, [cv2.IMWRITE_JPEG_QUALITY, 72])
                    entry['overlayUrl'] = f'assets/round6/{method_id}/{image_path.stem}.jpg'
                row[method_id] = entry
            except (ValueError, RuntimeError) as error:
                row[method_id] = {'status': 'failed', 'message': str(error),
                                  'elapsedMs': round((time.perf_counter() - started) * 1000, 1)}
        rows.append(row)
        print(f"[round6] {len(rows)}/{len(image_paths)} {image_path.name}", flush=True)

    # 조합: 새로 분할하지 않고, 너비는 GrabCut 값과 기장은 YOLO→GrabCut 값을 가져와 합친 사후 계산이다.
    for row in rows:
        width_source, length_source = row.get('grabcut', {}), row.get('yoloGrabcut', {})
        if width_source.get('status') == 'done' and length_source.get('status') == 'done':
            row['hybrid'] = {
                'status': 'done',
                'measuredWidthCm': width_source['measuredWidthCm'],
                'measuredLengthCm': length_source['measuredLengthCm'],
                'absoluteWidthErrorCm': width_source['absoluteWidthErrorCm'],
                'absoluteLengthErrorCm': length_source['absoluteLengthErrorCm'],
                'elapsedMs': round(width_source['elapsedMs'] + length_source['elapsedMs'], 1),
                'maskIouWithGrabcut': None,
                'overlayUrl': length_source.get('overlayUrl'),
            }
        else:
            row['hybrid'] = {'status': 'failed', 'message': '조합에 필요한 두 방법 중 하나가 실패했어요.'}
    if 'yoloGrabcut' in method_ids:
        method_ids.append('hybrid')

    def summarize(selected_rows, method_id):
        successful = [row[method_id] for row in selected_rows if row[method_id]['status'] == 'done']
        ious =[item['maskIouWithGrabcut'] for item in successful if item.get('maskIouWithGrabcut') is not None]
        return {
            'imageCount': len(selected_rows), 'successCount': len(successful),
            'failureCount': len(selected_rows) - len(successful),
            'successRatePct': round(len(successful) / len(selected_rows) * 100, 1) if selected_rows else 0,
            'maeWidthCm': round(sum(i['absoluteWidthErrorCm'] for i in successful) / len(successful), 2) if successful else None,
            'maeLengthCm': round(sum(i['absoluteLengthErrorCm'] for i in successful) / len(successful), 2) if successful else None,
            'averageElapsedMs': round(sum(i['elapsedMs'] for i in successful) / len(successful), 1) if successful else None,
            'averageMaskIouWithGrabcut': round(sum(ious) / len(ious), 3) if ious else None,
        }

    background_ids = ('point', 'cross', 'ChArUco', 'ChaArUco_Cross')
    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'experiment': 'round6-segmentation-module', 'imageCount': len(rows),
        'methodLabels': {**{method_id: {'label': label, 'description': description}
                            for method_id, label, description in METHODS if method_id in method_ids},
                         'hybrid': {'label': '조합 (너비 GrabCut + 기장 YOLO→GrabCut)',
                                    'description': '새 분할 없이 두 결과에서 잘 맞은 값을 골라 합친 사후 계산이에요. 같은 20장에서 고른 조합이라 실제보다 좋게 보일 수 있어요.'}},
        'methods': {method_id: summarize(rows, method_id) for method_id in method_ids},
        'byBackground': {background: {method_id: summarize([r for r in rows if r['backgroundId'] == background], method_id)
                                      for method_id in method_ids} for background in background_ids},
        'byGarment': {str(garment_id): {method_id: summarize([r for r in rows if r['garmentId'] == garment_id], method_id)
                                        for method_id in method_ids} for garment_id in sorted(GARMENT_INFO)},
        'rows': rows,
    }
    if output_path is not None:
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
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
            measured = measure_garment(rectified['image'], garment_id=label['garmentId'],
                                       scale_cm_per_pixel=rectified['scaleCmPerPixel'])
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
    parser.add_argument('--round4', action='store_true', help='compare A0 size with pattern-pitch calibration')
    parser.add_argument('--round5', action='store_true', help='compare standard and ratio-preserving high-resolution processing')
    parser.add_argument('--round6', action='store_true', help='compare segmentation modules (GrabCut, YOLO, SAM)')
    parser.add_argument('--round7', action='store_true', help='compare current service and integrated 848px pipeline')
    parser.add_argument('--round8', action='store_true', help='compare current width lines with 60% lines for shirts, dresses, jumpers')
    parser.add_argument('--no-sam', action='store_true', help='run round6 without the SAM methods')
    parser.add_argument('--repeat-count', type=int, default=100)
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()
    if args.round8:
        report_path = Path(args.output)
        if report_path.suffix.lower() != '.json':
            report_path = report_path / 'round8.json'
        report = analyze_round8_dataset(args.dataset, report_path)
        print(f"[round8] {report['imageCount']} images; target {report['targetImageCount']}; saved {report_path}", flush=True)
        for method, result in report['methods'].items():
            print(f"[round8] {method}: MAE width={result['maeWidthCm']}cm, length={result['maeLengthCm']}cm, "
                  f"success={result['successCount']}/{result['imageCount']}, "
                  f"target width MAE={result['targetMaeWidthCm']}cm, avg={result['averageElapsedMs']}ms", flush=True)
        return
    if args.round6:
        report_path = Path(args.output)
        if report_path.suffix.lower() != '.json':
            report_path = report_path / 'round6.json'
        docs = Path(__file__).resolve().parents[1] / 'docs'
        report = analyze_round6_dataset(args.dataset, report_path, overlay_dir=docs / 'assets' / 'round6',
                                        include_sam=not args.no_sam)
        print(f"[round6] {report['imageCount']} images; saved {report_path}", flush=True)
        for method, result in report['methods'].items():
            print(f"[round6] {method}: MAE width={result['maeWidthCm']}cm, length={result['maeLengthCm']}cm, "
                  f"successful={result['successCount']}, avg={result['averageElapsedMs']}ms, "
                  f"IoU={result['averageMaskIouWithGrabcut']}", flush=True)
        return
    if args.round7:
        report_path = Path(args.output)
        if report_path.suffix.lower() != '.json':
            report_path = report_path / 'round7.json'
        report = analyze_round7_dataset(args.dataset, report_path)
        print(f"[round7] {report['imageCount']} images; saved {report_path}", flush=True)
        for method, result in report['methods'].items():
            print(f"[round7] {method}: MAE width={result['maeWidthCm']}cm, length={result['maeLengthCm']}cm, "
                  f"success={result['successCount']}/{result['imageCount']}, avg={result['averageElapsedMs']}ms", flush=True)
        return
    if args.round5:
        report_path = Path(args.output)
        if report_path.suffix.lower() != '.json':
            report_path = report_path / 'round5.json'
        report = analyze_round5_dataset(args.dataset, report_path)
        print(f"[round5] {report['imageCount']} images; saved {report_path}", flush=True)
        for method, result in report['methods'].items():
            print(f"[round5] {method}: MAE width={result['maeWidthCm']}cm, "
                  f"length={result['maeLengthCm']}cm, successful={result['successCount']}, "
                  f"avg={result['averageElapsedMs']}ms", flush=True)
        return
    if args.round4:
        report_path = Path(args.output)
        if report_path.suffix.lower() != '.json':
            report_path = report_path / 'round4.json'
        report = analyze_round4_dataset(args.dataset, report_path)
        print(f"[round4] {report['imageCount']} images; saved {report_path}", flush=True)
        for method, result in report['methods'].items():
            print(f"[round4] {method}: MAE width={result['maeWidthCm']}cm, "
                  f"length={result['maeLengthCm']}cm, successful={result['successCount']}", flush=True)
        return
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

