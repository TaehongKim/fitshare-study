import json
import shutil
import tempfile
import unittest
from pathlib import Path

from tools.measure_dataset import analyze_round4_dataset


ROOT = Path(__file__).resolve().parents[1]


class Round4ExperimentTests(unittest.TestCase):
    def test_round4_compares_pattern_pitch_with_a0_scale_for_each_photo(self):
        with tempfile.TemporaryDirectory() as temporary:
            dataset = Path(temporary) / 'dataset' / 'point'
            dataset.mkdir(parents=True)
            shutil.copy2(ROOT / 'measure_dataset' / 'point' / 'p_1_w55_h65.jpg', dataset / 'p_1_w55_h65.jpg')
            output = Path(temporary) / 'round4.json'

            report = analyze_round4_dataset(Path(temporary) / 'dataset', output)

            self.assertEqual(report['imageCount'], 1)
            self.assertEqual(report['methods']['pattern']['successCount'], 1)
            self.assertEqual(report['methods']['a0']['successCount'], 1)
            self.assertEqual(report['rows'][0]['pattern']['status'], 'done')
            self.assertEqual(report['rows'][0]['a0']['status'], 'done')
            self.assertNotIn('overlayDataUrl', report['rows'][0]['pattern'])
            self.assertTrue(output.exists())
            self.assertEqual(json.loads(output.read_text(encoding='utf-8'))['imageCount'], 1)

    def test_equal_scales_produce_equal_measurements_for_the_same_rectified_photo(self):
        with tempfile.TemporaryDirectory() as temporary:
            dataset = Path(temporary) / 'dataset' / 'point'
            dataset.mkdir(parents=True)
            shutil.copy2(ROOT / 'measure_dataset' / 'point' / 'p_3_w40_h70.jpg', dataset / 'p_3_w40_h70.jpg')

            report = analyze_round4_dataset(Path(temporary) / 'dataset')

            photo = report['rows'][0]
            self.assertAlmostEqual(photo['patternScaleCmPerPixel']['x'], 84.1 / 600, places=7)
            self.assertAlmostEqual(photo['a0']['measuredWidthCm'], photo['pattern']['measuredWidthCm'], places=1)
            self.assertAlmostEqual(photo['a0']['measuredLengthCm'], photo['pattern']['measuredLengthCm'], places=1)

    def test_round4_public_page_loads_the_saved_experiment_and_shows_both_scales(self):
        page = ROOT / 'docs' / 'measure-dataset-round4.html'
        script = ROOT / 'docs' / 'js' / 'measurement' / 'publicRound4Report.js'
        html = page.read_text(encoding='utf-8')
        javascript = script.read_text(encoding='utf-8')

        self.assertIn('4차 실험', html)
        self.assertIn('publicRound4Report.js', html)
        self.assertIn('measure-dataset-round4.json', javascript)
        self.assertIn('무늬 간격', javascript)
        self.assertIn('A0 전체 크기', javascript)


if __name__ == '__main__':
    unittest.main()

