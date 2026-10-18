"""Prepare a display-only transparent texture; never changes measurement results."""


def make_tryon_photo(source, category, bottom_length=''):
    import cv2
    try:
        return _make_tryon_photo(source, category, bottom_length)
    except cv2.error as error:
        raise ValueError('입어보기용 옷 사진을 분리하지 못했어요. 다른 옷으로 다시 시도해 주세요.') from error


def _make_tryon_photo(source, category, bottom_length=''):
    import cv2
    import numpy as np
    from tools.tryon_segmentation import detect_clothing, refine_clothing

    if category not in ('top', 'pants'):
        raise ValueError('상의와 하의만 가상으로 입어볼 수 있어요.')
    image = cv2.imdecode(np.frombuffer(source, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None or image.ndim != 3 or image.shape[2] not in (3, 4):
        raise ValueError('옷 사진을 읽지 못했어요.')
    h, w = image.shape[:2]
    scale = min(1, 848 / max(w, h))
    if scale < 1:
        image = cv2.resize(image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    has_alpha = image.shape[2] == 4 and image[:, :, 3].min() < 20 and image[:, :, 3].max() > 200
    if not has_alpha:
        bgr = image[:, :, :3].copy()
        # Unlike registration measurement, this is an uncalibrated display texture.
        # Category matching also allows shorts (garment type 5 alone means trousers).
        seed = detect_clothing(bgr, category, bottom_length)
        mask, _ = refine_clothing(bgr, seed)
        image = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
        image[:, :, 3] = (mask > 0).astype(np.uint8) * 255
    foreground = (image[:, :, 3] > 20).astype(np.uint8)
    if foreground.sum() < foreground.size * .005 or foreground.sum() > foreground.size * .98:
        raise ValueError('옷만 분리하지 못했어요. 옷 전체가 보이는 사진을 확인해 주세요.')
    x, y, w, h = cv2.boundingRect(foreground)
    texture = image[y:y+h, x:x+w]
    ok, encoded = cv2.imencode('.png', texture)
    if not ok:
        raise ValueError('입어보기용 옷 사진을 만들지 못했어요.')
    return encoded.tobytes()


def original_tryon_source(garment_dir, item):
    """Re-read original pixels; a previously clipped PNG cannot recover a sleeve."""
    import cv2
    from tools.vision_pipeline import rectify_photo
    source = (garment_dir / 'photo.jpg').read_bytes()
    if item.get('closetPhotoSource') == 'provided-garment-only':
        return source
    # Registered mat photos must be rectified without reusing their old mask.
    try:
        flattened = rectify_photo(source, item.get('backgroundId', 'M4'), preserve_resolution=True, max_output_long_side=848)
    except (cv2.error, ValueError):
        return source
    if flattened.get('ok'):
        ok, encoded = cv2.imencode('.png', flattened['image'])
        if ok:
            return encoded.tobytes()
    # Uncalibrated manually registered photos still contain original sleeve pixels.
    return source
