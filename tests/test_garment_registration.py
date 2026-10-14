import base64
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import server


class GarmentRegistrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.httpd = server.create_server('127.0.0.1', 0, Path(self.temp_dir.name))
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f'http://127.0.0.1:{self.httpd.server_address[1]}'

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        self.temp_dir.cleanup()

    def request_json(self, path, method='GET', payload=None):
        body = None if payload is None else json.dumps(payload).encode('utf-8')
        request = urllib.request.Request(self.base_url + path, data=body, method=method)
        if body is not None:
            request.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, json.loads(response.read().decode('utf-8'))

    def post_error(self, path, payload, expected_status):
        body = json.dumps(payload).encode('utf-8')
        request = urllib.request.Request(self.base_url + path, data=body, method='POST')
        request.add_header('Content-Type', 'application/json')
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(request, timeout=15)
        self.assertEqual(error.exception.code, expected_status)

    def test_m4_sample_photo_returns_measurements_color_and_review_fields(self):
        sample = Path(server.PROJECT_ROOT / 'measure_dataset' / 'ChaArUco_Cross' / 'chc_1_w55_h65.jpg')
        photo_data = 'data:image/jpeg;base64,' + base64.b64encode(sample.read_bytes()).decode('ascii')

        status, result = self.request_json('/api/garments/analyze', 'POST', {
            'backgroundId': 'M4', 'garmentId': 1, 'photoDataUrl': photo_data
        })

        self.assertEqual(status, 200)
        self.assertTrue(result['ok'])
        self.assertEqual(result['garmentId'], 1)
        self.assertEqual(result['category'], 'top')
        self.assertEqual(result['garmentName'], '상의 외투')
        self.assertGreater(result['lengthCm'], 0)
        self.assertGreater(result['widthCm'], 0)
        self.assertTrue(result['colorName'])
        self.assertTrue(result['analysisPhotoDataUrl'].startswith('data:image/jpeg;base64,'))
        self.assertTrue(result['closetImageDataUrl'].startswith('data:image/png;base64,'))
        cutout = base64.b64decode(result['closetImageDataUrl'].split(',', 1)[1])
        self.assertTrue(cutout.startswith(b'\x89PNG\r\n\x1a\n'))
        self.assertEqual(cutout[25], 6)  # PNG color type 6 includes an alpha channel.
        import cv2
        import numpy as np
        decoded_cutout = cv2.imdecode(np.frombuffer(cutout, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
        self.assertEqual(decoded_cutout.shape[2], 4)
        self.assertEqual(int(decoded_cutout[:, :, 3].min()), 0)
        self.assertEqual(int(decoded_cutout[:, :, 3].max()), 255)
        self.assertNotIn('gender', result)

    def test_registration_measurement_matches_experiment_pipeline_for_same_m4_photo(self):
        from tools.garment_segmentation import get_yolo_grabcut_provider
        from tools.vision_pipeline import measure_garment, rectify_photo

        photo = Path(server.PROJECT_ROOT / 'measure_dataset' / 'ChaArUco_Cross' / 'chc_2_w54_h50.jpg').read_bytes()
        flattened = rectify_photo(photo, 'M4', preserve_resolution=True, max_output_long_side=848)
        experiment_result = measure_garment(flattened['image'], garment_id=2,
                                             scale_cm_per_pixel=flattened['scaleCmPerPixel'], max_working_long_side=848,
                                             length_mask_provider=get_yolo_grabcut_provider(garment_id=2))
        photo_data = 'data:image/jpeg;base64,' + base64.b64encode(photo).decode('ascii')
        _, registration_result = self.request_json('/api/garments/analyze', 'POST', {
            'backgroundId': 'M4', 'garmentId': 2, 'photoDataUrl': photo_data
        })

        self.assertEqual(registration_result['lengthCm'], experiment_result['measuredLengthCm'])
        self.assertEqual(registration_result['widthCm'], experiment_result['measuredWidthCm'])
        self.assertEqual(registration_result['maskMethods'], {'width': 'GrabCut', 'length': 'YOLO→GrabCut'})
        self.assertEqual(registration_result['analysisPhotoDataUrl'], experiment_result['overlayDataUrl'])

    def test_pants_registration_uses_the_selected_hybrid_pipeline(self):
        from tools.garment_segmentation import get_yolo_grabcut_provider
        from tools.vision_pipeline import measure_garment, rectify_photo

        path = Path(server.PROJECT_ROOT / 'measure_dataset' / 'ChaArUco_Cross' / 'chc_5_w42_h90.jpg')
        flattened = rectify_photo(path.read_bytes(), 'M4', preserve_resolution=True, max_output_long_side=848)
        expected = measure_garment(flattened['image'], garment_id=5,
                                   scale_cm_per_pixel=flattened['scaleCmPerPixel'], max_working_long_side=848,
                                   length_mask_provider=get_yolo_grabcut_provider(garment_id=5))
        photo_data = 'data:image/jpeg;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')
        _, result = self.request_json('/api/garments/analyze', 'POST', {
            'backgroundId': 'M4', 'garmentId': 5, 'photoDataUrl': photo_data
        })
        self.assertEqual(result['widthCm'], expected['measuredWidthCm'])
        self.assertEqual(result['lengthCm'], expected['measuredLengthCm'])

    def test_analysis_accepts_each_supported_mat_using_its_matching_sample(self):
        samples = {'M1': ('point', 'p_1_w55_h65.jpg'), 'M2': ('cross', 'c_1_w55_h65.jpg'),
                   'M3': ('ChArUco', 'ch_1_w55_h65.jpg'),
                   'M4': ('ChaArUco_Cross', 'chc_1_w55_h65.jpg')}
        for mat_id, (folder, filename) in samples.items():
            with self.subTest(background=mat_id):
                path = Path(server.PROJECT_ROOT / 'measure_dataset' / folder / filename)
                photo_data = 'data:image/jpeg;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')
                status, result = self.request_json('/api/garments/analyze', 'POST', {
                    'backgroundId': mat_id, 'garmentId': 1, 'photoDataUrl': photo_data
                })
                self.assertEqual(status, 200)
                self.assertTrue(result['ok'])

    def test_five_m4_training_photos_produce_reviewable_size_and_kind_candidates(self):
        sample_dir = server.PROJECT_ROOT / 'measure_dataset' / 'ChaArUco_Cross'
        results = []
        for path in sorted(sample_dir.glob('*.jpg')):
            photo_data = 'data:image/jpeg;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')
            _, result = self.request_json('/api/garments/analyze', 'POST', {
                'backgroundId': 'M4', 'garmentId': int(path.name.split('_')[1]), 'photoDataUrl': photo_data
            })
            results.append(result)

        self.assertEqual(len(results), 5)
        self.assertEqual([result['garmentId'] for result in results], [1, 2, 3, 4, 5])
        self.assertTrue(all(20 <= result['lengthCm'] <= 130 and 20 <= result['widthCm'] <= 100 for result in results))
        self.assertTrue(all(result['colorName'] for result in results))

    def test_analysis_rejects_unknown_background_and_unreadable_photo(self):
        photo = 'data:image/jpeg;base64,' + base64.b64encode(b'not an image').decode('ascii')
        self.post_error('/api/garments/analyze', {'backgroundId': 'M9', 'garmentId': 1, 'photoDataUrl': photo}, 400)
        self.post_error('/api/garments/analyze', {'backgroundId': 'M4', 'garmentId': 1, 'photoDataUrl': photo}, 422)
        self.post_error('/api/garments/analyze', {'backgroundId': 'M4', 'garmentId': 6, 'photoDataUrl': photo}, 400)

    def test_saved_garment_requires_gender_choice_and_keeps_photo(self):
        jpeg_bytes = b'\xff\xd8\xfftest jpeg bytes'
        photo = 'data:image/jpeg;base64,' + base64.b64encode(jpeg_bytes).decode('ascii')
        payload = {
            'name': '파란 점퍼', 'category': 'top', 'garmentTypeId': 4, 'gender': 'unisex', 'lengthCm': 53,
            'widthCm': 49, 'colorName': '파랑', 'photoDataUrl': photo,
        }

        status, saved = self.request_json('/api/garments', 'POST', payload)

        self.assertEqual(status, 201)
        self.assertEqual(saved['gender'], 'unisex')
        self.assertEqual(saved['garmentTypeName'], '점퍼')
        _, listing = self.request_json('/api/garments')
        self.assertEqual(listing[0]['id'], saved['id'])
        _, detail = self.request_json(f"/api/garments/{saved['id']}")
        self.assertEqual(detail['name'], '파란 점퍼')
        with urllib.request.urlopen(self.base_url + detail['photoUrl'], timeout=3) as response:
            self.assertEqual(response.read(), jpeg_bytes)

    def test_saved_garment_keeps_original_and_serves_transparent_closet_image(self):
        photo_bytes = Path(server.PROJECT_ROOT / 'measure_dataset' / 'ChaArUco_Cross' / 'chc_1_w55_h65.jpg').read_bytes()
        photo = 'data:image/jpeg;base64,' + base64.b64encode(photo_bytes).decode('ascii')
        _, analysis = self.request_json('/api/garments/analyze', 'POST', {
            'backgroundId': 'M4', 'garmentId': 1, 'photoDataUrl': photo
        })
        _, saved = self.request_json('/api/garments', 'POST', {
            'name': '테스트 상의', 'category': 'top', 'garmentTypeId': 1, 'gender': 'unisex',
            'lengthCm': analysis['lengthCm'], 'widthCm': analysis['widthCm'], 'colorName': analysis['colorName'],
            'photoDataUrl': photo, 'closetImageDataUrl': analysis['closetImageDataUrl'], 'backgroundId': 'M4'
        })
        with urllib.request.urlopen(self.base_url + saved['photoUrl'], timeout=3) as response:
            self.assertEqual(response.read(), photo_bytes)
        with urllib.request.urlopen(self.base_url + saved['closetPhotoUrl'], timeout=3) as response:
            cutout = response.read()
            self.assertEqual(response.headers.get_content_type(), 'image/png')
        self.assertTrue(cutout.startswith(b'\x89PNG\r\n\x1a\n'))

    def test_legacy_garment_gets_a_generated_closet_cutout(self):
        source = Path(server.PROJECT_ROOT / 'measure_dataset' / 'ChaArUco_Cross' / 'chc_1_w55_h65.jpg').read_bytes()
        record_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        garment_dir = Path(self.temp_dir.name) / 'garments' / record_id
        garment_dir.mkdir(parents=True)
        (garment_dir / 'photo.jpg').write_bytes(source)
        (garment_dir / 'garment.json').write_text(json.dumps({'garmentTypeId': 1, 'backgroundId': 'M4'}), encoding='utf-8')
        with urllib.request.urlopen(self.base_url + f'/api/garments/{record_id}/closet-photo', timeout=15) as response:
            cutout = response.read()
            self.assertEqual(response.headers.get_content_type(), 'image/png')
        self.assertTrue(cutout.startswith(b'\x89PNG\r\n\x1a\n'))
        self.assertTrue((garment_dir / 'closet.png').exists())

    def test_closet_thumbnail_is_small_cached_transparent_png(self):
        source = Path(server.PROJECT_ROOT / 'measure_dataset' / 'ChaArUco_Cross' / 'chc_1_w55_h65.jpg').read_bytes()
        record_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        garment_dir = Path(self.temp_dir.name) / 'garments' / record_id
        garment_dir.mkdir(parents=True)
        (garment_dir / 'photo.jpg').write_bytes(source)
        (garment_dir / 'garment.json').write_text(json.dumps({'garmentTypeId': 1, 'backgroundId': 'M4'}), encoding='utf-8')
        with urllib.request.urlopen(self.base_url + f'/api/garments/{record_id}/thumbnail', timeout=15) as response:
            thumbnail = response.read()
            self.assertEqual(response.headers.get_content_type(), 'image/png')
            self.assertIn('max-age=', response.headers.get('Cache-Control', ''))
        self.assertTrue((garment_dir / 'closet-thumbnail.png').exists())
        import cv2
        import numpy as np
        decoded = cv2.imdecode(np.frombuffer(thumbnail, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
        self.assertLessEqual(max(decoded.shape[:2]), 320)
        self.assertEqual(decoded.shape[2], 4)

    def test_garment_information_can_be_updated_without_changing_the_photo(self):
        original = b'\xff\xd8\xffsample original'
        photo = 'data:image/jpeg;base64,' + base64.b64encode(original).decode('ascii')
        _, saved = self.request_json('/api/garments', 'POST', {
            'name': '확인할 점퍼', 'category': 'top', 'garmentTypeId': 4, 'gender': 'unknown',
            'lengthCm': 50, 'widthCm': 45, 'colorName': '파랑', 'photoDataUrl': photo,
        })
        updated = {
            'name': '고친 원피스', 'category': 'dress', 'garmentTypeId': 3, 'gender': 'female',
            'lengthCm': 82.5, 'widthCm': 41.2, 'colorName': '보라'
        }
        status, result = self.request_json(f"/api/garments/{saved['id']}/update", 'POST', updated)
        self.assertEqual(status, 200)
        self.assertEqual({key: result[key] for key in updated}, updated)
        _, listing = self.request_json('/api/garments')
        self.assertEqual(listing[0]['name'], '고친 원피스')
        with urllib.request.urlopen(self.base_url + result['photoUrl'], timeout=3) as response:
            self.assertEqual(response.read(), original)

    def test_garment_information_update_rejects_invalid_fields(self):
        original = b'\xff\xd8\xffsample original'
        photo = 'data:image/jpeg;base64,' + base64.b64encode(original).decode('ascii')
        _, saved = self.request_json('/api/garments', 'POST', {
            'name': '원래 이름', 'category': 'top', 'garmentTypeId': 1, 'gender': 'unknown',
            'lengthCm': 50, 'widthCm': 45, 'colorName': '파랑', 'photoDataUrl': photo,
        })
        self.post_error(f"/api/garments/{saved['id']}/update", {
            'name': '잘못된 정보', 'category': 'top', 'garmentTypeId': 1, 'gender': 'other',
            'lengthCm': 50, 'widthCm': 45, 'colorName': '파랑'
        }, 400)
        _, detail = self.request_json(f"/api/garments/{saved['id']}")
        self.assertEqual(detail['name'], '원래 이름')

    def test_saved_garment_rejects_missing_or_invalid_values(self):
        photo = 'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8\xffjpeg').decode('ascii')
        self.post_error('/api/garments', {'photoDataUrl': photo}, 400)
        self.post_error('/api/garments', {
            'name': '옷', 'category': 'top', 'garmentTypeId': 1, 'gender': 'unknown-value', 'lengthCm': 20,
            'widthCm': 30, 'colorName': '검정', 'photoDataUrl': photo,
        }, 400)
        self.post_error('/api/garments', {
            'name': '옷', 'category': 'top', 'garmentTypeId': 1, 'gender': 'unknown', 'lengthCm': 20,
            'widthCm': 30, 'colorName': '검정',
            'photoDataUrl': 'data:image/jpeg;base64,' + base64.b64encode(b'not a jpeg').decode('ascii'),
        }, 400)
        self.post_error('/api/garments/analyze', {
            'backgroundId': 'M4', 'garmentId': 0, 'photoDataUrl': photo,
        }, 400)


if __name__ == '__main__':
    unittest.main()
