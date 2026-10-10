import unittest
from html.parser import HTMLParser
from pathlib import Path


class PipelineGuideParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.steps = 0
        self.current_step = None
        self.step_has_image = False
        self.step_has_heading = False
        self.step_has_explanation = False
        self.steps_are_complete = []
        self.in_heading = False
        self.in_explanation = False
        self.in_technique = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article' and 'pipeline-step' in attrs.get('class', '').split():
            if self.current_step is not None:
                self.steps_are_complete.append(self.current_step)
            self.steps += 1
            self.current_step = {'image': False, 'heading': False, 'explanation': False, 'technique': False}
        elif self.current_step is not None:
            if tag == 'svg':
                self.current_step['image'] = True
            if tag == 'h3':
                self.in_heading = True
            if tag == 'p' and 'pipeline-step-copy' in attrs.get('class', '').split():
                self.in_explanation = True
            if tag == 'div' and 'pipeline-technique' in attrs.get('class', '').split():
                self.in_technique = True

    def handle_endtag(self, tag):
        if tag == 'h3':
            self.in_heading = False
        if tag == 'p':
            self.in_explanation = False
        if tag == 'div' and self.in_technique and self.current_step is not None:
            self.in_technique = False

    def handle_data(self, data):
        if self.current_step is not None and data.strip():
            if self.in_heading:
                self.current_step['heading'] = True
            if self.in_explanation:
                self.current_step['explanation'] = True
            if self.in_technique:
                self.current_step['technique'] = True

    def close(self):
        super().close()
        if self.current_step is not None:
            self.steps_are_complete.append(self.current_step)


class DatasetPipelineGuideTests(unittest.TestCase):
    def test_each_pipeline_step_has_a_picture_title_and_kid_friendly_explanation(self):
        html = (Path(__file__).resolve().parents[1] / 'measure-dataset.html').read_text(encoding='utf-8')
        parser = PipelineGuideParser()
        parser.feed(html)
        parser.close()

        self.assertEqual(parser.steps, 5)
        self.assertEqual(len(parser.steps_are_complete), 5)
        for step in parser.steps_are_complete:
            self.assertTrue(step['image'])
            self.assertTrue(step['heading'])
            self.assertTrue(step['explanation'])
            self.assertTrue(step['technique'])


if __name__ == '__main__':
    unittest.main()
