import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DatasetModelComparisonPageTests(unittest.TestCase):
    def test_dataset_results_page_contains_kid_friendly_model_comparison(self):
        html = (ROOT / 'measure-dataset.html').read_text(encoding='utf-8')
        script = (ROOT / 'js' / 'measurement' / 'datasetReport.js').read_text(encoding='utf-8')
        renderer_path = ROOT / 'js' / 'measurement' / 'modelComparison.js'
        renderer = renderer_path.read_text(encoding='utf-8') if renderer_path.exists() else ''
        comparison_source = (ROOT / 'tools' / 'model_comparison.py').read_text(encoding='utf-8')

        self.assertIn('id="ai-model-comparison"', html)
        self.assertIn('AI 실험 결과 비교', html)
        self.assertIn("'/api/measure-dataset/model-comparison'", script)
        self.assertIn('renderModelComparison', script)
        self.assertIn('DeepFashion2는 측정 알고리즘이 아니에요', comparison_source)
        self.assertIn('YOLO 옷 분할 후보', comparison_source)
        self.assertIn('SAM ViT-B 점 마스크', comparison_source)
        self.assertIn('HRNet-W48 기준점', comparison_source)
        self.assertIn('loading="lazy"', renderer)


if __name__ == '__main__':
    unittest.main()
