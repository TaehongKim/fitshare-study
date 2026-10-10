"""Run the optional ONNX clothes model against the existing M4 experiment set."""

import base64
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
import onnxruntime as ort

from experiments.garment_ai.experiment import combine_detections, decode_predictions, measure_mask, preprocess, read_class_names
from experiments.garment_ai.sam_experiment import create_predictor, segment_with_predictor
from tools.vision_pipeline import measure_garment, rectify_photo


DATASET = ROOT / 'measure_dataset' / 'ChaArUco_Cross'
MODEL = ROOT / 'server-data' / 'model-cache' / 'deepfashion2-yolo26s-seg.onnx'
SAM_CHECKPOINT = ROOT / 'server-data' / 'model-cache' / 'sam_vit_b_01ec64.pth'
RESULTS = ROOT / 'experiments' / 'garment_ai' / 'results'
MODEL_URL = 'https://huggingface.co/HasanKabir23/Yolov26s-DeepFashion2/resolve/main/best.onnx'
SAM_URL = 'https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth'
EXPECTED_CLASSES = {
    1: {2, 3, 4, 5},   # 상의 외투: DeepFashion2 outerwear/vest 계열
    2: {0},            # 반소매 크롭 티셔츠
    3: {9, 10, 11, 12},# 원피스 계열
    4: {2, 3, 4, 5},   # 점퍼: DeepFashion2 outerwear 계열
    5: {7},            # 바지
}


def reference_from_filename(path):
    match = re.search(r'_w(\d+)_h(\d+)\.jpg$', path.name)
    if not match:
        raise ValueError(f'기준 치수를 파일명에서 읽을 수 없습니다: {path.name}')
    return float(match.group(1)), float(match.group(2))


def get_model():
    MODEL.parent.mkdir(parents=True, exist_ok=True)
    if not MODEL.exists():
        urlretrieve(MODEL_URL, MODEL)
    return ort.InferenceSession(str(MODEL), providers=['CPUExecutionProvider'])


def get_sam_predictor():
    SAM_CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    if not SAM_CHECKPOINT.exists():
        urlretrieve(SAM_URL, SAM_CHECKPOINT)
    return create_predictor(SAM_CHECKPOINT)


def write_mask_overlay(image, mask, destination, label):
    overlay = image.copy()
    selected = mask.astype(bool)
    color = np.zeros_like(image)
    color[:, :, 2] = 255
    overlay[selected] = cv2.addWeighted(image[selected], 0.52, color[selected], 0.48, 0)
    cv2.putText(overlay, label, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(overlay, label, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1, cv2.LINE_AA)
    destination.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(destination), overlay)


def write_overlay(image, detection, destination):
    mask = detection['mask'].astype(bool)
    overlay = image.copy()
    color = np.zeros_like(image)
    color[:, :, 2] = 255
    overlay[mask] = cv2.addWeighted(image[mask], 0.52, color[mask], 0.48, 0)
    x1, y1, x2, y2 = (int(round(value)) for value in detection['box'])
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 230, 255), 2)
    label = f"{detection['className']} {detection['confidence']:.2f}"
    cv2.putText(overlay, label, (max(3, x1), max(22, y1 - 7)), cv2.FONT_HERSHEY_SIMPLEX,
                0.48, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(overlay, label, (max(3, x1), max(22, y1 - 7)), cv2.FONT_HERSHEY_SIMPLEX,
                0.48, (255, 255, 255), 1, cv2.LINE_AA)
    destination.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(destination), overlay)


def error_average(rows, prefix):
    errors = [abs(row[f'{prefix}WidthCm'] - row['referenceWidthCm']) for row in rows
              if row.get(f'{prefix}WidthCm') is not None]
    length_errors = [abs(row[f'{prefix}LengthCm'] - row['referenceLengthCm']) for row in rows
                     if row.get(f'{prefix}LengthCm') is not None]
    return {
        'widthMaeCm': round(float(np.mean(errors)), 2) if errors else None,
        'lengthMaeCm': round(float(np.mean(length_errors)), 2) if length_errors else None,
        'measuredCount': len(errors),
    }


def main():
    if not DATASET.exists():
        raise SystemExit(f'측정 데이터 폴더를 찾지 못했습니다: {DATASET}')
    session = get_model()
    sam_predictor = get_sam_predictor()
    names = read_class_names(session)
    RESULTS.mkdir(parents=True, exist_ok=True)
    rows = []

    for photo_path in sorted(DATASET.glob('*.jpg')):
        match = re.search(r'chc_(\d+)_', photo_path.name)
        if not match:
            continue
        garment_id = int(match.group(1))
        reference_width, reference_length = reference_from_filename(photo_path)
        flattened = rectify_photo(photo_path.read_bytes(), 'M4')
        current = measure_garment(flattened['image'], garment_id=garment_id)
        tensor, _ = preprocess(flattened['image'], 416)
        started = time.perf_counter()
        output0, output1 = session.run(None, {'images': tensor})
        inference_ms = round((time.perf_counter() - started) * 1000, 1)
        detections = decode_predictions(output0, output1, flattened['image'].shape[:2], 416)
        best = combine_detections(detections, garment_id)

        row = {
            'photo': photo_path.name,
            'garmentId': garment_id,
            'referenceWidthCm': reference_width,
            'referenceLengthCm': reference_length,
            'opencvWidthCm': current['measuredWidthCm'],
            'opencvLengthCm': current['measuredLengthCm'],
            'opencvClass': '종류 ID를 직접 입력',
            'yoloConfidence': round(best['confidence'], 3) if best else None,
            'yoloClassId': best['classId'] if best else None,
            'yoloClass': names.get(best['classId'], '옷을 찾지 못함') if best else '옷을 찾지 못함',
            'yoloClassCorrect': best['classId'] in EXPECTED_CLASSES[garment_id] if best else False,
            'inferenceMs': inference_ms,
            'samInferenceMs': None,
            'yoloWidthCm': None,
            'yoloLengthCm': None,
            'yoloMeasurementError': None,
            'samWidthCm': None,
            'samLengthCm': None,
            'samMeasurementError': None,
            'overlay': None,
            'samOverlay': None,
        }
        try:
            if best is None:
                raise ValueError('모델이 옷을 찾지 못했습니다.')
            measurements = measure_mask(best['mask'], garment_id)
            row['yoloWidthCm'] = measurements['widthCm']
            row['yoloLengthCm'] = measurements['lengthCm']
            overlay_path = RESULTS / f'{photo_path.stem}-yolo.png'
            write_overlay(flattened['image'], best, overlay_path)
            row['overlay'] = overlay_path.name
        except ValueError as error:
            row['yoloMeasurementError'] = str(error)
        try:
            sam_started = time.perf_counter()
            sam_mask = segment_with_predictor(sam_predictor, flattened['image'], garment_id)
            row['samInferenceMs'] = round((time.perf_counter() - sam_started) * 1000, 1)
            sam_measurements = measure_mask(sam_mask, garment_id, full_silhouette=True)
            row['samWidthCm'] = sam_measurements['widthCm']
            row['samLengthCm'] = sam_measurements['lengthCm']
            sam_path = RESULTS / f'{photo_path.stem}-sam.png'
            write_mask_overlay(flattened['image'], sam_mask, sam_path, 'SAM prompted mask')
            row['samOverlay'] = sam_path.name
        except ValueError as error:
            row['samMeasurementError'] = str(error)
        rows.append(row)

        overlay_bytes = base64.b64decode(current['overlayDataUrl'].split(',', 1)[1])
        (RESULTS / f'{photo_path.stem}-opencv.jpg').write_bytes(overlay_bytes)

    timings = [row['inferenceMs'] for row in rows]
    sam_timings = [row['samInferenceMs'] for row in rows if row['samInferenceMs'] is not None]
    result = {
        'model': str(MODEL.relative_to(ROOT)).replace('\\', '/'),
        'modelSha256': hashlib.sha256(MODEL.read_bytes()).hexdigest(),
        'samCheckpointSha256': hashlib.sha256(SAM_CHECKPOINT.read_bytes()).hexdigest(),
        'onnxMetadata': session.get_modelmeta().custom_metadata_map,
        'classNames': names,
        'sampleCount': len(rows),
        'yoloClassAccuracy': round(sum(row['yoloClassCorrect'] for row in rows) / len(rows), 3) if rows else None,
        'opencv': error_average(rows, 'opencv'),
        'yolo': error_average(rows, 'yolo'),
        'sam': error_average(rows, 'sam'),
        'averageInferenceMs': round(float(np.mean(timings)), 1) if timings else None,
        'samAverageInferenceMs': round(float(np.mean(sam_timings)), 1) if sam_timings else None,
        'rows': rows,
    }
    (RESULTS / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

    report_lines = [
        '# DeepFashion2 옷 분할 모델 실험', '',
        f"- 사진: {len(rows)}장 (M4 ChArUco 교차 배경)",
        f"- 모델 파일 SHA-256: `{result['modelSha256']}`",
        f"- SAM ViT-B 체크포인트 SHA-256: `{result['samCheckpointSha256']}`",
        f"- ONNX 메타데이터 설명: `{session.get_modelmeta().custom_metadata_map.get('description', '없음')}`",
        f"- 메타데이터 라이선스: `{session.get_modelmeta().custom_metadata_map.get('license', '없음')}`",
        f"- 카드의 클래스 분류 정확도(5장): {result['yoloClassAccuracy']}",
        f"- YOLO 평균 CPU 추론 시간: {result['averageInferenceMs']} ms/장",
        f"- SAM 평균 CPU 추론 시간: {result['samAverageInferenceMs']} ms/장", '',
        '| 사진 | 기준 종류 | AI 분류 | 신뢰도 | 기준 너비×기장 | OpenCV | YOLO 마스크 | SAM 마스크 |',
        '|---|---|---|---:|---:|---:|---:|---:|',
    ]
    for row in rows:
        ai_size = (f"{row['yoloWidthCm']}×{row['yoloLengthCm']} cm" if row['yoloWidthCm'] is not None
                   else row['yoloMeasurementError'])
        sam_size = (f"{row['samWidthCm']}×{row['samLengthCm']} cm" if row['samWidthCm'] is not None
                    else row['samMeasurementError'])
        report_lines.append(
            f"| {row['photo']} | {row['garmentId']}번 | {row['yoloClass']} | {row['yoloConfidence']} | "
            f"{row['referenceWidthCm']}×{row['referenceLengthCm']} cm | "
            f"{row['opencvWidthCm']}×{row['opencvLengthCm']} cm | {ai_size} | {sam_size} |"
        )
    report_lines.extend([
        '', '| 방식 | 너비 MAE | 기장 MAE | 측정 성공 |', '|---|---:|---:|---:|',
        f"| OpenCV 기준 | {result['opencv']['widthMaeCm']} cm | {result['opencv']['lengthMaeCm']} cm | {result['opencv']['measuredCount']}/{len(rows)} |",
        f"| YOLO 마스크 | {result['yolo']['widthMaeCm']} cm | {result['yolo']['lengthMaeCm']} cm | {result['yolo']['measuredCount']}/{len(rows)} |",
        f"| SAM 마스크 | {result['sam']['widthMaeCm']} cm | {result['sam']['lengthMaeCm']} cm | {result['sam']['measuredCount']}/{len(rows)} |",
        '', '## 읽을 때 주의할 점',
        '- 파일명에 기록된 기준 치수와 자동 측정치를 비교한 작은 표본 실험이다. 사진이 5장뿐이므로 일반 정확도를 뜻하지 않는다.',
        '- DeepFashion2 옷 종류를 프로젝트의 5종에 대응시킨 정확도는 거친 범주 비교다. 상의 외투와 점퍼는 같은 외투 계열로 묶었다.',
        '- 모델 카드가 보고한 성능을 그대로 옮기지 않았다. 실제 측정 결과와 모델 파일 메타데이터를 함께 남겼다.',
        '- YOLO 모델 카드 설명과 ONNX 안의 이름·학습 경로·라이선스 정보가 일치하지 않는다. DeepFashion2로 학습한 모델이라고 확정할 수 없으므로 참고용 비교로만 취급한다.',
        '- SAM 점 위치는 옷 종류별 고정 비율로 자동 제안했다. 실제 옷 위치가 다르면 마스크 결과도 나빠질 수 있다.',
        '- YOLO와 SAM은 빨간색으로 찾은 옷 영역을 표시한다. YOLO의 노란색 상자는 모델 경계 상자다. 각 사진의 비교 그림은 이 폴더에 있다.',
    ])
    (RESULTS / 'report.md').write_text('\n'.join(report_lines) + '\n', encoding='utf-8')
    print((RESULTS / 'report.md').read_text(encoding='utf-8'))


if __name__ == '__main__':
    main()

