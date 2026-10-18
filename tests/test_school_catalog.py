import collections
import json
import hashlib
from pathlib import Path
import unittest
from urllib.request import urlopen
from tools.garment_thumbnails import prepare_garment_thumbnails

ROOT = Path(__file__).resolve().parents[1]


class SchoolCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / 'data/schoolCatalog.json').read_text(encoding='utf-8'))
        cls.index = json.loads((ROOT / 'server-data/garments/index.json').read_text(encoding='utf-8'))
        cls.active = [item for item in cls.index if item.get('isDemo')]

    def test_counts_and_preserved_records(self):
        self.assertEqual(collections.Counter(x['category'] for x in self.catalog), {'top': 12, 'pants': 12})
        self.assertEqual(len({x['id'] for x in self.catalog}), 24)
        self.assertEqual(collections.Counter((x['season'], x['category']) for x in self.catalog),
                         {(season, category): 3 for season in ('봄', '여름', '가을', '겨울') for category in ('top', 'pants')})
        self.assertEqual(len(self.index), len(self.active) + 6)
        self.assertEqual(sum(not x.get('isDemo') for x in self.index), 6)
        self.assertTrue(all(x.get('sourceType') != 'retail-catalog' for x in self.index))
        self.assertFalse(any(x['name'].startswith('[가상]') for x in self.index))

    def test_single_size_and_explicit_demo_measurements(self):
        for item in self.catalog:
            self.assertIn(item['size'], {'120', '130', '140', '150', '160'})
            self.assertTrue(0 < item['lengthCm'] <= 300)
            self.assertTrue(0 < item['widthCm'] <= 300)
            self.assertEqual(item['measurementStatus'], 'demo')
            self.assertEqual(item['ownerName'], '체험 옷장')
            self.assertIn(item['garmentTypeId'], (1, 5))
            self.assertNotIn('availableSizes', item)
            self.assertTrue(item['sourceUrl'].startswith('https://www.uniqlo.com/kr/ko/products/'))

    def test_demo_diversity_and_seasonal_outfit_coverage(self):
        self.assertEqual({item['style'] for item in self.active}, {'편한 스타일','활동적인 스타일','단정한 스타일'})
        self.assertEqual({item['condition'] for item in self.active}, {'좋음','보통'})
        for season in ('봄','여름','가을','겨울'):
            tops={item['size'] for item in self.active if item['category']=='top' and season in item['seasons']}
            bottoms={item['size'] for item in self.active if item['category']=='pants' and season in item['seasons']}
            self.assertTrue(tops & bottoms, f'{season} needs a same-size top and bottom')
        for item in self.active:
            self.assertTrue(all(item.get(key) for key in ('garmentKind','sleeveLength','bottomLength','thickness','stretch','pattern')))

    def test_index_metadata_and_photo_integrity(self):
        for item in self.active:
            directory = ROOT / 'server-data/garments' / item['id']
            self.assertEqual(json.loads((directory / 'garment.json').read_text(encoding='utf-8')), item)
            self.assertEqual(next(x for x in self.index if x['id'] == item['id']), item)
            photo = (directory / 'photo.jpg').read_bytes()
            self.assertTrue(photo.startswith(b'\xff\xd8') and photo.endswith(b'\xff\xd9'))
            self.assertEqual(item['imageKind'], 'garment-only')
            self.assertEqual(item['imageReviewStatus'], 'verified')
            self.assertEqual(hashlib.sha256(photo).hexdigest(), item['imageReviewSha256'])
            self.assertTrue((directory / 'closet.png').read_bytes().startswith(b'\x89PNG'))
            self.assertTrue((directory / 'closet-thumbnail.png').read_bytes().startswith(b'\x89PNG'))

    def test_retail_photos_skip_measurement_segmentation(self):
        import tempfile
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            item = self.catalog[0]
            (root / 'index.json').write_text(json.dumps([item]), encoding='utf-8')
            (root / item['id']).mkdir()
            (root / item['id'] / 'garment.json').write_text(json.dumps(item), encoding='utf-8')
            (root / item['id'] / 'closet-thumbnail.png').write_bytes(b'cached thumbnail')
            def unexpected_segmentation(*args):
                self.fail('Retail photo must not run measurement segmentation')
            self.assertEqual(prepare_garment_thumbnails(root, unexpected_segmentation), {'prepared': 0, 'failed': []})

    def test_live_catalog_and_photos(self):
        with urlopen('http://127.0.0.1:8000/api/garments', timeout=10) as response:
            self.assertEqual(len(json.load(response)), len(self.index))
        with urlopen('http://127.0.0.1:8000/data/schoolCatalog.json', timeout=10) as response:
            self.assertEqual(json.load(response), self.catalog)
        for item in self.active:
            with urlopen(f"http://127.0.0.1:8000/api/garments/{item['id']}/photo", timeout=10) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers['Content-Type'], 'image/jpeg')
                self.assertTrue(response.read().startswith(b'\xff\xd8'))
            for endpoint in ('closet-photo', 'thumbnail'):
                with urlopen(f"http://127.0.0.1:8000/api/garments/{item['id']}/{endpoint}", timeout=10) as response:
                    self.assertEqual(response.status, 200)
                    self.assertTrue(response.read().startswith(b'\x89PNG'))


if __name__ == '__main__':
    unittest.main()
