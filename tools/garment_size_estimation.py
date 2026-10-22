"""Estimate a Korean kidswear size from reference garment dimensions.

These are approximate comparison references, not a universal or official size chart.
"""

import math


REFERENCES = {
    'top': ((30, 42), (32, 46), (34, 50), (36, 54), (38, 58), (41, 62), (44, 66)),
    'dress': ((28, 54), (30, 60), (32, 66), (34, 72), (36, 78), (38, 84), (40, 90)),
    'pants': ((22, 56), (23, 62), (24, 68), (25, 74), (26.5, 80), (28, 86), (29.5, 92)),
}
LABELS = ('100', '110', '120', '130', '140', '150', '160')


def estimate_korean_size(category, width_cm, length_cm):
    """Return the closest reference label using normalized width and length error."""
    if category not in REFERENCES:
        raise ValueError('옷 종류에 맞는 참고 치수표가 없어요.')
    try:
        width = float(width_cm)
        length = float(length_cm)
    except (TypeError, ValueError) as error:
        raise ValueError('너비와 길이 실측값이 필요해요.') from error
    if not (math.isfinite(width) and math.isfinite(length) and width > 0 and length > 0):
        raise ValueError('너비와 길이는 0보다 커야 해요.')

    candidates = REFERENCES[category]
    return min(
        LABELS,
        key=lambda label: (
            abs(candidates[LABELS.index(label)][0] - width) / width
            + abs(candidates[LABELS.index(label)][1] - length) / length
        ) / 2,
    )
