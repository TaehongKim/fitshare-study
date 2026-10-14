import unittest
from unittest.mock import patch

import numpy as np

from tools import vision_pipeline
from tools.vision_pipeline import validate_garment_dimensions


class VisionPipelineMeasurementTests(unittest.TestCase):
    def test_normal_garment_dimensions_are_accepted(self):
        self.assertIsNone(validate_garment_dimensions(52.4, 50.0))

    def test_minimum_supported_garment_length_is_accepted(self):
        self.assertIsNone(validate_garment_dimensions(20.0, 15.0))

    def test_partial_outline_length_is_rejected_as_unreliable(self):
        with self.assertRaisesRegex(ValueError, '옷 전체를 찾지 못했어요'):
            validate_garment_dimensions(30.0, 5.1)

    def test_width_and_length_can_use_independent_masks(self):
        image = np.full((848, 600, 3), 120, dtype=np.uint8)
        width_mask = np.zeros((848, 600), dtype=np.uint8)
        width_mask[120:700, 100:500] = 1
        length_mask = np.zeros((848, 600), dtype=np.uint8)
        length_mask[80:760, 180:420] = 1
        calls = []

        def provider(mask, name):
            def provide(_image, _garment_id):
                calls.append(mask)
                return mask
            provide.mask_method = name
            return provide

        with patch.object(vision_pipeline, '_refine_mask_by_garment_color', side_effect=lambda _i, m, _k: m):
            result = vision_pipeline.measure_garment(
                image, garment_id=2, scale_cm_per_pixel={'x': .1, 'y': .1},
                max_working_long_side=848,
                width_mask_provider=provider(width_mask, 'GrabCut'),
                length_mask_provider=provider(length_mask, 'YOLO→GrabCut'),
            )

        self.assertEqual(result['maskMethods'], {'width': 'GrabCut', 'length': 'YOLO→GrabCut'})
        self.assertAlmostEqual(result['measuredWidthCm'], 40.0, delta=1.0)
        self.assertAlmostEqual(result['measuredLengthCm'], 68.0, delta=1.0)
        self.assertEqual(calls, [width_mask, length_mask])


if __name__ == '__main__':
    unittest.main()
