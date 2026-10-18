"""Reproducible, display-only before/after checks. Does not edit garment records.

Run: python -m tools.evaluate_tryon_quality
Real inventory has no hand-labelled truth: its pixel counts are not accuracy.
"""
import json
import time
from pathlib import Path

import cv2
import numpy as np

from tools.garment_segmentation import yolo_grabcut_provider
from tools.tryon_segmentation import detect_clothing, refine_clothing

ROOT = Path(__file__).resolve().parents[1]


def legacy_refine(image, seed):
    class Detector:
        def detect(self, *args, **kwargs):
            return {'mask': seed}
    return yolo_grabcut_provider(detector=Detector())(image, None) > 0


def scores(mask, truth):
    return {'iou': round(float(np.count_nonzero(mask & truth) / max(1, np.count_nonzero(mask | truth))), 4),
            'foregroundRecall': round(float(np.count_nonzero(mask & truth) / max(1, truth.sum())), 4)}


def synthetic_cases():
    results = []
    for name, background, foreground in [('light-shirt',236,246), ('dark-shirt',20,31), ('contrasting-shirt',236,55)]:
        image = np.full((180,240,3), background, np.uint8)
        truth = np.zeros((180,240), bool);truth[35:155,85:155]=True;truth[40:53,20:220]=True
        image[truth] = foreground
        seed = np.zeros_like(truth);seed[37:153,87:153]=True
        old = legacy_refine(image, seed)
        new, info = refine_clothing(image, seed)
        results.append({'name':name,'semanticOnly':scores(seed,truth),'before':scores(old,truth),'after':scores(new,truth),'method':info['method']})
    return results


def evaluate(output=None):
    folder = Path(output) if output else ROOT/'server-data'/'tryon-quality-eval'
    folder.mkdir(parents=True, exist_ok=True)
    records = json.loads((ROOT/'server-data'/'garments'/'index.json').read_text(encoding='utf-8'))
    results = []
    for item in records:
        if not item.get('isDemo'):
            continue
        try:
            source = ROOT/'server-data'/'garments'/item['id']/'photo.jpg'
            image = cv2.imdecode(np.frombuffer(source.read_bytes(),np.uint8),1)
            scale = min(1,848/max(image.shape[:2]))
            image = cv2.resize(image,(round(image.shape[1]*scale),round(image.shape[0]*scale)))
            seed = detect_clothing(image,item['category'],item.get('bottomLength',''))
            before = legacy_refine(image,seed)
            started = time.perf_counter();after,info = refine_clothing(image,seed);elapsed = time.perf_counter()-started
            for name, mask in [('before',before),('after',after)]:
                out = cv2.cvtColor(image,cv2.COLOR_BGR2BGRA);out[:,:,3]=mask.astype(np.uint8)*255
                (folder/(item['id']+'-'+name+'.png')).write_bytes(cv2.imencode('.png',out)[1].tobytes())
            (folder/(item['id']+'-source.jpg')).write_bytes(cv2.imencode('.jpg',image)[1].tobytes())
            results.append({'id':item['id'],'name':item['name'],'category':item['category'],'ok':True,**info,
                            'beforePixels':int(before.sum()),'afterPixels':int(after.sum()),'refineMs':round(elapsed*1000,1)})
        except Exception as error:
            results.append({'id':item['id'],'name':item['name'],'ok':False,'error':str(error)})
    (folder/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    (folder/'synthetic.json').write_text(json.dumps(synthetic_cases(),indent=2),encoding='utf-8')
    print(f'Actual images prepared: {sum(row["ok"] for row in results)}/{len(results)}')
    print('Synthetic exact-mask metrics:', folder/'synthetic.json')
    return results


if __name__=='__main__':evaluate()
