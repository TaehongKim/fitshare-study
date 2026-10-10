import unittest

from tools.vision_pipeline import validate_garment_dimensions


class VisionPipelineMeasurementTests(unittest.TestCase):
    def test_normal_garment_dimensions_are_accepted(self):
        self.assertIsNone(validate_garment_dimensions(52.4, 50.0))

    def test_minimum_supported_garment_length_is_accepted(self):
        self.assertIsNone(validate_garment_dimensions(20.0, 15.0))

    def test_partial_outline_length_is_rejected_as_unreliable(self):
        with self.assertRaisesRegex(ValueError, '옷 전체를 찾지 못했어요'):
            validate_garment_dimensions(30.0, 5.1)


if __name__ == '__main__':
    unittest.main()
