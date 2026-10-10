import json
import unittest
from pathlib import Path

from tools.model_comparison import build_model_comparison


ROOT = Path(__file__).resolve().parents[1]


class ModelComparisonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        models = json.loads((ROOT / 'experiments' / 'garment_ai' / 'results' / 'results.json').read_text(encoding='utf-8'))
        hrnet = json.loads((ROOT / 'experiments' / 'garment_ai' / 'results' / 'hrnet_results.json').read_text(encoding='utf-8'))
        report = {'rows': [{
            'backgroundId': 'ChaArUco_Cross', 'imageName': row['photo'],
            'garmentId': row['garmentId'], 'garmentName': f"옷 {row['garmentId']}",
            'widthKind': 'waist' if row['garmentId'] == 5 else 'chest', 'status': 'done',
            'referenceWidthCm': row['referenceWidthCm'], 'referenceLengthCm': row['referenceLengthCm'],
            'measuredWidthCm': row['opencvWidthCm'], 'measuredLengthCm': row['opencvLengthCm'],
            'overlayDataUrl': 'data:image/jpeg;base64,',
        } for row in models['rows']]}
        cls.comparison = build_model_comparison(report, models, hrnet)

    def test_existing_experiments_compare_the_same_five_m4_photos(self):
        comparison = self.comparison

        self.assertEqual(comparison['sampleCount'], 5)
        self.assertEqual({row['photo'] for row in comparison['rows']}, {
            'chc_1_w55_h65.jpg', 'chc_2_w54_h50.jpg', 'chc_3_w40_h70.jpg',
            'chc_4_w49_h53.jpg', 'chc_5_w42_h90.jpg'
        })
        methods = {item['id']: item for item in comparison['methods']}
        self.assertEqual(methods['fitshare']['widthMaeCm'], 0.58)
        self.assertEqual(methods['fitshare']['lengthMaeCm'], 4.76)
        self.assertEqual(methods['yolo']['widthMaeCm'], 3.4)
        self.assertEqual(methods['yolo']['lengthMaeCm'], 2.9)
        self.assertEqual(methods['sam']['widthMaeCm'], 12.88)
        self.assertEqual(methods['hrnet']['lengthMaeCm'], 11.14)

    def test_a_missing_or_unmeasured_model_row_does_not_count_as_success(self):
        comparison = build_model_comparison(
            {'rows': [
                {'backgroundId': 'ChaArUco_Cross', 'imageName': 'one.jpg', 'status': 'done',
                 'referenceWidthCm': 10, 'referenceLengthCm': 20, 'measuredWidthCm': 11,
                 'measuredLengthCm': 22, 'sourceUrl': 'measure_dataset/one.jpg'},
                {'backgroundId': 'point', 'imageName': 'two.jpg', 'status': 'done',
                 'referenceWidthCm': 5, 'referenceLengthCm': 10, 'measuredWidthCm': 5,
                 'measuredLengthCm': 10}
            ]},
            {'rows': [{'photo': 'one.jpg', 'yoloWidthCm': None, 'yoloLengthCm': None,
                       'samWidthCm': 10, 'samLengthCm': 20}]},
            {'rows': []}
        )

        methods = {item['id']: item for item in comparison['methods']}
        self.assertEqual(comparison['sampleCount'], 1)
        self.assertEqual(methods['fitshare']['successCount'], 1)
        self.assertEqual(methods['yolo']['successCount'], 0)
        self.assertIsNone(methods['yolo']['widthMaeCm'])
        self.assertEqual(methods['sam']['successCount'], 1)
        self.assertEqual(methods['hrnet']['successCount'], 0)

    def test_failed_pipeline_row_with_old_measurements_does_not_count(self):
        comparison = build_model_comparison(
            {'rows': [{
                'backgroundId': 'ChaArUco_Cross', 'imageName': 'one.jpg', 'status': 'failed',
                'referenceWidthCm': 10, 'referenceLengthCm': 20,
                'measuredWidthCm': 10, 'measuredLengthCm': 20,
            }]},
            {'rows': []}, {'rows': []}
        )

        methods = {item['id']: item for item in comparison['methods']}
        self.assertEqual(methods['fitshare']['successCount'], 0)
        self.assertIsNone(methods['fitshare']['widthMaeCm'])

    def test_invalid_report_shapes_return_a_clear_error(self):
        with self.assertRaisesRegex(ValueError, '비교할 M4 측정 결과'):
            build_model_comparison({'rows': 'wrong'}, {'rows': []}, {'rows': []})


if __name__ == '__main__':
    unittest.main()
