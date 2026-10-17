import json
import unittest
from email.message import Message
from unittest.mock import patch

from tools.replicate_product_photo import ProductPhotoError, generate_product_photo


class FakeResponse:
    def __init__(self, body, content_type='application/json', status=200):
        self.body = body
        self.status = status
        self.headers = Message()
        self.headers['Content-Type'] = content_type

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, *_):
        return self.body


class ReplicateProductPhotoTests(unittest.TestCase):
    def invoke(self, prediction, result=None):
        calls = []

        def opener(request, timeout=90):
            calls.append(request.full_url)
            if request.full_url.endswith('/files'):
                return FakeResponse(json.dumps({'id': 'file-1', 'urls': {'get': 'https://api.replicate.com/v1/files/file-1'}}).encode())
            if '/models/' in request.full_url:
                return FakeResponse(json.dumps(prediction).encode())
            if request.full_url == 'https://replicate.delivery/result.png':
                if result is None:
                    return FakeResponse(b'\x89PNG\r\n\x1a\nvalid-png', 'image/png')
                return result
            return FakeResponse(b'', status=204)

        value = generate_product_photo(b'\x89PNG\r\n\x1a\nsource', 'studio photo', 'secret-token', 'version-id',
                                       opener=opener, sleep=lambda _: None)
        return value, calls

    def test_success_returns_image_and_deletes_temporary_upload(self):
        image, calls = self.invoke({'status': 'succeeded', 'output': 'https://replicate.delivery/result.png'})
        self.assertEqual(image, (b'\x89PNG\r\n\x1a\nvalid-png', 'image/png'))
        self.assertTrue(any(url.endswith('/files/file-1') for url in calls))

    def test_prediction_failure_returns_readable_error_and_deletes_upload(self):
        calls = []

        def opener(request, timeout=90):
            calls.append(request.full_url)
            if request.full_url.endswith('/files'):
                return FakeResponse(json.dumps({'id': 'file-1', 'urls': {'get': 'https://api.replicate.com/v1/files/file-1'}}).encode())
            if '/models/' in request.full_url:
                return FakeResponse(json.dumps({'status': 'failed'}).encode())
            return FakeResponse(b'', status=204)

        with self.assertRaisesRegex(ProductPhotoError, '완료되지'):
            generate_product_photo(b'png', 'studio', 'token', 'version', opener=opener)
        self.assertTrue(any(url.endswith('/files/file-1') for url in calls))

    def test_missing_output_is_rejected(self):
        with self.assertRaisesRegex(ProductPhotoError, '사진 결과'):
            self.invoke({'status': 'succeeded'})

    def test_non_image_result_is_rejected(self):
        with self.assertRaisesRegex(ProductPhotoError, '사진 파일'):
            self.invoke({'status': 'succeeded', 'output': 'https://replicate.delivery/result.png'},
                        FakeResponse(b'not an image', 'text/plain'))

    def test_missing_token_or_model_version_is_rejected_before_upload(self):
        for token, version in (('', 'version'), ('token', '')):
            with self.assertRaises(ProductPhotoError):
                generate_product_photo(b'png', 'studio', token, version)

    def test_timeout_does_not_leave_temporary_upload(self):
        calls = []

        def opener(request, timeout=90):
            calls.append(request.full_url)
            if request.full_url.endswith('/files'):
                return FakeResponse(json.dumps({'id': 'file-1', 'urls': {'get': 'https://api.replicate.com/v1/files/file-1'}}).encode())
            if '/models/' in request.full_url:
                return FakeResponse(json.dumps({'status': 'processing', 'urls': {'get': 'https://api.replicate.com/v1/predictions/abc'}}).encode())
            return FakeResponse(b'', status=204)

        with patch('tools.replicate_product_photo.time.monotonic', side_effect=[0, 301]):
            with self.assertRaisesRegex(ProductPhotoError, '제한 시간'):
                generate_product_photo(b'png', 'studio', 'token', 'version', opener=opener, sleep=lambda _: None)
        self.assertTrue(any(url.endswith('/files/file-1') for url in calls))


if __name__ == '__main__':
    unittest.main()
