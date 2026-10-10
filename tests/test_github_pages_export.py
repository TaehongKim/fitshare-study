import json
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from tools.build_github_pages import copy_photo, prepare_model_comparison, prepare_report, require_rows


class GitHubPagesExportTests(unittest.TestCase):
    def test_dataset_report_uses_relative_web_photo_paths(self):
        report = {"rows": [{"backgroundId": "point", "imageName": "p_1_w55_h65.jpg"}]}

        prepared = prepare_report(report)

        self.assertEqual(prepared["rows"][0]["sourceUrl"], "assets/photos/point/p_1_w55_h65.jpg")

    def test_model_report_rewrites_server_photo_urls_for_pages(self):
        report = {
            "rows": [{
                "photo": "chc_1_w55_h65.jpg",
                "measurements": {"yolo": {"overlayUrl": "/experiments/garment_ai/results/example.png"}},
            }],
            "geminiComparison": {"rows": [{"photo": "p_1_w55_h65.jpg", "backgroundId": "point"}]},
        }

        prepared = prepare_model_comparison(report)

        self.assertEqual(prepared["rows"][0]["sourceUrl"], "assets/photos/ChaArUco_Cross/chc_1_w55_h65.jpg")
        self.assertEqual(prepared["rows"][0]["measurements"]["yolo"]["overlayUrl"], "experiments/garment_ai/results/example.png")
        self.assertEqual(prepared["geminiComparison"]["rows"][0]["sourceUrl"], "assets/photos/point/p_1_w55_h65.jpg")

    def test_incomplete_experiment_is_rejected_before_publication(self):
        with self.assertRaisesRegex(ValueError, "사진 결과가 20개"):
            require_rows({"rows": [{}, {}]}, "배경 비교")

    def test_web_photo_is_resized_without_upscaling(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.jpg"
            target = Path(folder) / "site" / "photo.jpg"
            image = np.full((1200, 2400, 3), 230, dtype=np.uint8)
            self.assertTrue(cv2.imwrite(str(source), image))

            copy_photo(source, target)

            result = cv2.imread(str(target))
            self.assertEqual(result.shape[:2], (800, 1600))


if __name__ == "__main__":
    unittest.main()
