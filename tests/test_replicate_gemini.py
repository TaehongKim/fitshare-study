import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock


MODULE_NAME = 'tools.replicate_gemini'


class ReplicateGeminiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if importlib.util.find_spec(MODULE_NAME) is None:
            cls.gemini = None
        else:
            cls.gemini = __import__(MODULE_NAME, fromlist=['*'])

    def test_model_json_is_converted_to_checked_centimeter_values(self):
        self.assertIsNotNone(self.gemini, 'Gemini 측정 도구가 아직 없어요.')

        result = self.gemini.parse_measurement_output(
            '```json\n{"width_cm": 41.2, "length_cm": 88.5, "confidence": 0.72, "note": "표식 간격으로 계산"}\n```'
        )

        self.assertEqual(result['widthCm'], 41.2)
        self.assertEqual(result['lengthCm'], 88.5)
        self.assertEqual(result['confidence'], 0.72)
        self.assertEqual(result['note'], '표식 간격으로 계산')

    def test_model_json_with_impossible_measurements_is_rejected(self):
        self.assertIsNotNone(self.gemini, 'Gemini 측정 도구가 아직 없어요.')

        with self.assertRaisesRegex(ValueError, '측정값'):
            self.gemini.parse_measurement_output('{"width_cm": 0, "length_cm": 20}')

    def test_complete_measurements_can_be_read_if_stream_ends_mid_note(self):
        result = self.gemini.parse_measurement_output(
            '```json\n{"width_cm": 52.0, "length_cm": 88.5, "note": "옷의 가'
        )
        self.assertEqual(result['widthCm'], 52.0)
        self.assertEqual(result['lengthCm'], 88.5)

    def test_width_only_response_is_valid_when_only_width_was_requested(self):
        result = self.gemini.parse_measurement_output('{"width_cm": 42.5}', ('width',))
        self.assertEqual(result['widthCm'], 42.5)
        self.assertIsNone(result['lengthCm'])

    def test_length_only_response_is_valid_when_only_length_was_requested(self):
        result = self.gemini.parse_measurement_output('{"length_cm": 91.0}', ('length',))
        self.assertIsNone(result['widthCm'])
        self.assertEqual(result['lengthCm'], 91.0)

    def test_single_plain_centimeter_value_can_be_read_for_one_requested_dimension(self):
        result = self.gemini.parse_measurement_output('약 73.5 cm', ('length',))
        self.assertEqual(result['lengthCm'], 73.5)

    def test_truncated_response_without_both_measurements_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'JSON 측정값'):
            self.gemini.parse_measurement_output('{"width_cm": 52.0, "length_cm":')

    def test_prompt_uses_background_spacing_without_revealing_filename_truth(self):
        self.assertIsNotNone(self.gemini, 'Gemini 측정 도구가 아직 없어요.')

        prompt = self.gemini.build_measurement_prompt({
            'backgroundId': 'cross', 'garmentName': '바지', 'category': 'pants', 'widthKind': 'waist'
        })

        self.assertIn('5cm', prompt)
        self.assertIn('허리', prompt)
        self.assertNotIn('42cm', prompt)
        self.assertNotIn('90cm', prompt)

    def test_uploaded_file_is_deleted_even_if_prediction_fails(self):
        self.assertIsNotNone(self.gemini, 'Gemini 측정 도구가 아직 없어요.')
        with tempfile.TemporaryDirectory() as temp_dir:
            photo = Path(temp_dir) / 'p_1_w55_h65.jpg'
            photo.write_bytes(b'original photo bytes')
            label = {'garmentId': 1, 'imageName': photo.name, 'backgroundId': 'point', 'garmentName': '상의 외투',
                     'category': 'top', 'widthKind': 'chest'}
            with mock.patch.object(self.gemini, 'upload_replicate_file', return_value=('file-id', 'https://api.replicate.com/v1/files/file-id')) as upload, \
                    mock.patch.object(self.gemini, 'create_gemini_prediction', side_effect=self.gemini.ReplicateAPIError('예측 실패')), \
                    mock.patch.object(self.gemini, 'delete_replicate_file') as delete:
                result = self.gemini.analyze_photo(photo, label, 'secret-token')

        self.assertEqual(result['status'], 'failed')
        upload.assert_called_once()
        delete.assert_called_once_with('file-id', 'secret-token')

    def test_upload_sends_original_photo_bytes_unchanged(self):
        self.assertIsNotNone(self.gemini, 'Gemini 측정 도구가 아직 없어요.')
        original = b'original full-resolution image bytes'
        with tempfile.TemporaryDirectory() as temp_dir:
            photo = Path(temp_dir) / 'photo.jpg'
            photo.write_bytes(original)
            response = (201, b'{"id":"file-123","urls":{"get":"https://api.replicate.com/v1/files/file-123"}}')
            with mock.patch.object(self.gemini, '_request', return_value=response) as request:
                file_id, file_url = self.gemini.upload_replicate_file(photo, 'secret-token')

        self.assertEqual(file_id, 'file-123')
        self.assertEqual(file_url, 'https://api.replicate.com/v1/files/file-123')
        request_body = request.call_args.args[2]
        self.assertIn(original, request_body)
        self.assertTrue(request_body.endswith(b'\r\n--' + request_body.split(b'\r\n', 1)[0][2:] + b'--\r\n'))


if __name__ == '__main__':
    unittest.main()
