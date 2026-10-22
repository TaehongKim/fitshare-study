import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class RegistrationPageTests(unittest.TestCase):
    def test_camera_action_opens_video_instead_of_only_a_file_picker(self):
        from html.parser import HTMLParser

        class Elements(HTMLParser):
            def handle_starttag(self, tag, attrs):
                values = dict(attrs)
                if 'id' in values:
                    self.items[values['id']] = (tag, values)

        parser = Elements()
        parser.items = {}
        parser.feed((ROOT / 'measure' / 'register.html').read_text(encoding='utf-8'))
        self.assertIn('open-camera', parser.items, '촬영 버튼이 파일 선택창에만 연결되어 있습니다.')
        self.assertEqual(parser.items['open-camera'][0], 'button')
        self.assertEqual(parser.items['camera-video'][0], 'video')
        self.assertIn('playsinline', parser.items['camera-video'][1])
        self.assertIn('hidden', parser.items['camera-panel'][1])
        self.assertEqual(parser.items['gallery-photo'][1]['type'], 'file')

    def test_school_code_is_prefilled_and_selected_for_easy_replacement(self):
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        app = (ROOT / 'js' / 'app.js').read_text(encoding='utf-8')

        self.assertIn('id="school-code"', html)
        self.assertIn('value="나눔초등학교"', html)
        self.assertIn('placeholder="예: 나눔초등학교"', html)
        self.assertIn("addEventListener('focus', () => schoolInput.select())", app)
        self.assertIn("addEventListener('click', () => schoolInput.select())", app)

    def test_school_entry_shows_a_direct_registration_action(self):
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        app = (ROOT / 'js' / 'app.js').read_text(encoding='utf-8')
        module = (ROOT / 'modules' / 'measurement.js').read_text(encoding='utf-8')

        self.assertIn('id="entry-action"', html)
        self.assertIn('href="measure/register.html"', html)
        self.assertIn('createSchoolEntryResult(input.value)', app)
        self.assertIn('action.hidden = !result.ok', app)
        self.assertNotIn('scrollIntoView', app)
        self.assertIn('href="measure/register.html"', module)
        self.assertIn('href="measure/index.html"', module)

    def test_registration_screen_offers_four_backgrounds_with_m4_selected(self):
        html = (ROOT / 'measure' / 'register.html').read_text(encoding='utf-8')
        script = (ROOT / 'js' / 'measurement' / 'register.js').read_text(encoding='utf-8')
        photo_helper = (ROOT / 'js' / 'measurement' / 'registrationPhoto.js').read_text(encoding='utf-8')

        self.assertIn('id="background-id"', html)
        for mat_id in ('M1', 'M2', 'M3', 'M4'):
            self.assertIn(f'value="{mat_id}"', html)
        self.assertIn('<option value="M4" selected>', html)
        self.assertIn('value="male"', html)
        self.assertIn('value="female"', html)
        self.assertIn('value="unisex"', html)
        self.assertIn('value="unknown"', html)
        self.assertIn('id="garment-type"', html)
        self.assertIn('backgroundId: backgroundInput.value', script)
        self.assertIn('readRegistrationPhoto(file)', script)
        self.assertIn('if (jpegFile)', photo_helper)
        self.assertIn('resolve(reader.result)', photo_helper)
        self.assertIn('image.naturalWidth || image.width', photo_helper)
        self.assertIn('canvas.toDataURL(\'image/jpeg\', 1)', photo_helper)
        self.assertIn('file.size > maxBytes', photo_helper)
        self.assertIn('chosen-garment-type', script)
        self.assertIn("/api/garments'", script)

    def test_both_closet_pages_use_fast_paged_cards_with_edit_and_photo_toggle(self):
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        register_html = (ROOT / 'measure' / 'register.html').read_text(encoding='utf-8')
        closet = (ROOT / 'js' / 'measurement' / 'garmentCloset.js').read_text(encoding='utf-8')
        app = (ROOT / 'js' / 'app.js').read_text(encoding='utf-8')
        registration = (ROOT / 'js' / 'measurement' / 'register.js').read_text(encoding='utf-8')

        self.assertIn('school-closet-pages', html)
        self.assertIn('garment-list-pages', register_html)
        self.assertIn('PAGE_SIZE = 10', closet)
        self.assertIn('loading = \'lazy\'', closet)
        self.assertIn('배경 포함 사진 보기', closet)
        self.assertIn('정보 수정', closet)
        self.assertIn('unknown', closet)
        self.assertIn('createGarmentCloset', app)
        self.assertIn('createGarmentCloset', registration)

if __name__ == '__main__':
    unittest.main()
