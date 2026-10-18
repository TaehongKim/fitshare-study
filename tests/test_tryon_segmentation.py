import unittest

import cv2
import numpy as np

from tools.tryon_segmentation import border_background, refine_clothing


def garment_case(background=(236, 236, 236), foreground=(246, 246, 246)):
    image = np.full((180, 240, 3), background, dtype=np.uint8)
    truth = np.zeros(image.shape[:2], np.uint8)
    truth[35:155, 85:155] = 1
    # Narrow, long sleeves: the old body-only search band cannot reach their tips.
    truth[40:53, 20:220] = 1
    image[truth > 0] = foreground
    seed = np.zeros_like(truth); seed[37:153, 87:153] = 1
    return image, truth > 0, seed > 0


class TryOnSegmentationTests(unittest.TestCase):
    def test_white_shirt_on_light_background_preserves_both_sleeves(self):
        image, truth, seed = garment_case()
        mask, info = refine_clothing(image, seed)
        self.assertEqual(info['method'], 'border-connected+YOLO')
        self.assertTrue(mask[45, 22] and mask[45, 218])
        self.assertGreaterEqual(np.count_nonzero(mask & truth) / truth.sum(), .99)
        self.assertLessEqual(np.count_nonzero(mask & ~truth), 10)

    def test_dark_shirt_on_dark_background_does_not_remove_dark_pixels_everywhere(self):
        image, truth, seed = garment_case((20, 20, 20), (31, 31, 31))
        mask, _ = refine_clothing(image, seed)
        self.assertGreaterEqual(np.count_nonzero(mask & truth) / truth.sum(), .99)
        self.assertFalse(mask[5, 5])

    def test_same_background_color_enclosed_inside_printed_shirt_is_not_flooded(self):
        image, truth, seed = garment_case(foreground=(30, 50, 140))
        image[65:110, 100:140] = (236, 236, 236)
        mask, _ = refine_clothing(image, seed)
        self.assertTrue(mask[80, 120])

    def test_background_logo_not_connected_to_garment_is_excluded(self):
        image, truth, seed = garment_case()
        image[5:12, 5:25] = (0, 0, 0)
        mask, _ = refine_clothing(image, seed)
        self.assertFalse(mask[8, 10])
        self.assertTrue(mask[45, 22])

    def test_nonuniform_scene_uses_protected_semantic_seed(self):
        image, truth, _ = garment_case(foreground=(25, 70, 150))
        image[:, :12] = (45, 170, 90)
        image[:, -12:] = (120, 80, 60)
        image[:12] = (70, 70, 120)
        mask, info = refine_clothing(image, truth)
        self.assertEqual(info['method'], 'protected-YOLO+GrabCut')
        self.assertTrue(mask[45, 22] and mask[45, 218])
        self.assertFalse(mask[1, 1])

    def test_empty_wrong_shape_and_tiny_seed_rejected(self):
        image, _, _ = garment_case()
        for seed in (np.zeros((180,240), bool), np.ones((180,240), bool), np.zeros((10,10), bool)):
            with self.assertRaises(ValueError):refine_clothing(image, seed)

    def test_background_must_connect_to_border(self):
        image, _, _ = garment_case(foreground=(20,40,100))
        image[70:100, 110:130] = (236,236,236)
        background, _, _, _ = border_background(image)
        self.assertTrue(background[0,0])
        self.assertFalse(background[80,120])


if __name__ == '__main__':unittest.main()
