import json
import tempfile
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

import server
from tools.garment_thumbnails import prepare_garment_thumbnails


class GarmentThumbnailLoadingTests(unittest.TestCase):
    def make_cutout(self, size=(480, 320)):
        image = np.zeros((size[0], size[1], 4), dtype=np.uint8)
        image[20:-20, 30:-30] = (20, 120, 220, 255)
        ok, encoded = cv2.imencode('.png', image)
        self.assertTrue(ok)
        return encoded.tobytes()

    def test_thumbnail_is_at_most_200px(self):
        output = server.make_garment_thumbnail(self.make_cutout())
        image = cv2.imdecode(np.frombuffer(output, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
        self.assertLessEqual(max(image.shape[:2]), 200)
        self.assertEqual(image.shape[2], 4)

    def test_corrupt_source_photo_is_rejected(self):
        with self.assertRaisesRegex(ValueError, '원본 사진'):
            server.make_source_photo_thumbnail(b'not a jpeg')

    def test_legacy_thumbnail_resizes_from_saved_cutout_without_segmentation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            garment_id = str(uuid.uuid4())
            garment_dir = root / garment_id
            garment_dir.mkdir()
            (garment_dir / 'closet.png').write_bytes(self.make_cutout())
            item = {'id': garment_id, 'maskPipelineVersion': server.GARMENT_MASK_PIPELINE_VERSION}
            (garment_dir / 'garment.json').write_text(json.dumps(item), encoding='utf-8')
            with patch('tools.garment_segmentation.get_yolo_grabcut_provider', side_effect=AssertionError('segmentation called')):
                output = server.get_garment_thumbnail_bytes(root, garment_id)
            image = cv2.imdecode(np.frombuffer(output, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
            self.assertLessEqual(max(image.shape[:2]), 200)
            updated = json.loads((garment_dir / 'garment.json').read_text(encoding='utf-8'))
            self.assertEqual(updated['thumbnailVersion'], 2)

    def test_prepare_creates_missing_thumbnail_from_current_cutout(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            garment_id = str(uuid.uuid4())
            garment_dir = root / garment_id
            garment_dir.mkdir()
            (garment_dir / 'closet.png').write_bytes(self.make_cutout())
            (garment_dir / 'garment.json').write_text(json.dumps({'id': garment_id,
                                                                  'maskPipelineVersion': server.GARMENT_MASK_PIPELINE_VERSION}), encoding='utf-8')
            (root / 'index.json').write_text(json.dumps([{'id': garment_id,
                                                          'maskPipelineVersion': server.GARMENT_MASK_PIPELINE_VERSION}]), encoding='utf-8')
            result = prepare_garment_thumbnails(root, lambda *_: self.fail('cutout already exists'))
            self.assertEqual(result, {'prepared': 1, 'failed': []})
            self.assertTrue((garment_dir / 'closet-thumbnail.png').exists())

    def test_prepare_continues_after_one_garment_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bad_id, good_id = str(uuid.uuid4()), str(uuid.uuid4())
            for garment_id in (bad_id, good_id):
                (root / garment_id).mkdir()
                version = server.GARMENT_MASK_PIPELINE_VERSION if garment_id == good_id else 'stale-mask'
                (root / garment_id / 'garment.json').write_text(json.dumps({'id': garment_id, 'maskPipelineVersion': version}), encoding='utf-8')
            (root / good_id / 'closet.png').write_bytes(self.make_cutout())
            (root / 'index.json').write_text(json.dumps([{'id': bad_id}, {'id': good_id,
                                                                          'maskPipelineVersion': server.GARMENT_MASK_PIPELINE_VERSION}]), encoding='utf-8')
            result = prepare_garment_thumbnails(root, lambda *_: (_ for _ in ()).throw(ValueError('bad cutout')))
            self.assertEqual(result['prepared'], 1)
            self.assertEqual(result['failed'], [bad_id])

    def test_prepare_preserves_measurements_updated_while_cache_is_built(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            garment_id = str(uuid.uuid4())
            garment_dir = root / garment_id
            garment_dir.mkdir()
            item_path = garment_dir / 'garment.json'
            item_path.write_text(json.dumps({'id': garment_id, 'lengthCm': 40,
                                             'maskPipelineVersion': 'stale'}), encoding='utf-8')
            (root / 'index.json').write_text(json.dumps([{'id': garment_id}]), encoding='utf-8')

            def ensure_cutout(*_):
                latest = json.loads(item_path.read_text(encoding='utf-8'))
                latest['lengthCm'] = 52
                item_path.write_text(json.dumps(latest), encoding='utf-8')
                return self.make_cutout()

            result = prepare_garment_thumbnails(root, ensure_cutout)
            self.assertEqual(result, {'prepared': 1, 'failed': []})
            self.assertEqual(json.loads(item_path.read_text(encoding='utf-8'))['lengthCm'], 52)

    def test_source_preview_for_missing_cutout_does_not_run_segmentation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            garments = root / 'garments'
            garment_id = str(uuid.uuid4())
            garment_dir = garments / garment_id
            garment_dir.mkdir(parents=True)
            original = np.full((800, 600, 3), (40, 130, 210), dtype=np.uint8)
            ok, encoded = cv2.imencode('.jpg', original)
            self.assertTrue(ok)
            (garment_dir / 'photo.jpg').write_bytes(encoded.tobytes())
            (garment_dir / 'garment.json').write_text(json.dumps({'id': garment_id, 'name': 'Missing cutout',
                                                                  'maskPipelineVersion': 'old'}), encoding='utf-8')
            httpd = server.create_server('127.0.0.1', 0, root)
            import threading
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                url = f'http://127.0.0.1:{httpd.server_address[1]}/api/garments/{garment_id}/thumbnail'
                with patch('tools.garment_segmentation.get_yolo_grabcut_provider', side_effect=AssertionError('segmentation called')):
                    with urllib.request.urlopen(url, timeout=5) as response:
                        body = response.read()
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.headers.get_content_type(), 'image/jpeg')
                        self.assertEqual(response.headers['Cache-Control'], 'no-store')
                image = cv2.imdecode(np.frombuffer(body, dtype=np.uint8), cv2.IMREAD_COLOR)
                self.assertLessEqual(max(image.shape[:2]), 200)
            finally:
                httpd.shutdown()
                httpd.server_close()
                thread.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
