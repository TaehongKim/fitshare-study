"""Compare a DeepFashion2-trained ONNX segmenter with the OpenCV baseline."""

import ast
import cv2
import numpy as np

from tools.vision_pipeline import A0_HEIGHT_CM, A0_WIDTH_CM, GARMENT_PROFILES


CLASS_NAMES = {
    0: 'short_sleeve_top', 1: 'long_sleeve_top',
    2: 'short_sleeve_outwear', 3: 'long_sleeve_outwear',
    4: 'vest', 5: 'sling', 6: 'shorts', 7: 'trousers', 8: 'skirt',
    9: 'short_sleeve_dress', 10: 'long_sleeve_dress',
    11: 'vest_dress', 12: 'sling_dress',
}


def preprocess(image, input_size=416):
    """Resize without stretching and return the exact padding for reversing it."""
    height, width = image.shape[:2]
    scale = min(input_size / width, input_size / height)
    resized_width = round(width * scale)
    resized_height = round(height * scale)
    resized = cv2.resize(image, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)
    pad_left = (input_size - resized_width) // 2
    pad_top = (input_size - resized_height) // 2
    canvas = np.full((input_size, input_size, 3), 114, dtype=np.uint8)
    canvas[pad_top:pad_top + resized_height, pad_left:pad_left + resized_width] = resized
    tensor = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    tensor = np.transpose(tensor, (2, 0, 1))[None, ...]
    return tensor, (scale, pad_left, pad_top, resized_width, resized_height)


def decode_predictions(output0, output1, original_shape, input_size=416, confidence_threshold=0.25):
    """Turn YOLO26's box, class, mask coefficients, and prototype into clothing masks."""
    predictions = np.asarray(output0)[0]
    prototypes = np.asarray(output1)[0]
    height, width = original_shape
    scale = min(input_size / width, input_size / height)
    resized_width = round(width * scale)
    resized_height = round(height * scale)
    pad_left = (input_size - resized_width) // 2
    pad_top = (input_size - resized_height) // 2
    prototype_count, prototype_height, prototype_width = prototypes.shape
    results = []

    for row in predictions:
        score = float(row[4])
        class_id = int(row[5])
        if score < confidence_threshold or class_id not in CLASS_NAMES:
            continue

        x1, y1, x2, y2 = (float(value) for value in row[:4])
        logits = row[6:6 + prototype_count] @ prototypes.reshape(prototype_count, -1)
        logits = logits.reshape(prototype_height, prototype_width)
        logits = cv2.resize(logits, (input_size, input_size), interpolation=cv2.INTER_LINEAR)
        left = max(0, min(input_size, int(round(x1))))
        right = max(0, min(input_size, int(round(x2))))
        top = max(0, min(input_size, int(round(y1))))
        bottom = max(0, min(input_size, int(round(y2))))
        cropped_logits = np.full((input_size, input_size), -20, dtype=np.float32)
        if right > left and bottom > top:
            cropped_logits[top:bottom, left:right] = logits[top:bottom, left:right]
        model_mask = (cropped_logits > 0).astype(np.uint8)
        content_mask = model_mask[pad_top:pad_top + resized_height, pad_left:pad_left + resized_width]
        full_mask = cv2.resize(content_mask, (width, height), interpolation=cv2.INTER_NEAREST)
        if int(full_mask.sum()) < height * width * 0.002:
            continue

        results.append({
            'classId': class_id,
            'className': CLASS_NAMES[class_id],
            'confidence': score,
            'box': [
                max(0.0, (x1 - pad_left) / scale), max(0.0, (y1 - pad_top) / scale),
                min(float(width), (x2 - pad_left) / scale), min(float(height), (y2 - pad_top) / scale),
            ],
            'mask': full_mask,
        })
    return sorted(results, key=lambda item: item['confidence'], reverse=True)


def measure_mask(mask, garment_id, full_silhouette=False):
    """Measure a model mask using the experiment's existing type-specific rules."""
    profile = GARMENT_PROFILES[garment_id]
    binary = (np.asarray(mask) > 0).astype(np.uint8)
    height, width = binary.shape
    spans = np.zeros(height, dtype=np.float32)
    for y in range(height):
        columns = np.flatnonzero(binary[y])
        if len(columns) >= 2:
            spans[y] = columns[-1] - columns[0] + 1

    maximum_span = float(spans.max())
    if maximum_span < width * 0.08:
        raise ValueError('옷 전체 마스크를 찾지 못했어요.')
    if full_silhouette:
        # SAM은 옷 가장자리를 바로 돌려주므로 소매처럼 넓은 부분이 기장 계산을 자르지 않게 합니다.
        garment_rows = np.flatnonzero(spans >= max(2, round(maximum_span * 0.08)))
        length_rows = garment_rows
    else:
        length_rows = np.flatnonzero(spans >= maximum_span * profile.get('lengthSpanRatio', 0.55))
        garment_rows = np.flatnonzero(spans >= maximum_span * 0.55)
    if len(length_rows) < height * 0.12 or len(garment_rows) < height * 0.12:
        raise ValueError('옷 전체 마스크를 찾지 못했어요.')
    top = int(length_rows[0])
    bottom = int(length_rows[-1])
    if len(garment_rows) < height * 0.12:
        raise ValueError('옷 전체 마스크를 찾지 못했어요.')

    width_top = int(garment_rows[0])
    width_bottom = int(garment_rows[-1])
    target_y = int(width_top + (width_bottom - width_top) * profile['widthRatio'])
    band_radius = max(2, round((width_bottom - width_top) * 0.012))
    band = spans[max(width_top, target_y - band_radius):min(width_bottom + 1, target_y + band_radius + 1)]
    span_floor = maximum_span * (0.08 if full_silhouette else 0.33)
    valid = band[band > span_floor]
    if len(valid) == 0:
        raise ValueError('옷 너비를 찾지 못했어요.')

    length_cm = (bottom - top) * A0_HEIGHT_CM / height
    width_cm = float(np.median(valid)) * A0_WIDTH_CM / width
    if not (15 <= length_cm <= 300 and 5 <= width_cm <= 200):
        raise ValueError('옷 전체 마스크를 찾지 못했어요.')
    return {'lengthCm': round(length_cm, 1), 'widthCm': round(width_cm, 1)}


def read_class_names(session):
    """Use names saved in the ONNX model, with the published category order as fallback."""
    raw_names = session.get_modelmeta().custom_metadata_map.get('names')
    if not raw_names:
        return CLASS_NAMES
    parsed = ast.literal_eval(raw_names)
    return {int(key): str(value) for key, value in parsed.items()}


def combine_detections(detections, garment_id):
    """Join both trouser legs when the model reports them as separate pieces."""
    if not detections:
        return None
    chosen = detections[0]
    if garment_id != 5:
        return chosen
    legs = [item for item in detections if item['classId'] == 7]
    if not legs:
        return chosen
    combined = dict(legs[0])
    combined['mask'] = np.maximum.reduce([item['mask'] for item in legs]).astype(np.uint8)
    combined['box'] = [
        min(item['box'][0] for item in legs), min(item['box'][1] for item in legs),
        max(item['box'][2] for item in legs), max(item['box'][3] for item in legs),
    ]
    return combined

