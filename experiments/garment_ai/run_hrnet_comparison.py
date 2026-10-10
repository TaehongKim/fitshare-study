"""Compare DeepFashion2 HRNet landmarks with the current OpenCV measurements."""

import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np

from experiments.garment_ai.hrnet_experiment import (
    DEEPFASHION2_CATEGORY_RANGES,
    YOLO_CLASS_TO_DEEPFASHION2_CATEGORY,
    load_hrnet_model,
    measure_landmark_cloud,
    predict_landmarks,
)
from experiments.garment_ai.run_comparison import (
    DATASET,
    combine_detections,
    decode_predictions,
    get_model as get_yolo_model,
    preprocess as preprocess_yolo,
    read_class_names,
    reference_from_filename,
)
from tools.vision_pipeline import measure_garment, rectify_photo


RESULTS = ROOT / 'experiments' / 'garment_ai' / 'results'


def summarize(rows, prefix):
    successful = [row for row in rows if row.get(f'{prefix}WidthCm') is not None]
    return {
        'widthMaeCm': round(float(np.mean([
            abs(row[f'{prefix}WidthCm'] - row['referenceWidthCm']) for row in successful
        ])), 2) if successful else None,
        'lengthMaeCm': round(float(np.mean([
            abs(row[f'{prefix}LengthCm'] - row['referenceLengthCm']) for row in successful
        ])), 2) if successful else None,
        'measuredCount': len(successful),
    }


def draw_landmark_result(image, landmarks, measured, output_path):
    overlay = image.copy()
    for x, y, score in landmarks:
        if score < 0.2:
            continue
        cv2.circle(overlay, (round(x), round(y)), 4, (0, 220, 80), -1)
    cv2.line(overlay, (measured['leftX'], measured['widthLineY']),
             (measured['rightX'], measured['widthLineY']), (255, 90, 40), 4)
    center_x = image.shape[1] // 2
    cv2.line(overlay, (center_x, measured['topY']), (center_x, measured['bottomY']), (20, 90, 255), 4)
    label = f"HRNet {measured['widthCm']} x {measured['lengthCm']} cm"
    cv2.putText(overlay, label, (8, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(overlay, label, (8, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output_path), overlay):
        raise OSError(f'HRNet 결과 그림을 저장하지 못했어요: {output_path.name}')


def run_comparison():
    if not DATASET.exists():
        raise SystemExit(f'실험 사진 폴더가 없어요: {DATASET}')
    yolo_model = get_yolo_model()
    class_names = read_class_names(yolo_model)
    hrnet_model = load_hrnet_model()
    rows = []

    for photo_path in sorted(DATASET.glob('*.jpg')):
        match = re.search(r'chc_([1-5])_', photo_path.name)
        if not match:
            continue
        garment_id = int(match.group(1))
        reference_width, reference_length = reference_from_filename(photo_path)
        flattened = rectify_photo(photo_path.read_bytes(), 'M4')
        if not flattened['ok']:
            raise ValueError(f'{photo_path.name}: {flattened["message"]}')
        image = flattened['image']
        baseline = measure_garment(image, garment_id=garment_id)
        yolo_input, _ = preprocess_yolo(image, 416)
        yolo_output, yolo_masks = yolo_model.run(None, {'images': yolo_input})
        detections = decode_predictions(yolo_output, yolo_masks, image.shape[:2], 416)
        best = combine_detections(detections, garment_id)
        row = {
            'photo': photo_path.name,
            'garmentId': garment_id,
            'referenceWidthCm': reference_width,
            'referenceLengthCm': reference_length,
            'opencvWidthCm': baseline['measuredWidthCm'],
            'opencvLengthCm': baseline['measuredLengthCm'],
            'hrnetWidthCm': None,
            'hrnetLengthCm': None,
            'hrnetInferenceMs': None,
            'hrnetCategory': None,
            'hrnetLandmarkCount': 0,
            'yoloClass': class_names.get(best['classId']) if best else None,
            'yoloConfidence': round(float(best['confidence']), 3) if best else None,
            'overlay': None,
            'error': None,
        }

        try:
            if best is None:
                raise ValueError('YOLO가 HRNet에 전달할 옷 종류를 찾지 못했어요.')
            category_id = YOLO_CLASS_TO_DEEPFASHION2_CATEGORY.get(best['classId'])
            if category_id is None or category_id not in DEEPFASHION2_CATEGORY_RANGES:
                raise ValueError('HRNet에 대응하는 의류 분류를 찾지 못했어요.')
            row['hrnetCategory'] = category_id

            # HRNet은 단일 옷 사진을 기대해요. 검증된 공통 측정 마스크 상자로 옷만 잘라 넣어요.
            box = baseline['box']
            crop_box = [box['left'], box['top'], box['right'], box['bottom']]
            started = time.perf_counter()
            landmarks = predict_landmarks(hrnet_model, image, crop_box, category_id)
            row['hrnetInferenceMs'] = round((time.perf_counter() - started) * 1000, 1)
            measured = measure_landmark_cloud(landmarks, garment_id, image.shape[:2])
            row.update({
                'hrnetWidthCm': measured['widthCm'],
                'hrnetLengthCm': measured['lengthCm'],
                'hrnetLandmarkCount': measured['landmarkCount'],
            })
            overlay_path = RESULTS / f'{photo_path.stem}-hrnet.png'
            draw_landmark_result(image, landmarks, measured, overlay_path)
            row['overlay'] = overlay_path.name
        except (ValueError, RuntimeError) as error:
            row['error'] = str(error)
        rows.append(row)

    inference_times = [row['hrnetInferenceMs'] for row in rows if row['hrnetInferenceMs'] is not None]
    result = {
        'model': 'HRNet-W48 fashion landmark estimation, DeepFashion2 checkpoint',
        'checkpointSha256': '5b29ada40632cb5ce1aaa38e4896054329c42d0f6c6649a5b9d0b53e41ee04f6',
        'sampleCount': len(rows),
        'opencv': summarize(rows, 'opencv'),
        'hrnet': summarize(rows, 'hrnet'),
        'averageInferenceMs': round(float(np.mean(inference_times)), 1) if inference_times else None,
        'rows': rows,
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / 'hrnet_results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

    report = [
        '# HRNet 의류 기준점 측정 비교', '',
        f"- 비교 사진: {len(rows)}장 (ChArUco 교차 배경)",
        '- 기존 OpenCV 측정과 HRNet 기준점으로 계산한 너비·기장을 파일명 기준 치수와 비교했어요.',
        f"- HRNet 평균 CPU 처리 시간: {result['averageInferenceMs']} ms/장",
        '', '| 사진 | 기준 너비×기장 | OpenCV 측정 | HRNet 측정 | HRNet 종류/점 수 |',
        '|---|---:|---:|---:|---:|',
    ]
    for row in rows:
        hrnet_size = (f"{row['hrnetWidthCm']}×{row['hrnetLengthCm']} cm"
                      if row['hrnetWidthCm'] is not None else row['error'])
        report.append(
            f"| {row['photo']} | {row['referenceWidthCm']}×{row['referenceLengthCm']} cm | "
            f"{row['opencvWidthCm']}×{row['opencvLengthCm']} cm | {hrnet_size} | "
            f"{row['hrnetCategory']} / {row['hrnetLandmarkCount']} |"
        )
    report.extend([
        '', '| 방식 | 너비 평균 절대 오차 | 기장 평균 절대 오차 | 측정 성공 |', '|---|---:|---:|---:|',
        f"| 공통 OpenCV | {result['opencv']['widthMaeCm']} cm | {result['opencv']['lengthMaeCm']} cm | {result['opencv']['measuredCount']}/{len(rows)} |",
        f"| HRNet 기준점 | {result['hrnet']['widthMaeCm']} cm | {result['hrnet']['lengthMaeCm']} cm | {result['hrnet']['measuredCount']}/{len(rows)} |",
        '', '## 실험 조건과 주의할 점',
        '- HRNet의 옷 상자에는 사이트와 데이터셋 페이지가 함께 쓰는 OpenCV 옷 마스크 상자를 사용했어요. 옷 종류는 YOLO 분류 결과를 HRNet의 13개 옷 종류에 대응했어요.',
        '- 점 개수와 너비선을 그림으로 저장했어요. 측정값이 실제 사진의 기준 위치와 맞는지도 그림을 함께 확인해 주세요.',
        '- DeepFashion2 HRNet은 소비자·쇼핑 사진에서 학습됐어요. 이 실험의 평평하게 편 M4 옷 사진과 차이가 있어 일반 정확도를 뜻하지 않아요.',
        '- 표본은 다섯 장뿐이에요. 결과가 좋아도 더 많은 옷과 재촬영으로 확인해야 하고, 기본 앱 파이프라인에는 연결하지 않았어요.',
        '- 공개된 체크포인트의 배포 권한을 확인하지 못해 `server-data/model-cache/`의 실험용으로만 사용했어요.',
        '- 각 사진의 녹색 점·파란 너비선·주황 기장선은 `*-hrnet.png` 파일에서 볼 수 있어요.',
    ])
    (RESULTS / 'hrnet_report.md').write_text('\n'.join(report) + '\n', encoding='utf-8')
    print((RESULTS / 'hrnet_report.md').read_text(encoding='utf-8'))
    return result


if __name__ == '__main__':
    run_comparison()
