import base64

import http.cookiejar

import json

import tempfile

import threading

import unittest

import urllib.error

import urllib.request

import os
from unittest.mock import patch

from pathlib import Path



import server



EMPTY = {'version': 1, 'users': [], 'exchanges': [], 'badges': [], 'finalizedMonths': []}





class RankingApiTests(unittest.TestCase):

    def setUp(self):

        self.temp_dir = tempfile.TemporaryDirectory()

        self.httpd = server.create_server('127.0.0.1', 0, Path(self.temp_dir.name))

        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

        self.thread.start()

        self.base_url = f'http://127.0.0.1:{self.httpd.server_address[1]}'

        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))



    def tearDown(self):

        self.httpd.shutdown()

        self.httpd.server_close()

        self.thread.join(timeout=2)

        self.temp_dir.cleanup()



    def call(self, path, payload=None):

        body = None if payload is None else json.dumps(payload).encode('utf-8')

        request = urllib.request.Request(self.base_url + path, data=body, method='GET' if body is None else 'POST')

        if body is not None:

            request.add_header('Content-Type', 'application/json')

        try:

            with self.opener.open(request, timeout=15) as response:

                return response.status, json.loads(response.read().decode('utf-8'))

        except urllib.error.HTTPError as error:

            return error.code, json.loads(error.read().decode('utf-8'))



    def login(self, username='minsu', name='민수'):

        status, result = self.call('/api/auth/signup', {'username': username, 'password': 'secret1', 'name': name})

        self.assertEqual(status, 201, result)



    def test_empty_ranking_then_save_and_read_back(self):

        self.login()

        self.assertEqual(self.call('/api/ranking'), (200, {'rev': 0, 'state': None}))

        state = {**EMPTY, 'users': [{'id': 'u1', 'name': '민수'}]}

        self.assertEqual(self.call('/api/ranking', {'baseRev': 0, 'state': state}), (200, {'rev': 1}))

        self.assertEqual(self.call('/api/ranking'), (200, {'rev': 1, 'state': state}))



    def test_stale_save_is_refused_with_latest_state(self):

        self.login()

        first = {**EMPTY, 'users': [{'id': 'u1', 'name': '민수'}]}

        self.call('/api/ranking', {'baseRev': 0, 'state': first})

        status, result = self.call('/api/ranking', {'baseRev': 0, 'state': EMPTY})

        self.assertEqual(status, 409)

        self.assertEqual((result['rev'], result['state']), (1, first))

        self.assertEqual(self.call('/api/ranking')[1]['state'], first)



    def test_malformed_ranking_is_rejected(self):

        self.login()

        for payload in ({'baseRev': 0}, {'baseRev': 'x', 'state': EMPTY}, {'baseRev': 0, 'state': {'users': []}}, {'baseRev': True, 'state': EMPTY}):

            self.assertEqual(self.call('/api/ranking', payload)[0], 400)

        self.assertEqual(self.call('/api/ranking')[1]['rev'], 0)



    def test_ranking_cannot_be_saved_without_login(self):

        self.assertEqual(self.call('/api/ranking', {'baseRev': 0, 'state': EMPTY})[0], 401)

        self.assertEqual(self.call('/api/ranking')[1]['rev'], 0)



    def test_signup_login_logout_and_me(self):

        self.assertEqual(self.call('/api/auth/me'), (200, {'user': None}))

        self.login('minsu', '민수')

        self.assertEqual(self.call('/api/auth/me')[1]['user'], {'username': 'minsu', 'name': '민수', 'role': 'student'})

        self.call('/api/auth/logout', {})

        self.assertEqual(self.call('/api/auth/me')[1]['user'], None)

        self.assertEqual(self.call('/api/auth/login', {'username': 'MinSu', 'password': 'secret1'})[0], 200)

        self.assertEqual(self.call('/api/auth/me')[1]['user']['name'], '민수')



    def test_signup_rejects_bad_or_duplicate_input(self):

        base = {'username': 'minsu', 'password': 'secret1', 'name': '민수'}

        for change in ({'username': ''}, {'username': '   '}, {'username': 'a' * 201}, {'password': ''},

                       {'name': ''}, {'name': '가' * 201}, {'password': 'x' * 201}):

            self.assertEqual(self.call('/api/auth/signup', {**base, **change})[0], 400, change)

        self.login()

        self.assertEqual(self.call('/api/auth/signup', {**base, 'name': '다른이름'})[0], 409)  # 같은 아이디

        self.assertEqual(self.call('/api/auth/signup', {**base, 'username': 'other'})[0], 409)  # 같은 이름

    def test_teacher_signup_requires_code_and_client_role_is_ignored(self):
        self.assertEqual(self.call('/api/auth/signup', {'username': 'badteacher', 'password': 'pw',
                                                        'name': 'Bad', 'role': 'teacher'})[1]['user']['role'], 'student')
        status, teacher = self.call('/api/auth/signup', {'username': 'teacher', 'password': 'pw',
                                                         'name': 'Teacher', 'role': 'student',
                                                         'teacherCode': 'fitshare'})
        self.assertEqual(status, 201)
        self.assertEqual(teacher['user']['role'], 'teacher')

    def test_teacher_account_routes_require_teacher_and_revoke_student_sessions(self):
        self.assertEqual(self.call('/api/auth/teacher-code', {'newCode': 'changed'})[0], 401)
        self.login('student', 'Student')
        self.assertEqual(self.call('/api/auth/teacher-code', {'newCode': 'changed'})[0], 403)
        self.call('/api/auth/logout', {})
        status, teacher = self.call('/api/auth/signup', {'username': 'teacher', 'password': 'pw', 'name': 'Teacher',
                                                        'teacherCode': 'fitshare'})
        self.assertEqual((status, teacher['user']['role']), (201, 'teacher'))
        student_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        login = urllib.request.Request(self.base_url + '/api/auth/login', data=json.dumps(
            {'username': 'student', 'password': 'secret1'}).encode(),
            headers={'Content-Type': 'application/json'}, method='POST')
        student_opener.open(login).read()
        self.assertEqual(self.call('/api/auth/teacher-code', {'newCode': 'changed'}), (200, {'ok': True}))
        status, result = self.call('/api/auth/reset-student-password',
                                   {'username': 'student', 'newPassword': 'reset'})
        self.assertEqual((status, result), (200, {'ok': True}))
        self.assertIsNone(json.loads(student_opener.open(self.base_url + '/api/auth/me').read())['user'])
        self.assertEqual(self.call('/api/auth/signup', {'username': 'oldcode', 'password': 'pw', 'name': 'Old',
                                                        'teacherCode': 'fitshare'})[0], 400)
        status, new_teacher = self.call('/api/auth/signup', {'username': 'newcode', 'password': 'pw', 'name': 'New',
                                                             'teacherCode': 'changed'})
        self.assertEqual((status, new_teacher['user']['role']), (201, 'teacher'))

    def add_saved_garment(self):
        garment_id = 'a4831e58-d3d0-4e96-a7c8-b12734037a6c'
        root = Path(self.temp_dir.name) / 'garments'
        folder = root / garment_id
        folder.mkdir(parents=True)
        source = b'original photo stays unchanged'
        cutout = b'\x89PNG\r\n\x1a\ntransparent cutout'
        (folder / 'photo.jpg').write_bytes(source)
        (folder / 'closet.png').write_bytes(cutout)
        item = {'id': garment_id, 'name': 'Sample', 'maskPipelineVersion': server.GARMENT_MASK_PIPELINE_VERSION,
                'photoUrl': f'/api/garments/{garment_id}/photo'}
        (folder / 'garment.json').write_text(json.dumps(item), encoding='utf-8')
        (root / 'index.json').write_text(json.dumps([item]), encoding='utf-8')
        return garment_id, source

    def test_product_photo_is_teacher_only_and_saved_separately(self):
        garment_id, source = self.add_saved_garment()
        self.assertEqual(self.call(f'/api/garments/{garment_id}/product-photo', {})[0], 401)
        for suffix in range(10):
            self.assertEqual(self.call(f'/api/garments/missing-{suffix}/product-photo', {})[0], 401)
        self.assertEqual(self.httpd.product_generation_locks, {})
        self.login('student', 'Student')
        self.assertEqual(self.call(f'/api/garments/{garment_id}/product-photo', {})[0], 403)
        self.call('/api/auth/logout', {})
        self.call('/api/auth/signup', {'username': 'teacher', 'password': 'pw', 'name': 'Teacher',
                                       'teacherCode': 'fitshare'})
        generated = b'\x89PNG\r\n\x1a\nproduct photo'
        with patch('tools.replicate_product_photo.generate_product_photo', return_value=(generated, 'image/png')) as generate:
            with patch.dict(os.environ, {'REPLICATE_API_TOKEN': 'test-token', 'REPLICATE_PRODUCT_MODEL_VERSION': 'test-version'}):
                status, response = self.call(f'/api/garments/{garment_id}/product-photo', {})
                self.assertEqual(status, 201)
                self.assertEqual(response['productPhotoUrl'], f'/api/garments/{garment_id}/product-photo')
                status, cached = self.call(f'/api/garments/{garment_id}/product-photo', {})
                self.assertEqual(status, 200)
                self.assertEqual(cached, response)
                request = urllib.request.Request(self.base_url + response['productPhotoUrl'])
                with self.opener.open(request) as result:
                    self.assertEqual(result.headers.get_content_type(), 'image/png')
                    self.assertEqual(result.read(), generated)
            self.assertEqual(generate.call_count, 1)
        student_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        signup = urllib.request.Request(self.base_url + '/api/auth/signup', data=json.dumps(
            {'username': 'viewer', 'password': 'pw', 'name': 'Viewer'}).encode(),
            headers={'Content-Type': 'application/json'}, method='POST')
        student_opener.open(signup).read()
        with self.assertRaises(urllib.error.HTTPError) as denied:
            student_opener.open(self.base_url + f'/api/garments/{garment_id}/product-photo')
        self.assertEqual(denied.exception.code, 403)
        folder = Path(self.temp_dir.name) / 'garments' / garment_id
        self.assertEqual((folder / 'photo.jpg').read_bytes(), source)
        self.assertTrue((folder / 'product-photo.png').exists())
        saved = json.loads((folder / 'garment.json').read_text(encoding='utf-8'))
        self.assertEqual(saved['photoUrl'], f'/api/garments/{garment_id}/photo')
        self.assertEqual(saved['productPhotoFile'], 'product-photo.png')

    def test_product_photo_reports_missing_server_configuration(self):
        garment_id, _ = self.add_saved_garment()
        self.call('/api/auth/signup', {'username': 'teacher', 'password': 'pw', 'name': 'Teacher',
                                       'teacherCode': 'fitshare'})
        with patch('server.get_replicate_api_token', return_value=''), patch(
                'server.get_replicate_product_model_version', return_value=''):
            status, result = self.call(f'/api/garments/{garment_id}/product-photo', {})
        self.assertEqual(status, 503)
        self.assertIn('서버에', result['error'])

    def test_nonexistent_garments_do_not_allocate_generation_locks(self):
        self.call('/api/auth/signup', {'username': 'teacher', 'password': 'pw', 'name': 'Teacher',
                                       'teacherCode': 'fitshare'})
        for suffix in range(10):
            self.assertEqual(self.call(f'/api/garments/{suffix:08d}-0000-4000-8000-000000000000/product-photo', {})[0], 404)
        self.assertEqual(self.httpd.product_generation_locks, {})

    def test_concurrent_product_photo_requests_generate_once(self):
        garment_id, _ = self.add_saved_garment()
        self.call('/api/auth/signup', {'username': 'teacher', 'password': 'pw', 'name': 'Teacher',
                                       'teacherCode': 'fitshare'})
        generated = b'\x89PNG\r\n\x1a\nproduct photo'
        statuses = []

        def slow_generate(*_args):
            import time
            time.sleep(0.25)
            return generated, 'image/png'

        def request_photo():
            statuses.append(self.call(f'/api/garments/{garment_id}/product-photo', {})[0])

        with patch('tools.replicate_product_photo.generate_product_photo', side_effect=slow_generate) as generate:
            with patch.dict(os.environ, {'REPLICATE_API_TOKEN': 'test-token', 'REPLICATE_PRODUCT_MODEL_VERSION': 'test-version'}):
                requests = [threading.Thread(target=request_photo) for _ in range(2)]
                for request in requests:
                    request.start()
                for request in requests:
                    request.join(timeout=5)
            self.assertEqual(generate.call_count, 1)
        self.assertEqual(sorted(statuses), [200, 201])

    def test_failed_product_generation_leaves_source_and_record_untouched(self):
        garment_id, source = self.add_saved_garment()
        self.call('/api/auth/signup', {'username': 'teacher', 'password': 'pw', 'name': 'Teacher',
                                       'teacherCode': 'fitshare'})
        from tools.replicate_product_photo import ProductPhotoError
        with patch('server.get_replicate_api_token', return_value='test-token'), patch(
                'server.get_replicate_product_model_version', return_value='test-version'), patch(
                'tools.replicate_product_photo.generate_product_photo', side_effect=ProductPhotoError('provider failed')):
            status, result = self.call(f'/api/garments/{garment_id}/product-photo', {})
        self.assertEqual(status, 502)
        folder = Path(self.temp_dir.name) / 'garments' / garment_id
        self.assertEqual((folder / 'photo.jpg').read_bytes(), source)
        saved = json.loads((folder / 'garment.json').read_text(encoding='utf-8'))
        self.assertNotIn('productPhotoFile', saved)

    def test_wrong_password_is_refused_and_locks_after_five_tries(self):

        self.login()

        self.call('/api/auth/logout', {})

        for _ in range(5):

            self.assertEqual(self.call('/api/auth/login', {'username': 'minsu', 'password': 'wrong-one'})[0], 401)

        self.assertEqual(self.call('/api/auth/login', {'username': 'minsu', 'password': 'secret1'})[0], 429)

        self.assertEqual(self.call('/api/auth/login', {'username': 'nobody', 'password': 'secret1'})[0], 401)



    def test_password_is_not_stored_in_plain_text(self):

        self.login()

        saved = (Path(self.temp_dir.name) / 'accounts.json').read_text(encoding='utf-8')

        sessions = (Path(self.temp_dir.name) / 'sessions.json').read_text(encoding='utf-8')

        self.assertNotIn('secret1', saved)

        cookie = [c for c in self.opener.handlers if isinstance(c, urllib.request.HTTPCookieProcessor)][0].cookiejar

        token = next(c.value for c in cookie if c.name == 'fitshare_session')

        self.assertNotIn(token, sessions)



    def test_logged_in_user_owns_uploads_and_only_edits_own_garments(self):

        photo = 'data:image/jpeg;base64,' + base64.b64encode(bytes([255, 216, 255]) + b'sample').decode('ascii')
        garment = {'name': '점퍼', 'category': 'top', 'garmentTypeId': 4, 'gender': 'unknown',

                   'lengthCm': 50, 'widthCm': 45, 'colorName': '파랑', 'photoDataUrl': photo}

        self.login('minsu', '민수')

        status, saved = self.call('/api/garments', {**garment, 'ownerName': '다른사람'})

        self.assertEqual((status, saved['ownerName']), (201, '민수'))  # 올린 사람은 로그인한 나로 정해져요

        self.call('/api/auth/logout', {})

        self.login('jisu', '지수')

        update = {key: garment[key] for key in ('name', 'category', 'garmentTypeId', 'gender', 'lengthCm', 'widthCm', 'colorName')}

        self.assertEqual(self.call(f"/api/garments/{saved['id']}/update", update)[0], 403)



    def test_garment_keeps_owner_name_and_rejects_long_names(self):

        photo = 'data:image/jpeg;base64,' + base64.b64encode(bytes([255, 216, 255]) + b'sample').decode('ascii')
        garment = {'name': '점퍼', 'category': 'top', 'garmentTypeId': 4, 'gender': 'unknown',

                   'lengthCm': 50, 'widthCm': 45, 'colorName': '파랑', 'photoDataUrl': photo}

        status, saved = self.call('/api/garments', {**garment, 'ownerName': ' 지수 '})

        self.assertEqual((status, saved['ownerName']), (201, '지수'))

        self.assertEqual(self.call('/api/garments')[1][0]['ownerName'], '지수')

        self.assertEqual(self.call('/api/garments', {**garment, 'ownerName': '가' * 201})[0], 400)

        update = {'name': '점퍼', 'category': 'top', 'garmentTypeId': 4, 'gender': 'unknown',

                  'lengthCm': 50, 'widthCm': 45, 'colorName': '파랑', 'ownerName': '하준'}

        status, updated = self.call(f"/api/garments/{saved['id']}/update", update)

        self.assertEqual((status, updated['ownerName']), (200, '하준'))

        self.assertEqual(self.call(f"/api/garments/{saved['id']}/update", {**update, 'ownerName': 'x' * 201})[0], 400)

        legacy = {**garment}  # 올린 사람 없이 등록하는 예전 방식

        self.assertEqual(self.call('/api/garments', legacy)[1].get('ownerName'), '')





if __name__ == '__main__':

    unittest.main()

