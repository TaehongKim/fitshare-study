import unittest
from pathlib import Path


APP_SOURCE = Path(__file__).parents[1] / 'js' / 'measurement' / 'app.js'


class MeasurementUiCopyTests(unittest.TestCase):
    def test_photo_measurement_explains_how_it_differs_from_reference(self):
        source = APP_SOURCE.read_text(encoding='utf-8')
        start = source.index('<div class="dimension-fields">')
        end = source.index('</form>', start)
        measurement_panel = source[start:end]

        self.assertIn('처음 입력한 값은 줄자로 잰 기준값', measurement_panel)
        self.assertIn('사진에서 자동으로 잰 값', measurement_panel)
        self.assertIn('두 값을 비교', measurement_panel)


if __name__ == '__main__':
    unittest.main()
