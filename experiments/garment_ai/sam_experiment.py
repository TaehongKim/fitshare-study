"""Optional SAM ViT-B mask comparison using simple garment-specific point prompts."""

import numpy as np


def prompt_points(garment_id, width, height):
    """Choose positive points on the garment and negative points on the empty mat."""
    positive_ratios = {
        1: [(0.50, 0.40)],
        2: [(0.50, 0.40)],
        3: [(0.50, 0.50)],
        4: [(0.50, 0.40)],
        # 바지는 다리 두 쪽을 각각 찍어 한 벌 마스크로 합쳐지는지 확인합니다.
        5: [(0.36, 0.58), (0.64, 0.58)],
    }
    if garment_id not in positive_ratios:
        raise ValueError('실험 옷 종류는 1부터 5까지 골라 주세요.')
    points = [(round(x * width), round(y * height)) for x, y in positive_ratios[garment_id]]
    labels = [1] * len(points)
    # 옷의 양옆은 사진마다 넓이가 달라 음성 점을 찍지 않고, 위/아래 빈 곳만 씁니다.
    negatives = [(0.50, 0.08), (0.50, 0.94)]
    points.extend((round(x * width), round(y * height)) for x, y in negatives)
    labels.extend([0] * len(negatives))
    return np.asarray(points, dtype=np.float32), np.asarray(labels, dtype=np.int32)


def segment_with_predictor(predictor, image, garment_id):
    """Ask SAM for three masks and prefer one covering the garment seed points only."""
    rgb_image = image[:, :, ::-1].copy()
    height, width = rgb_image.shape[:2]
    points, labels = prompt_points(garment_id, width, height)
    predictor.set_image(rgb_image)
    masks, scores, _ = predictor.predict(
        point_coords=points,
        point_labels=labels,
        multimask_output=True,
    )

    positive = points[labels == 1].astype(int)
    negative = points[labels == 0].astype(int)
    ranked = []
    for index, mask in enumerate(masks):
        positive_inside = sum(bool(mask[y, x]) for x, y in positive)
        negative_inside = sum(bool(mask[y, x]) for x, y in negative)
        # A mask must include all garment hints; empty mat hints should stay outside.
        if positive_inside != len(positive):
            continue
        rank = float(scores[index]) - negative_inside
        ranked.append((rank, mask))
    if not ranked:
        raise ValueError('SAM이 옷을 한 덩어리로 찾지 못했어요. 촬영 위치를 확인해 주세요.')
    selected = max(ranked, key=lambda item: item[0])[1]
    return np.asarray(selected, dtype=np.uint8)


def create_predictor(checkpoint_path):
    """Load SAM only when running this optional comparison experiment."""
    try:
        import torch
        from segment_anything import SamPredictor, sam_model_registry
    except ImportError as error:
        raise RuntimeError('SAM 실험을 하려면 experiments/garment_ai/requirements.txt를 설치해 주세요.') from error
    torch.set_num_threads(2)
    model = sam_model_registry['vit_b'](checkpoint=str(checkpoint_path))
    model.to(device='cpu')
    return SamPredictor(model)
