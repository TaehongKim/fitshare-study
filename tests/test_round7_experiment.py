import unittest

import numpy as np

from tools.measure_dataset import summarize_round7
from tools.garment_segmentation import YoloDetector


class Round7DetectorTests(unittest.TestCase):
    def test_summary_counts_failures_and_computes_error_only_for_successes(self):
        rows = [
            {'backgroundId': 'M1', 'garmentId': 1,
             'baseline': {'status': 'done', 'absoluteWidthErrorCm': 2, 'absoluteLengthErrorCm': 4, 'elapsedMs': 500},
             'integrated': {'status': 'done', 'absoluteWidthErrorCm': 1, 'absoluteLengthErrorCm': 3, 'elapsedMs': 700}},
            {'backgroundId': 'M1', 'garmentId': 2,
             'baseline': {'status': 'done', 'absoluteWidthErrorCm': 4, 'absoluteLengthErrorCm': 6, 'elapsedMs': 600},
             'integrated': {'status': 'failed', 'elapsedMs': 900}},
        ]

        summary = summarize_round7(rows, 'integrated')

        self.assertEqual(summary['successCount'], 1)
        self.assertEqual(summary['failureCount'], 1)
        self.assertEqual(summary['maeWidthCm'], 1.0)
        self.assertEqual(summary['maeLengthCm'], 3.0)
        self.assertEqual(summary['averageElapsedMs'], 700.0)

    def test_summary_of_empty_group_is_safe(self):
        summary = summarize_round7([], 'integrated')
        self.assertEqual(summary['successRatePct'], 0)
        self.assertIsNone(summary['maeWidthCm'])
        self.assertIsNone(summary['averageElapsedMs'])

    def test_detector_runs_two_model_outputs_and_returns_full_resolution_mask(self):
        class FakeNet:
            def setInput(self, tensor):
                self.tensor_shape = tensor.shape

            def forward(self, names):
                self.output_names = names
                predictions = np.zeros((1, 300, 38), dtype=np.float32)
                # box, confidence, DeepFashion2 class, 32 mask coefficients
                predictions[0, 0, :6] = [100, 70, 310, 360, .95, 1]
                predictions[0, 0, 6] = 1
                prototypes = np.ones((1, 32, 104, 104), dtype=np.float32)
                return predictions, prototypes

        net = FakeNet()
        image = np.zeros((848, 600, 3), dtype=np.uint8)
        detected = YoloDetector(net).detect(image, garment_id=2)

        self.assertEqual(net.output_names, ('output0', 'output1'))
        self.assertEqual(net.tensor_shape, (1, 3, 416, 416))
        self.assertEqual(detected['mask'].shape, image.shape[:2])
        self.assertEqual(detected['classId'], 1)
        self.assertEqual(detected['mask'].dtype, np.uint8)

    def test_detector_rejects_empty_outputs(self):
        class EmptyNet:
            def setInput(self, _tensor):
                pass

            def forward(self, _names):
                return np.zeros((1, 300, 38), dtype=np.float32), np.zeros((1, 32, 104, 104), dtype=np.float32)

        with self.assertRaisesRegex(ValueError, 'YOLO가 옷을 찾지 못했어요'):
            YoloDetector(EmptyNet()).detect(np.zeros((848, 600, 3), dtype=np.uint8), garment_id=2)


if __name__ == '__main__':
    unittest.main()
