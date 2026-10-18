import http.cookiejar
import json
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from tests import test_garment_registration as fixtures
from tests import test_garment_metadata as metadata_fixtures
from tools.clothing_wishes import matches


class ClothingWishTests(unittest.TestCase):
    setUp = fixtures.GarmentRegistrationTests.setUp
    tearDown = fixtures.GarmentRegistrationTests.tearDown
    request_json = fixtures.GarmentRegistrationTests.request_json
    post_error = fixtures.GarmentRegistrationTests.post_error
    payload = metadata_fixtures.GarmentMetadataApiTests.payload

    def signup(self, name='wish-user'):
        self.request_json('/api/auth/signup', 'POST', {'username': name, 'name': name, 'password': 'test-pw'})

    def wish(self, **changes):
        filters = dict(gender='남학생', size='140', season='가을', category='상의', style='단정한 스타일', color='밝은 색')
        filters.update(changes)
        return self.request_json('/api/clothing-wishes', 'POST', {'filters': filters})[1]['wishes'][-1]

    def donate(self, **changes):
        return self.request_json('/api/garments', 'POST', {**self.payload(), **changes})[1]

    def test_future_matching_donations_only_and_persistent_read_state(self):
        self.signup()
        self.donate(name='existing')
        wish = self.wish()
        self.assertEqual(wish['matches'], [])
        self.donate(name='wrong size', size='150')
        first = self.donate(name='matching')
        data = self.request_json('/api/clothing-wishes')[1]['wishes']
        self.assertEqual([item['id'] for item in data[0]['matches']], [first['id']])
        self.assertTrue(data[0]['matches'][0]['unread'])
        self.request_json('/api/clothing-wishes/' + wish['id'] + '/read', 'POST', {})
        self.assertFalse(self.request_json('/api/clothing-wishes')[1]['wishes'][0]['matches'][0]['unread'])
        second = self.donate(name='another matching')
        items = self.request_json('/api/clothing-wishes')[1]['wishes'][0]['matches']
        self.assertEqual({item['id']: item['unread'] for item in items}, {first['id']: False, second['id']: True})
        # New HTTP session still sees the persisted wish and read state.
        self.request_json('/api/auth/logout', 'POST', {})
        self.request_json('/api/auth/login', 'POST', {'username': 'wish-user', 'password': 'test-pw'})
        self.assertEqual(self.request_json('/api/clothing-wishes')[1]['wishes'][0]['matches'], items)
        stored = json.loads((Path(self.temp_dir.name) / 'clothing-wishes.json').read_text(encoding='utf-8'))
        self.assertEqual(stored[0]['readIds'], [first['id']])

    def test_account_isolation_and_delete(self):
        self.signup()
        first = self.wish()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.signup('other-user')
        self.assertEqual(self.request_json('/api/clothing-wishes')[1]['wishes'], [])
        for method, suffix in [('DELETE', ''), ('POST', '/read')]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request_json('/api/clothing-wishes/' + first['id'] + suffix, method, {} if method == 'POST' else None)
            self.assertEqual(error.exception.code, 404)
        own = self.wish()
        self.assertEqual(self.request_json('/api/clothing-wishes/' + own['id'], 'DELETE')[1]['wishes'], [])
        self.request_json('/api/auth/login', 'POST', {'username': 'wish-user', 'password': 'test-pw'})
        self.assertEqual(len(self.request_json('/api/clothing-wishes')[1]['wishes']), 1)

    def test_auth_invalid_duplicate_and_limit(self):
        for method, path, payload in [('GET', '', None), ('POST', '', {}), ('DELETE', '/missing', None), ('POST', '/missing/read', {})]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request_json('/api/clothing-wishes' + path, method, payload)
            self.assertEqual(error.exception.code, 401)
        self.signup()
        for filters in (None, [], {'size': 140}, {'size': '999'}, {'size': []}, {}, {'style': '<script>'}):
            self.post_error('/api/clothing-wishes', {'filters': filters}, 400)
        self.wish()
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.wish()
        self.assertEqual(error.exception.code, 409)
        for size in ('100', '110', '120', '130', '150', '160', '170'):
            self.wish(size=size)
        for size in ('100', '110', '120', '130', '140', '150', '160', '170'):
            self.wish(size=size, season='겨울')
        for size in ('100', '110', '120', '130'):
            self.wish(size=size, season='여름')
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.wish(size='140', season='여름')
        self.assertEqual(error.exception.code, 400)

    def test_deleted_demo_unknown_fields_and_multi_season(self):
        self.signup()
        wish = self.wish()
        for change in ({'size': ''}, {'seasons': [], 'season': ''}, {'style': ''}, {'gender': 'unknown'}, {'colorName': 'unknown'}, {'category': 'pants'}):
            self.assertFalse(matches({**self.payload(), **change}, wish['filters']))
        self.assertTrue(matches(self.payload(), wish['filters']))
        self.assertFalse(matches({**self.payload(), 'isDemo': True}, wish['filters']))
        saved = self.donate()
        self.assertEqual(len(self.request_json('/api/clothing-wishes')[1]['wishes'][0]['matches']), 1)
        index = Path(self.temp_dir.name) / 'garments' / 'index.json'
        index.write_text('[]', encoding='utf-8')
        self.assertEqual(self.request_json('/api/clothing-wishes')[1]['wishes'][0]['matches'], [])

    def test_corrupt_storage_is_not_overwritten(self):
        self.signup()
        self.wish()
        path = Path(self.temp_dir.name) / 'clothing-wishes.json'
        for content in ('broken json', '{}', '[{}]'):
            path.write_text(content, encoding='utf-8')
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.wish(size='150')
            self.assertEqual(error.exception.code, 500)
            self.assertEqual(path.read_text(encoding='utf-8'), content)


if __name__ == '__main__':
    unittest.main()
