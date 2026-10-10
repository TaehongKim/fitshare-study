"""같은 M4 옷 사진에서 저장된 여러 측정 실험 결과를 나란히 정리해요."""

import math
import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RESULTS_DIR = PROJECT_ROOT / 'experiments' / 'garment_ai' / 'results'
SAFE_IMAGE_NAME = re.compile(r'^[A-Za-z0-9_.-]+\.(?:jpg|png)$', re.IGNORECASE)

METHODS = (
    ('fitshare', '현재 FitShare 파이프라인', '같은 사진을 원근 보정하고 OpenCV로 옷의 너비와 기장을 찾아요.'),
    ('yolo', 'YOLO 옷 분할 후보', '옷 종류와 옷 영역을 함께 예측하는 실험 모델이에요.'),
    ('sam', 'SAM ViT-B 점 마스크', '옷을 지정한 점을 바탕으로 옷 영역을 찾는 실험 모델이에요.'),
    ('hrnet', 'HRNet-W48 기준점', 'DeepFashion2 기준점 모델로 옷의 점을 찾는 실험이에요.'),
)
DATASET_BACKGROUNDS = ('point', 'cross', 'ChArUco', 'ChaArUco_Cross')


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _rows(value, label):
    if not isinstance(value, dict) or not isinstance(value.get('rows'), list):
        raise ValueError(f'{label} 비교 결과를 읽지 못했어요.')
    return value['rows']


def _by_photo(rows):
    result = {}
    for row in rows:
        if isinstance(row, dict) and isinstance(row.get('photo'), str):
            result[row['photo']] = row
    return result


def _safe_result_url(filename):
    if not isinstance(filename, str) or not SAFE_IMAGE_NAME.fullmatch(filename):
        return None
    path = (RESULTS_DIR / filename).resolve()
    if path.parent != RESULTS_DIR.resolve() or not path.is_file():
        return None
    return f'/experiments/garment_ai/results/{filename}'


def _measurements(row, width_key, length_key, overlay_key=None, overlay_is_data=False):
    width = row.get(width_key) if isinstance(row, dict) else None
    length = row.get(length_key) if isinstance(row, dict) else None
    overlay = row.get(overlay_key) if isinstance(row, dict) and overlay_key else None
    overlay_value = overlay if overlay_is_data and isinstance(overlay, str) and overlay.startswith('data:image/') else None
    if not overlay_is_data:
        overlay_value = _safe_result_url(overlay)
    return {
        'widthCm': width if _is_number(width) else None,
        'lengthCm': length if _is_number(length) else None,
        'overlayUrl': overlay_value,
    }


def _summary(rows, method_id):
    width_errors = []
    length_errors = []
    for row in rows:
        measured = row['measurements'][method_id]
        if measured['widthCm'] is None or measured['lengthCm'] is None:
            continue
        width_errors.append(abs(measured['widthCm'] - row['referenceWidthCm']))
        length_errors.append(abs(measured['lengthCm'] - row['referenceLengthCm']))
    count = len(width_errors)
    return {
        'successCount': count,
        'widthMaeCm': round(sum(width_errors) / count, 2) if count else None,
        'lengthMaeCm': round(sum(length_errors) / count, 2) if count else None,
    }


def _gemini_summary_rows(dataset_rows, gemini_results):
    gemini_by_photo = _by_photo(_rows(gemini_results, 'Gemini') if gemini_results else [])
    rows = []
    for base in dataset_rows:
        background_id = base.get('backgroundId') if isinstance(base, dict) else None
        photo = base.get('imageName') if isinstance(base, dict) else None
        if (background_id not in DATASET_BACKGROUNDS or not isinstance(photo, str)
                or not SAFE_IMAGE_NAME.fullmatch(photo)
                or not _is_number(base.get('referenceWidthCm'))
                or not _is_number(base.get('referenceLengthCm'))):
            continue
        gemini = gemini_by_photo.get(photo, {})
        rows.append({
            'photo': photo,
            'backgroundId': background_id,
            'garmentId': base.get('garmentId'),
            'garmentName': base.get('garmentName') or f"옷 {base.get('garmentId', '')}",
            'widthKind': base.get('widthKind', 'chest'),
            'referenceWidthCm': base.get('referenceWidthCm'),
            'referenceLengthCm': base.get('referenceLengthCm'),
            'sourceUrl': f'/measure_dataset/{background_id}/{photo}',
            'measurements': {
                'fitshare': _measurements(
                    base if base.get('status') == 'done' else {},
                    'measuredWidthCm', 'measuredLengthCm'
                ),
                'gemini': _measurements(
                    gemini if gemini.get('status') == 'done' else {}, 'widthCm', 'lengthCm'
                ),
                'geminiNote': gemini.get('note') if gemini.get('status') == 'done' else gemini.get('message'),
            },
        })
    return sorted(rows, key=lambda row: (DATASET_BACKGROUNDS.index(row['backgroundId']), row['photo']))


def _gemini_metrics(rows, method_id):
    summary = _summary(rows, method_id)
    return {
        'id': method_id,
        'name': 'FitShare 파이프라인' if method_id == 'fitshare' else 'Gemini 2.5 Flash',
        'sampleCount': len(rows),
        **summary,
    }


def _build_gemini_comparison(dataset_rows, gemini_results):
    rows = _gemini_summary_rows(dataset_rows, gemini_results)
    gemini_metrics = _gemini_metrics(rows, 'gemini')
    durations = [
        row.get('inferenceMs') for row in _rows(gemini_results, 'Gemini')
        if isinstance(row, dict) and row.get('status') == 'done' and _is_number(row.get('inferenceMs'))
    ] if gemini_results else []
    gemini_metrics['averageInferenceMs'] = round(sum(durations) / len(durations), 1) if durations else None
    background_summaries = {}
    for background_id in DATASET_BACKGROUNDS:
        background_rows = [row for row in rows if row['backgroundId'] == background_id]
        if background_rows:
            background_summaries[background_id] = {
                'sampleCount': len(background_rows),
                'methods': [_gemini_metrics(background_rows, method_id) for method_id in ('fitshare', 'gemini')],
            }
    return {
        'model': (gemini_results or {}).get('model', 'google/gemini-2.5-flash'),
        'sampleCount': len(rows),
        'methods': [
            _gemini_metrics(rows, 'fitshare'),
            gemini_metrics,
        ],
        'rows': rows,
        'byBackground': background_summaries,
        'status': (gemini_results or {}).get('status', 'not_run'),
        'generatedAt': (gemini_results or {}).get('generatedAt'),
        'explanation': '20장 사진을 네 배경별로 나눠 같은 FitShare 측정값과 Gemini의 추정값을 비교해요. Gemini에게 파일 이름의 정답 치수는 알려주지 않았어요.',
    }


def build_model_comparison(dataset_report, model_results, hrnet_results, gemini_results=None):
    """M4 사진 이름을 맞춰서 기준값, 측정값, MAE, 결과 그림을 합쳐요."""
    dataset_rows = _rows(dataset_report, '비교할 M4 측정 결과')
    model_rows = _by_photo(_rows(model_results, 'AI 모델'))
    hrnet_rows = _by_photo(_rows(hrnet_results, 'HRNet'))
    m4_rows = [
        row for row in dataset_rows
        if isinstance(row, dict) and row.get('backgroundId') == 'ChaArUco_Cross'
    ]
    if not m4_rows:
        raise ValueError('비교할 M4 측정 결과가 없어요.')

    rows = []
    for base in sorted(m4_rows, key=lambda item: str(item.get('imageName', ''))):
        photo = base.get('imageName')
        if (not isinstance(photo, str) or not SAFE_IMAGE_NAME.fullmatch(photo)
                or not _is_number(base.get('referenceWidthCm'))
                or not _is_number(base.get('referenceLengthCm'))):
            continue
        model = model_rows.get(photo, {})
        hrnet = hrnet_rows.get(photo, {})
        rows.append({
            'photo': photo,
            'garmentId': base.get('garmentId'),
            'garmentName': base.get('garmentName') or f"옷 {base.get('garmentId', '')}",
            'widthKind': base.get('widthKind', 'chest'),
            'referenceWidthCm': base.get('referenceWidthCm'),
            'referenceLengthCm': base.get('referenceLengthCm'),
            'sourceUrl': f'/measure_dataset/ChaArUco_Cross/{photo}',
            'measurements': {
                'fitshare': _measurements(
                    base if base.get('status') == 'done' else {},
                    'measuredWidthCm', 'measuredLengthCm', 'overlayDataUrl', True
                ),
                'yolo': _measurements(model, 'yoloWidthCm', 'yoloLengthCm', 'overlay'),
                'sam': _measurements(model, 'samWidthCm', 'samLengthCm', 'samOverlay'),
                'hrnet': _measurements(hrnet, 'hrnetWidthCm', 'hrnetLengthCm', 'overlay'),
            },
        })
    if not rows:
        raise ValueError('M4 사진 이름을 비교할 수 없어요.')

    methods = []
    for method_id, name, description in METHODS:
        methods.append({
            'id': method_id,
            'name': name,
            'description': description,
            **_summary(rows, method_id),
            'averageInferenceMs': (
                model_results.get('averageInferenceMs') if method_id == 'yolo' else
                hrnet_results.get('averageInferenceMs') if method_id == 'hrnet' else None
            ),
        })
    return {
        'backgroundId': 'ChaArUco_Cross',
        'sampleCount': len(rows),
        'methods': methods,
        'rows': rows,
        'dataProvenanceWarning': model_results.get('dataProvenanceWarning', ''),
        'explanation': '평균 절대 오차(MAE)는 기준 크기와 측정값이 평균 몇 cm 다른지 보여줘요. 작은 숫자가 더 가까워요.',
        'deepFashion2Note': 'DeepFashion2는 측정 알고리즘이 아니에요. 옷 사진, 종류, 기준점이 모인 데이터셋이에요. HRNet은 이 데이터로 학습한 기준점 모델이고, YOLO는 별도의 후보 모델이에요.',
        'geminiComparison': _build_gemini_comparison(dataset_rows, gemini_results),
    }
