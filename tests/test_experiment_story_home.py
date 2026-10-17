import unittest
from html.parser import HTMLParser
from pathlib import Path


PAGE = Path(__file__).resolve().parents[1] / 'docs' / 'index.html'


class HomeParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.buttons = []
        self.ids = set()
        self.controls = set()
        self.hidden = []
        self.image_alts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        if attrs.get('aria-controls'):
            self.controls.update(attrs['aria-controls'].split())
        if tag == 'button' and attrs.get('data-story-target'):
            self.buttons.append(attrs['data-story-target'].lstrip('#'))
        if attrs.get('hidden') is not None:
            self.hidden.append(attrs.get('id'))
        if tag == 'img':
            self.image_alts.append(attrs.get('alt', ''))


class ExperimentStoryHomeTests(unittest.TestCase):
    def test_home_reads_like_a_childs_question_and_experiment_log(self):
        html = PAGE.read_text(encoding='utf-8')
        parser = HomeParser()
        parser.feed(html)

        for phrase in ('왜 그럴까?', '내 생각', '바꿔 본 것', '알게 된 점', '다음 질문'):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, html)
        self.assertGreaterEqual(len(parser.buttons), 3)
        self.assertEqual(len(parser.buttons), len(set(parser.buttons)))
        self.assertTrue(parser.controls.issubset(parser.ids))
        self.assertEqual(len(parser.buttons), len(parser.controls))

    def test_story_links_to_real_experiments_and_generated_art(self):
        html = PAGE.read_text(encoding='utf-8')
        parser = HomeParser()
        parser.feed(html)

        for path in (
            'measure-dataset.html', 'measure-dataset-round4.html',
            'measure-dataset-round5.html', 'measure-dataset-round8.html',
            'measurement-process.html#ratio-example',
            'assets/measurement-story-hero.png',
        ):
            with self.subTest(path=path):
                self.assertIn(path, html)
        self.assertTrue(any(alt.strip() for alt in parser.image_alts))
        self.assertIn('848px', html)
        self.assertIn('20장', html)
        self.assertIn('한 가지씩', html)


if __name__ == '__main__':
    unittest.main()
