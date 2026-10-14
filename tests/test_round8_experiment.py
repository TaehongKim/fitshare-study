import unittest

from tools.measure_dataset import ROUND8_WIDTH_RATIO, summarize_round8
from tools.vision_pipeline import GARMENT_PROFILES, width_line_y


class Round8WidthPositionTests(unittest.TestCase):
    def test_sixty_percent_means_sixty_percent_of_detected_garment_height(self):
        self.assertEqual(width_line_y(100, 300, .60), 220)

    def test_service_keeps_round7_ratios_while_round8_compares_sixty_percent(self):
        for garment_id in (2, 3, 4):
            with self.subTest(garment_id=garment_id):
                self.assertEqual(GARMENT_PROFILES[garment_id]['widthRatio'], {2: .325, 3: .15, 4: .20}[garment_id])
        self.assertEqual(GARMENT_PROFILES[1]['widthRatio'], .40)
        self.assertEqual(GARMENT_PROFILES[5]['widthRatio'], .10)
        self.assertEqual(ROUND8_WIDTH_RATIO, .60)

    def test_width_position_rejects_ratios_outside_the_garment(self):
        for ratio in (0, 1, -0.1, 1.1):
            with self.subTest(ratio=ratio), self.assertRaises(ValueError):
                width_line_y(10, 110, ratio)

    def test_round8_experiment_has_a_reproducible_page_and_dataset(self):
        from pathlib import Path
        root = Path(__file__).resolve().parents[1]
        page = (root / 'docs' / 'measure-dataset-round8.html').read_text(encoding='utf-8')
        data = (root / 'docs' / 'data' / 'measure-dataset-round8.json').read_text(encoding='utf-8')
        self.assertIn('60%', page)
        self.assertIn('measure-dataset-round8.json', (root / 'docs' / 'js' / 'measurement' / 'publicRound8Report.js').read_text(encoding='utf-8'))
        self.assertIn('round8-width-line-at-60-percent', data)

    def test_round8_summary_reports_target_garments_and_failures(self):
        rows = [
            {'garmentId': 2, 'round7': {'status': 'done', 'absoluteWidthErrorCm': 4, 'absoluteLengthErrorCm': 2, 'elapsedMs': 20},
             'round8': {'status': 'done', 'absoluteWidthErrorCm': 2, 'absoluteLengthErrorCm': 2, 'elapsedMs': 22}},
            {'garmentId': 1, 'round7': {'status': 'done', 'absoluteWidthErrorCm': 1, 'absoluteLengthErrorCm': 3, 'elapsedMs': 10},
             'round8': {'status': 'failed', 'elapsedMs': 12}},
        ]
        result = summarize_round8(rows, 'round8')
        self.assertEqual(result['targetGarmentCount'], 1)
        self.assertEqual(result['targetSuccessCount'], 1)
        self.assertEqual(result['successCount'], 1)
        self.assertEqual(result['failureCount'], 1)
        self.assertEqual(result['targetMaeWidthCm'], 2.0)


if __name__ == '__main__':
    unittest.main()

