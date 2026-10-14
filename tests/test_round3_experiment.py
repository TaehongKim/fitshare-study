import unittest
import json
import inspect
import shutil
import tempfile
import threading
from pathlib import Path
from unittest import mock
import urllib.error
import urllib.request

import server
import tools.vision_pipeline as vision_pipeline
import tools.measure_dataset as measure_dataset
import tools.replicate_gemini as replicate_gemini


ROOT = Path(__file__).resolve().parents[1]


class ConditionalRectificationTests(unittest.TestCase):
    def test_front_facing_mat_uses_affine_alignment_without_perspective_warp(self):
        self.assertTrue(hasattr(vision_pipeline, 'choose_rectification_mode'))
        import numpy as np

        source = np.asarray([[0, 0], [200, 0], [200, 300], [0, 300]], dtype=float)
        target = np.asarray([[0, 0], [600, 0], [600, 900], [0, 900]], dtype=float)

        decision = vision_pipeline.choose_rectification_mode(source, target)

        self.assertEqual(decision['mode'], 'affine')
        self.assertLess(decision['perspectiveScore'], decision['threshold'])

    def test_perspective_trapezoid_uses_projective_flattening(self):
        self.assertTrue(hasattr(vision_pipeline, 'choose_rectification_mode'))
        import numpy as np

        source = np.asarray([[35, 10], [165, 10], [200, 300], [0, 300]], dtype=float)
        target = np.asarray([[0, 0], [600, 0], [600, 900], [0, 900]], dtype=float)

        decision = vision_pipeline.choose_rectification_mode(source, target)

        self.assertEqual(decision['mode'], 'perspective')
        self.assertGreaterEqual(decision['perspectiveScore'], decision['threshold'])

    def test_dot_background_calibration_uses_ten_centimeter_spacing(self):
        import numpy as np

        source = ROOT / 'measure_dataset' / 'point' / 'p_1_w55_h65.jpg'
        image = vision_pipeline._resize_long_side(vision_pipeline._read_image(source))
        _, target, _ = vision_pipeline._detect_dot_mat(image, accurate_grid=True)

        self.assertAlmostEqual(float(np.linalg.norm(target[1] - target[0])) / 8, 10 * 600 / 84.1, delta=1.0)
        self.assertAlmostEqual(float(np.linalg.norm(target[3] - target[0])) / 11, 10 * 848 / 118.9, delta=1.0)

    def test_pattern_spacing_is_converted_to_cm_per_pixel(self):
        scale = vision_pipeline._cm_per_pixel_from_spacing(50, 80, 10, 5)

        self.assertEqual(scale, {'x': 0.2, 'y': 0.0625})

    def test_pattern_spacing_must_be_positive(self):
        with self.assertRaisesRegex(ValueError, '배경 무늬'):
            vision_pipeline._cm_per_pixel_from_spacing(0, 80, 10, 5)

    def test_charuco_marker_side_is_scaled_to_the_25cm_board_cell(self):
        marker_px = 12
        cell_px = marker_px * (vision_pipeline.CHARUCO_SQUARE_SIZE_CM /
                               vision_pipeline.CHARUCO_MARKER_SIZE_CM)
        scale = vision_pipeline._cm_per_pixel_from_spacing(cell_px, cell_px, 2.5, 2.5)

        self.assertAlmostEqual(cell_px, 16)
        self.assertAlmostEqual(scale['x'], 2.5 / 16)
        self.assertAlmostEqual(scale['y'], 2.5 / 16)

    def test_rectification_returns_scale_measured_from_each_mat_pattern(self):
        examples = (
            ('point', 'point', 'p_1_w55_h65.jpg'),
            ('cross', 'cross', 'c_1_w55_h65.jpg'),
            ('ChArUco', 'ChArUco', 'ch_1_w55_h65.jpg'),
            ('ChaArUco_Cross', 'ChaArUco_Cross', 'chc_1_w55_h65.jpg'),
        )

        for background_id, folder, filename in examples:
            with self.subTest(background=background_id):
                path = ROOT / 'measure_dataset' / folder / filename
                flattened = vision_pipeline.rectify_photo(path, background_id)

                self.assertTrue(flattened['ok'], flattened.get('message'))
                scale = flattened['scaleCmPerPixel']
                self.assertGreater(scale['x'], 0.10)
                self.assertLess(scale['x'], 0.22)
                self.assertGreater(scale['y'], 0.10)
                self.assertLess(scale['y'], 0.22)


class Round3ReportTests(unittest.TestCase):
    def test_round3_analyzer_is_separate_from_first_experiment(self):
        self.assertTrue(hasattr(measure_dataset, 'analyze_round3_dataset'))

    def test_round3_page_explains_method_and_compares_both_results(self):
        page = ROOT / 'measure-dataset-round3.html'
        self.assertTrue(page.is_file(), '3차 실험 결과 페이지를 만들어야 해요.')
        contents = page.read_text(encoding='utf-8')
        self.assertIn('필요할 때만 평판화', contents)
        self.assertIn('항상 평판화', contents)
        self.assertIn('오차', contents)

    def test_repeat_count_reports_stability_for_both_methods(self):
        self.assertIn('repeat_count', inspect.signature(measure_dataset.analyze_round3_dataset).parameters)
        source = ROOT / 'measure_dataset' / 'point' / 'p_1_w55_h65.jpg'
        with tempfile.TemporaryDirectory() as temporary:
            dataset = Path(temporary) / 'dataset' / 'point'
            dataset.mkdir(parents=True)
            shutil.copyfile(source, dataset / source.name)

            report = measure_dataset.analyze_round3_dataset(dataset.parent, repeat_count=2)

        self.assertEqual(report['repeatCount'], 2)
        for method in ('always', 'conditional'):
            self.assertEqual(report['methods'][method]['trialCount'], 2)
            self.assertEqual(report['methods'][method]['widthMaeStdDevCm'], 0)
        self.assertEqual(report['rows'][0]['always']['successCount'], 2)
        self.assertEqual(report['rows'][0]['conditional']['successCount'], 2)

    def test_repeat_count_rejects_zero_and_more_than_one_hundred(self):
        for repeat_count in (0, 101, True):
            with self.subTest(repeat_count=repeat_count), self.assertRaises(ValueError):
                measure_dataset.analyze_round3_dataset(ROOT / 'measure_dataset', repeat_count=repeat_count)

    def test_gemini_photo_uses_at_most_three_prediction_calls_total(self):
        label = {'imageName': 'p_1_w55_h65.jpg', 'backgroundId': 'point', 'garmentId': 1}
        with (mock.patch.object(replicate_gemini, 'upload_replicate_file', return_value=('file-id', 'https://image')),
              mock.patch.object(replicate_gemini, 'create_gemini_prediction', side_effect=ValueError('bad output')) as predict,
              mock.patch.object(replicate_gemini, 'delete_replicate_file')):
            result = replicate_gemini.analyze_photo(ROOT / 'sample.jpg', label, 'test-token')

        self.assertEqual(predict.call_count, 3)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['predictionCalls'], 3)

    def test_gemini_photo_succeeds_with_one_call_per_dimension(self):
        label = {'imageName': 'p_1_w55_h65.jpg', 'backgroundId': 'point', 'garmentId': 1}
        answers = ['{"widthCm":55}', '{"lengthCm":65}']
        with (mock.patch.object(replicate_gemini, 'upload_replicate_file', return_value=('file-id', 'https://image')),
              mock.patch.object(replicate_gemini, 'create_gemini_prediction', side_effect=answers) as predict,
              mock.patch.object(replicate_gemini, 'delete_replicate_file')):
            result = replicate_gemini.analyze_photo(ROOT / 'sample.jpg', label, 'test-token')

        self.assertEqual(predict.call_count, 2)
        self.assertEqual(result['status'], 'done')
        self.assertEqual(result['widthCm'], 55)
        self.assertEqual(result['lengthCm'], 65)
        self.assertEqual(result['predictionCalls'], 2)


class Round3ApiTests(unittest.TestCase):
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

    def test_round3_report_can_be_run_saved_and_loaded(self):
        report = {'imageCount': 20, 'methods': {'always': {}, 'conditional': {}}, 'rows': []}
        gemini = {'sampleCount': 20, 'predictionLimitPerPhoto': 3, 'rows': []}
        def save_report(root, output_path, repeat_count, workers):
            self.assertEqual(repeat_count, 100)
            self.assertEqual(workers, 8)
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            Path(output_path).write_text(json.dumps(report), encoding='utf-8')
            (Path(output_path).parent / 'gemini-results.json').write_text(json.dumps(gemini), encoding='utf-8')
            return report

        with mock.patch('tools.measure_dataset.analyze_round3_dataset', side_effect=save_report) as analyze:
            request = urllib.request.Request(self.base_url + '/api/measure-dataset/round3/run',
                                             data=b'{}', method='POST',
                                             headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=3) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(json.loads(response.read()), {**report, 'gemini': gemini})
        analyze.assert_called_once()

        with urllib.request.urlopen(self.base_url + '/api/measure-dataset/round3', timeout=3) as response:
            loaded = json.loads(response.read())
            self.assertEqual(loaded, {**report, 'gemini': gemini})

    def test_round3_report_get_explains_when_experiment_has_not_run(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(self.base_url + '/api/measure-dataset/round3', timeout=3)

        self.assertEqual(error.exception.code, 404)
        self.assertIn('3차', error.exception.read().decode('utf-8'))


if __name__ == '__main__':
    unittest.main()

