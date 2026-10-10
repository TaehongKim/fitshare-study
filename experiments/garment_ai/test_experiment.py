import unittest

import numpy as np

from experiments.garment_ai.experiment import combine_detections, decode_predictions, measure_mask


class GarmentAiExperimentTests(unittest.TestCase):
    def test_decoder_returns_class_score_and_full_resolution_mask(self):
        predictions = np.zeros((1, 300, 38), dtype=np.float32)
        predictions[0, 0, :6] = [50, 40, 350, 370, 0.9, 0]
        predictions[0, 0, 6] = 8
        prototypes = np.zeros((1, 32, 104, 104), dtype=np.float32)
        prototypes[0, 0, 20:90, 20:90] = 8

        decoded = decode_predictions(predictions, prototypes, (848, 600), 416)

        self.assertEqual(len(decoded), 1)
        self.assertEqual(decoded[0]['classId'], 0)
        self.assertAlmostEqual(decoded[0]['confidence'], 0.9, places=5)
        self.assertEqual(decoded[0]['mask'].shape, (848, 600))
        self.assertGreater(int(decoded[0]['mask'].sum()), 0)

    def test_measure_mask_uses_garment_profile_and_a0_scale(self):
        mask = np.zeros((848, 600), dtype=np.uint8)
        mask[150:500, 120:480] = 1

        measured = measure_mask(mask, 2)

        self.assertEqual(measured['lengthCm'], 48.9)
        self.assertGreater(measured['widthCm'], 30)
        self.assertLess(measured['widthCm'], 60)

    def test_measure_mask_rejects_a_small_partial_patch(self):
        mask = np.zeros((848, 600), dtype=np.uint8)
        mask[120:160, 250:350] = 1

        with self.assertRaisesRegex(ValueError, '옷 전체'):
            measure_mask(mask, 2)

    def test_trousers_union_both_detected_legs_into_one_garment(self):
        left = np.zeros((848, 600), dtype=np.uint8)
        left[100:700, 120:280] = 1
        right = np.zeros((848, 600), dtype=np.uint8)
        right[100:700, 320:480] = 1
        detections = [
            {'classId': 7, 'className': 'trousers', 'confidence': 0.9, 'box': [120, 100, 280, 700], 'mask': left},
            {'classId': 7, 'className': 'trousers', 'confidence': 0.8, 'box': [320, 100, 480, 700], 'mask': right},
        ]

        selected = combine_detections(detections, 5)

        self.assertEqual(selected['confidence'], 0.9)
        self.assertTrue(np.all(selected['mask'][200, 150:250]))
        self.assertTrue(np.all(selected['mask'][200, 350:450]))

    def test_full_silhouette_measurement_does_not_use_wide_sleeves_as_length_limits(self):
        mask = np.zeros((848, 600), dtype=np.uint8)
        mask[100:500, 200:400] = 1
        mask[180:220, 50:550] = 1

        measured = measure_mask(mask, 2, full_silhouette=True)

        self.assertEqual(measured['lengthCm'], 55.9)
        self.assertGreater(measured['widthCm'], 25)
        self.assertLess(measured['widthCm'], 32)


if __name__ == '__main__':
    unittest.main()
