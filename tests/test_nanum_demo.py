import json
import csv
import tempfile
import unittest
from pathlib import Path

from tools.accounts import AccountStore
from tools.seed_nanum_demo import seed_demo


class NanumDemoSeedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.destination = self.root / 'nanum-demo'
        garments = self.source / 'garments'
        garments.mkdir(parents=True)
        records = []
        for number in range(20):
            garment_id = f'garment-{number + 1}'
            folder = garments / garment_id
            folder.mkdir()
            item = {'id': garment_id, 'name': f'상의 {number + 1}', 'category': 'top',
                    'garmentTypeId': 1, 'garmentTypeName': '상의', 'ownerName': '기존 체험 옷장',
                    'photoUrl': f'/api/garments/{garment_id}/photo', 'lengthCm': 40, 'widthCm': 30}
            (folder / 'garment.json').write_text(json.dumps(item, ensure_ascii=False), encoding='utf-8')
            (folder / 'photo.jpg').write_bytes(b'original-photo')
            records.append(item)
        (garments / 'index.json').write_text(json.dumps(records, ensure_ascii=False), encoding='utf-8')
        (self.source / 'accounts.json').write_text('{"keep":"original"}', encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def test_seeds_twenty_accounts_all_garments_and_mutual_ranking_records(self):
        summary = seed_demo(self.source, self.destination)

        self.assertEqual(summary['students'], 20)
        self.assertEqual(summary['garments'], 20)
        accounts = json.loads((self.destination / 'accounts.json').read_text(encoding='utf-8'))
        self.assertEqual(len(accounts), 20)
        with (self.destination / 'demo-accounts.csv').open(encoding='utf-8-sig', newline='') as stream:
            credentials = list(csv.DictReader(stream))
        self.assertEqual(len(credentials), 20)
        store = AccountStore(self.destination)
        for credential in credentials:
            number = int(credential['username'][1:])
            self.assertEqual(credential['username'], f'n{number}')
            self.assertEqual(credential['password'], credential['username'])
            user = store.login(credential['username'], credential['password'])
            self.assertEqual(user['role'], 'student')
        items = json.loads((self.destination / 'garments' / 'index.json').read_text(encoding='utf-8'))
        self.assertEqual(len(items), 20)
        self.assertEqual({item['ownerUsername'] for item in items}, {f'n{n}' for n in range(1, 21)})
        ranking = json.loads((self.destination / 'ranking.json').read_text(encoding='utf-8'))['state']
        self.assertEqual(len(ranking['users']), 20)
        self.assertEqual(len(ranking['exchanges']), 20)
        self.assertTrue(all(exchange['status'] == 'completed' and exchange['revealedAt']
                            and exchange['giverToReceiver'] and exchange['receiverToGiver']
                            for exchange in ranking['exchanges']))
        self.assertEqual((self.source / 'accounts.json').read_text(encoding='utf-8'), '{"keep":"original"}')
        self.assertEqual((self.source / 'garments' / 'garment-1' / 'photo.jpg').read_bytes(), b'original-photo')

    def test_refuses_to_overwrite_an_existing_demo_directory(self):
        self.destination.mkdir()
        marker = self.destination / 'keep.txt'
        marker.write_text('keep', encoding='utf-8')

        with self.assertRaises(FileExistsError):
            seed_demo(self.source, self.destination)

        self.assertEqual(marker.read_text(encoding='utf-8'), 'keep')

    def test_allows_demo_under_data_root_but_not_inside_original_garments(self):
        summary = seed_demo(self.source, self.source / 'nanum-demo')
        self.assertEqual(summary['garments'], 20)
        with self.assertRaises(ValueError):
            seed_demo(self.source, self.source / 'garments' / 'nanum-demo')

    def test_demo_school_query_prefills_nanum_and_nanum_is_the_default(self):
        html = (Path(__file__).resolve().parents[1] / 'index.html').read_text(encoding='utf-8')
        app = (Path(__file__).resolve().parents[1] / 'js' / 'app.js').read_text(encoding='utf-8')
        self.assertIn('id="school-code" value="나눔초등학교"', html)
        self.assertIn("new URLSearchParams(window.location.search).get('school')", app)
        self.assertIn('schoolInput.value = requestedSchool.slice(0, 30)', app)


if __name__ == '__main__':
    unittest.main()
