import unittest

from experiments.garment_ai.hrnet_experiment import (
    DEEPFASHION2_CATEGORY_RANGES,
    YOLO_CLASS_TO_DEEPFASHION2_CATEGORY,
    crop_for_hrnet,
    measure_landmark_cloud,
)


class HrnetExperimentTests(unittest.TestCase):
    def test_yolo_categories_select_the_matching_hrnet_heatmap_range(self):
        self.assertEqual(YOLO_CLASS_TO_DEEPFASHION2_CATEGORY[0], 1)
        self.assertEqual(YOLO_CLASS_TO_DEEPFASHION2_CATEGORY[7], 8)
        self.assertEqual(DEEPFASHION2_CATEGORY_RANGES[8], (168, 182))

    def test_landmark_cloud_measures_known_width_line_and_full_length(self):
        landmarks = [
            (300, 100, 0.95),
            (150, 220, 0.92),
            (450, 220, 0.91),
            (300, 500, 0.94),
        ]

        result = measure_landmark_cloud(landmarks, garment_id=2, image_size=(848, 600))

        self.assertEqual(result['widthCm'], 42.0)
        self.assertEqual(result['lengthCm'], 56.1)

    def test_landmark_cloud_rejects_missing_measurement_side(self):
        landmarks = [(300, 100, 0.9), (320, 240, 0.95), (300, 350, 0.9), (300, 500, 0.9)]

        with self.assertRaisesRegex(ValueError, '양쪽'):
            measure_landmark_cloud(landmarks, garment_id=2, image_size=(848, 600))

    def test_hrnet_crop_keeps_a_three_to_four_shape_without_stretching(self):
        import numpy as np

        image = np.zeros((848, 600, 3), dtype=np.uint8)
        crop, mapping = crop_for_hrnet(image, [100, 100, 500, 700])

        self.assertEqual(crop.shape, (384, 288, 3))
        self.assertAlmostEqual(mapping['scaleX'], mapping['scaleY'], places=5)


if __name__ == '__main__':
    unittest.main()
