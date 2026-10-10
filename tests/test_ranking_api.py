import base64

import http.cookiejar

import json

import tempfile

import threading

import unittest

import urllib.error

import urllib.request

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

        self.assertEqual(self.call('/api/auth/me')[1]['user'], {'username': 'minsu', 'name': '민수'})

        self.call('/api/auth/logout', {})

        self.assertEqual(self.call('/api/auth/me')[1]['user'], None)

        self.assertEqual(self.call('/api/auth/login', {'username': 'MinSu', 'password': 'secret1'})[0], 200)

        self.assertEqual(self.call('/api/auth/me')[1]['user']['name'], '민수')



    def test_signup_rejects_bad_or_duplicate_input(self):

        base = {'username': 'minsu', 'password': 'secret1', 'name': '민수'}

        for change in ({'username': 'ab'}, {'username': 'Has Space'}, {'username': '한글아이디'}, {'password': '12345'},

                       {'password': 'minsu'}, {'name': ''}, {'name': '열글자를넘는아주긴이름'}, {'password': 'x' * 65}):

            self.assertEqual(self.call('/api/auth/signup', {**base, **change})[0], 400, change)

        self.login()

        self.assertEqual(self.call('/api/auth/signup', {**base, 'name': '다른이름'})[0], 409)  # 같은 아이디

        self.assertEqual(self.call('/api/auth/signup', {**base, 'username': 'other'})[0], 409)  # 같은 이름



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

        self.assertEqual(self.call('/api/garments', {**garment, 'ownerName': '열글자를넘는아주긴이름'})[0], 400)

        update = {'name': '점퍼', 'category': 'top', 'garmentTypeId': 4, 'gender': 'unknown',

                  'lengthCm': 50, 'widthCm': 45, 'colorName': '파랑', 'ownerName': '하준'}

        status, updated = self.call(f"/api/garments/{saved['id']}/update", update)

        self.assertEqual((status, updated['ownerName']), (200, '하준'))

        self.assertEqual(self.call(f"/api/garments/{saved['id']}/update", {**update, 'ownerName': 'x' * 11})[0], 400)

        legacy = {**garment}  # 올린 사람 없이 등록하는 예전 방식

        self.assertEqual(self.call('/api/garments', legacy)[1].get('ownerName'), '')





if __name__ == '__main__':

    unittest.main()

