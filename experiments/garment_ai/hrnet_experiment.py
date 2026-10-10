"""Helpers for comparing DeepFashion2 HRNet garment landmarks."""

from __future__ import annotations

import hashlib
import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
from urllib.request import urlretrieve

import cv2
import numpy as np

from tools.vision_pipeline import A0_HEIGHT_CM, A0_WIDTH_CM, GARMENT_PROFILES


ROOT = Path(__file__).resolve().parents[2]
HRNET_SOURCE = Path(__file__).resolve().parent / 'hrnet' / 'pose_hrnet.py'
CHECKPOINT = ROOT / 'server-data' / 'model-cache' / 'pose_hrnet-w48-384x288-deepfashion2.pth'
CHECKPOINT_URL = (
    'https://huggingface.co/Seoksee/MY_MODEL_FILE/resolve/main/'
    'pose_hrnet-w48_384x288-deepfashion2_mAP_0.7017.pth'
)
CHECKPOINT_SHA256 = '5b29ada40632cb5ce1aaa38e4896054329c42d0f6c6649a5b9d0b53e41ee04f6'

# DeepFashion2가 정의한 카테고리별 294개 기준점의 시작·끝 번호예요.
DEEPFASHION2_CATEGORY_RANGES = {
    1: (0, 25), 2: (25, 58), 3: (58, 89), 4: (89, 128),
    5: (128, 143), 6: (143, 158), 7: (158, 168), 8: (168, 182),
    9: (182, 190), 10: (190, 219), 11: (219, 256), 12: (256, 275), 13: (275, 294),
}

# YOLO 의류 분류 번호(0부터 시작)를 DeepFashion2 HRNet 카테고리로 바꿔요.
YOLO_CLASS_TO_DEEPFASHION2_CATEGORY = {
    0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7,
    7: 8, 8: 9, 9: 10, 10: 11, 11: 12, 12: 13,
}


def measure_landmark_cloud(landmarks, garment_id, image_size, minimum_score=0.2):
    """Use HRNet's contour points to estimate the known width line and full length."""
    if garment_id not in GARMENT_PROFILES:
        raise ValueError('옷 종류를 확인해 주세요.')
    image_height, image_width = image_size
    points = np.asarray([
        (x, y) for x, y, score in landmarks
        if score >= minimum_score and 0 <= x < image_width and 0 <= y < image_height
    ], dtype=np.float32)
    if len(points) < 4:
        raise ValueError('HRNet이 옷 기준점을 충분히 찾지 못했어요.')

    top_y = float(points[:, 1].min())
    bottom_y = float(points[:, 1].max())
    garment_height = bottom_y - top_y
    if garment_height < image_height * 0.12:
        raise ValueError('HRNet이 옷의 위아래 끝을 찾지 못했어요.')

    target_y = top_y + garment_height * GARMENT_PROFILES[garment_id]['widthRatio']
    center_x = float((points[:, 0].min() + points[:, 0].max()) / 2)
    center_gap = image_width * 0.015
    left_points = points[points[:, 0] < center_x - center_gap]
    right_points = points[points[:, 0] > center_x + center_gap]
    if len(left_points) == 0 or len(right_points) == 0:
        raise ValueError('너비선의 양쪽 옷 기준점을 찾지 못했어요.')

    left_x = float(np.interp(target_y, np.sort(left_points[:, 1]), left_points[np.argsort(left_points[:, 1]), 0]))
    right_x = float(np.interp(target_y, np.sort(right_points[:, 1]), right_points[np.argsort(right_points[:, 1]), 0]))
    if right_x - left_x < image_width * 0.05:
        raise ValueError('너비선의 양쪽 옷 기준점을 찾지 못했어요.')

    return {
        'widthCm': round((right_x - left_x) * A0_WIDTH_CM / image_width, 1),
        'lengthCm': round(garment_height * A0_HEIGHT_CM / image_height, 1),
        'topY': round(top_y), 'bottomY': round(bottom_y),
        'widthLineY': round(target_y), 'leftX': round(left_x), 'rightX': round(right_x),
        'landmarkCount': int(len(points)),
    }


def crop_for_hrnet(image, box, input_width=288, input_height=384):
    """Crop one detected garment and preserve its shape for HRNet's 3:4 input."""
    image_height, image_width = image.shape[:2]
    left, top, right, bottom = (float(value) for value in box)
    box_width = max(2.0, right - left)
    box_height = max(2.0, bottom - top)
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2
    crop_width = box_width * 1.12
    crop_height = box_height * 1.12
    target_ratio = input_width / input_height
    if crop_width / crop_height > target_ratio:
        crop_height = crop_width / target_ratio
    else:
        crop_width = crop_height * target_ratio

    scale_x = input_width / crop_width
    scale_y = input_height / crop_height
    transform = np.asarray([
        [scale_x, 0, input_width / 2 - center_x * scale_x],
        [0, scale_y, input_height / 2 - center_y * scale_y],
    ], dtype=np.float32)
    crop = cv2.warpAffine(
        image, transform, (input_width, input_height), flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return crop, {
        'centerX': center_x, 'centerY': center_y,
        'scaleX': scale_x, 'scaleY': scale_y,
        'imageWidth': image_width, 'imageHeight': image_height,
    }


def _config_node(value):
    if isinstance(value, dict):
        return ConfigNode({key: _config_node(part) for key, part in value.items()})
    return value


class ConfigNode(dict):
    """Small YACS-style config for loading this fixed, optional HRNet model."""

    __getattr__ = dict.__getitem__


def _model_config():
    def stage(modules, branches, blocks, channels):
        return {
            'NUM_MODULES': modules, 'NUM_BRANCHES': branches, 'BLOCK': 'BASIC',
            'NUM_BLOCKS': blocks, 'NUM_CHANNELS': channels, 'FUSE_METHOD': 'SUM',
        }

    return _config_node({
        'MODEL': {
            'NAME': 'pose_hrnet', 'TARGET_TYPE': 'gaussian', 'NUM_JOINTS': 294,
            'EXTRA': {
                'FINAL_CONV_KERNEL': 1,
                'PRETRAINED_LAYERS': [
                    'conv1', 'bn1', 'conv2', 'bn2', 'layer1', 'transition1',
                    'stage2', 'transition2', 'stage3', 'transition3', 'stage4',
                ],
                'STAGE2': stage(1, 2, [4, 4], [48, 96]),
                'STAGE3': stage(4, 3, [4, 4, 4], [48, 96, 192]),
                'STAGE4': stage(3, 4, [4, 4, 4, 4], [48, 96, 192, 384]),
            },
        },
    })


def load_hrnet_model():
    """Load the official HRNet model code and its checksum-checked weights."""
    import torch

    if not CHECKPOINT.exists():
        CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
        urlretrieve(CHECKPOINT_URL, CHECKPOINT)
    checkpoint_hash = hashlib.sha256()
    with CHECKPOINT.open('rb') as checkpoint_file:
        for chunk in iter(lambda: checkpoint_file.read(8 * 1024 * 1024), b''):
            checkpoint_hash.update(chunk)
    digest = checkpoint_hash.hexdigest()
    if digest != CHECKPOINT_SHA256:
        raise RuntimeError('HRNet 체크포인트 확인값이 맞지 않아요. 파일을 다시 받아 주세요.')
    if not HRNET_SOURCE.exists():
        raise RuntimeError('실험에 포함된 HRNet 모델 코드를 찾지 못했어요.')

    spec = importlib.util.spec_from_file_location('fitshare_hrnet_pose', HRNET_SOURCE)
    if spec is None or spec.loader is None:
        raise RuntimeError('HRNet 모델 코드를 불러오지 못했어요.')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    model = module.get_pose_net(_model_config(), is_train=False)
    state = torch.load(CHECKPOINT, map_location='cpu', weights_only=True)
    model.load_state_dict(state, strict=True)
    model.eval()
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    return model


def predict_landmarks(model, image, box, category_id, minimum_score=0.2):
    """Run HRNet and return this clothing category's landmarks in photo pixels."""
    import torch

    if category_id not in DEEPFASHION2_CATEGORY_RANGES:
        raise ValueError('HRNet 의류 종류를 확인해 주세요.')
    crop, mapping = crop_for_hrnet(image, box)
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    mean = np.asarray([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.asarray([0.229, 0.224, 0.225], dtype=np.float32)
    tensor = torch.from_numpy(((rgb - mean) / std).transpose(2, 0, 1)[None])
    with torch.inference_mode():
        heatmaps = model(tensor)[0].cpu().numpy()

    start, end = DEEPFASHION2_CATEGORY_RANGES[category_id]
    input_width, input_height = crop.shape[1], crop.shape[0]
    heatmap_height, heatmap_width = heatmaps.shape[1:]
    landmarks = []
    for landmark_id, heatmap in enumerate(heatmaps[start:end], start=1):
        flat_index = int(np.argmax(heatmap))
        y_heat, x_heat = divmod(flat_index, heatmap_width)
        score = float(heatmap[y_heat, x_heat])
        if score < minimum_score:
            continue
        x_input = x_heat * input_width / heatmap_width
        y_input = y_heat * input_height / heatmap_height
        x_photo = (x_input - input_width / 2) / mapping['scaleX'] + mapping['centerX']
        y_photo = (y_input - input_height / 2) / mapping['scaleY'] + mapping['centerY']
        landmarks.append((float(x_photo), float(y_photo), score))
    return landmarks
