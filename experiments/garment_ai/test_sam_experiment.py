import unittest

import numpy as np

from experiments.garment_ai.sam_experiment import prompt_points, segment_with_predictor


class FakePredictor:
    def __init__(self, masks, scores):
        self.masks = masks
        self.scores = scores
        self.kwargs = None

    def set_image(self, image):
        self.image = image

    def predict(self, **kwargs):
        self.kwargs = kwargs
        return self.masks, self.scores, None


class SamExperimentTests(unittest.TestCase):
    def test_pants_prompt_marks_both_legs_as_positive(self):
        points, labels = prompt_points(5, width=600, height=848)

        self.assertEqual(sum(labels == 1), 2)
        self.assertLess(points[0][0], 300)
        self.assertGreater(points[1][0], 300)

    def test_selector_prefers_mask_covering_both_legs_and_avoiding_background(self):
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        points = np.array([[35, 60], [65, 60]])
        mask_left = np.zeros((100, 100), dtype=bool)
        mask_left[40:90, 20:50] = True
        mask_both = mask_left.copy()
        mask_both[40:90, 50:80] = True
        mask_all = np.ones((100, 100), dtype=bool)
        predictor = FakePredictor(np.array([mask_left, mask_both, mask_all]), np.array([0.98, 0.90, 0.99]))

        result = segment_with_predictor(predictor, image, garment_id=5)

        self.assertEqual(int(result.sum()), int(mask_both.sum()))
        self.assertEqual(predictor.kwargs['point_labels'].tolist()[:2], [1, 1])


if __name__ == '__main__':
    unittest.main()
