"""Display-only segmentation: semantic clothing seed + border-connected background.

This deliberately does not change registration measurements or product-photo SAM.
"""
import threading

import cv2
import numpy as np

_lock = threading.Lock()


def detect_clothing(image, category, bottom_length=''):
    from tools.garment_segmentation import _load_detector
    detector = _load_detector()
    kind = 5 if category == 'pants' and bottom_length != '반바지' else None
    try:
        return detector.detect(image, garment_id=kind, category=category)['mask'] > 0
    except ValueError:
        if kind is None:
            raise
        return detector.detect(image, category=category)['mask'] > 0


def border_background(image):
    """Find background connected to image edges, not every similarly colored pixel."""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
    h, w = image.shape[:2]
    band = max(1, round(min(h, w) * .015))
    edge = np.zeros((h, w), bool)
    edge[:band] = edge[-band:] = True
    edge[:, :band] = edge[:, -band:] = True
    samples = lab[edge]
    color = np.median(samples, axis=0)
    distance = np.linalg.norm(lab - color, axis=2)
    border_distances = distance[edge]
    # Allow small JPEG noise; do not raise the threshold until a white shirt vanishes.
    noise = float(np.percentile(border_distances, 70))
    threshold = float(np.clip(noise * 2 + 3, 3, 14))
    uniform = float(np.mean(border_distances <= threshold)) >= .85
    compatible = (distance <= threshold).astype(np.uint8)
    _, labels = cv2.connectedComponents(compatible, connectivity=8)
    boundary = np.unique(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1])))
    boundary = boundary[boundary != 0]
    connected = np.isin(labels, boundary)
    return connected, distance, threshold, uniform


def connected_to_seed(candidate, seed):
    count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate.astype(np.uint8), connectivity=8)
    # One pass over pixels instead of one full-image scan per dust speck.
    overlap = np.bincount(labels.ravel(), weights=seed.ravel(), minlength=count)
    minimum = np.maximum(3, (stats[:, cv2.CC_STAT_AREA] * .005).astype(int))
    accepted = overlap >= minimum
    accepted[0] = False
    return accepted[labels]


def refine_clothing(image, seed):
    """Prefer a complete silhouette to a graph-cut that silently deletes sleeves."""
    seed = np.asarray(seed, dtype=bool)
    if seed.shape != image.shape[:2] or seed.sum() < seed.size * .005 or seed.sum() > seed.size * .995:
        raise ValueError('옷의 위치를 찾지 못했어요. 옷 전체가 보이는 사진을 확인해 주세요.')
    kernel = np.ones((3, 3), np.uint8)
    background, distance, threshold, uniform = border_background(image)
    outline = connected_to_seed(~background, seed)
    core = cv2.erode(seed.astype(np.uint8), kernel) > 0
    if not core.any():
        core = seed.copy()
    recall = float(np.count_nonzero(outline & core) / max(1, core.sum()))
    area_ratio = float(outline.sum() / max(1, seed.sum()))
    # Clean, uniform product backgrounds: color connectivity supplies the detailed
    # sleeves even if the low-resolution semantic mask only captured the body.
    if uniform and recall >= .90 and .60 <= area_ratio <= 2.5 and outline.sum() < outline.size * .95:
        mask = outline
        method = 'border-connected+YOLO'
    else:
        # On nonuniform photographs use graph-cut with a small, protected core.
        # The former 2% erosion could erase thin cuffs entirely.
        possible = cv2.dilate(seed.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        if uniform:
            possible |= outline
        labels = np.full(seed.shape, cv2.GC_PR_BGD, np.uint8)
        labels[seed] = cv2.GC_PR_FGD
        labels[core] = cv2.GC_FGD
        labels[~possible] = cv2.GC_BGD
        labels[0] = labels[-1] = cv2.GC_BGD
        labels[:, 0] = labels[:, -1] = cv2.GC_BGD
        with _lock:
            cv2.setRNGSeed(0)
            cv2.grabCut(image, labels, None, np.zeros((1, 65)), np.zeros((1, 65)), 3, cv2.GC_INIT_WITH_MASK)
        mask = (labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)
        mask = connected_to_seed(mask, seed)
        retained = float(np.count_nonzero(mask & core) / max(1, core.sum()))
        if retained < .97:
            mask |= core
        method = 'protected-YOLO+GrabCut'
    # One-pixel cleanup instead of aggressive opening that cuts off narrow cuffs.
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, kernel) > 0
    return mask, {'method': method, 'uniformBackground': bool(uniform),
                  'semanticCoreRecall': round(recall, 4), 'foregroundPixels': int(mask.sum())}
