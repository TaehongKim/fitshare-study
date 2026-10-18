"""Build the final offline learning and presentation guide from recorded artifacts."""
import base64
import html
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def picture(path):
    image = cv2.imdecode(np.frombuffer(path.read_bytes(), np.uint8), -1)
    if image.shape[2] == 4:
        alpha = image[:, :, 3:4] / 255.
        # Show transparency against a contrasting backdrop rather than hiding it on white.
        image = (image[:, :, :3] * alpha + np.full(image.shape[:2]+(3,), (217,192,166)) * (1-alpha)).astype(np.uint8)
    scale = min(1, 330 / max(image.shape[:2]))
    image = cv2.resize(image,(round(image.shape[1]*scale),round(image.shape[0]*scale)))
    return 'data:image/png;base64,'+base64.b64encode(cv2.imencode('.png',image)[1]).decode()


def build():
    folder = ROOT/'server-data'/'tryon-quality-eval'
    records = json.loads((folder/'results.json').read_text(encoding='utf-8'))
    synthetic = json.loads((folder/'synthetic.json').read_text(encoding='utf-8'))
    galleries = ''
    for index, label in [(0,'줄무늬 긴팔: 원본에 있던 양 소매를 다시 포함'),(1,'흰 긴팔: 밝은 옷감과 배경을 구분'),(7,'반바지: 한쪽만 남던 바짓가랑이를 함께 보존')]:
        item = records[index]
        galleries += '<article><h3>'+label+'</h3><div class="pictures">'
        for kind, caption in [('source','원본'),('before','이전 방식'),('after','개선 후')]:
            path = folder/(item['id']+'-'+kind+('.jpg' if kind=='source' else '.png'))
            galleries += f'<figure><img src="{picture(path)}" alt="{html.escape(label)} · {caption}"><figcaption>{caption}</figcaption></figure>'
        galleries += '</div></article>'
    rows=''
    for item,label in zip(synthetic,['밝은 옷·밝은 배경','어두운 옷·어두운 배경','색 차이가 큰 옷']):
        rows+=f'<tr><td>{label}</td><td>{item["before"]["iou"]*100:.2f}%</td><td>{item["after"]["iou"]*100:.2f}%</td></tr>'
    uniform=sum(item.get('method')=='border-connected+YOLO' for item in records)
    report=(ROOT/'tools'/'templates'/'tryon_report.html').read_text(encoding='utf-8')
    first=records[0]
    comparison=''
    for kind,caption in [('before','이전: 소매가 빠진 배경 제거'),('after','개선: 원본의 소매까지 포함')]:
        comparison+=f'<figure><img src="{picture(folder/(first["id"]+"-"+kind+".png"))}" alt="{caption}"><figcaption>{caption}</figcaption></figure>'
    report=report.replace('__GALLERY__',galleries).replace('__ROWS__',rows).replace('__UNIFORM__',str(uniform)).replace('__FIRST_COMPARISON__',comparison)
    path=ROOT/'docs'/'가상입어보기-개선보고서.html'
    path.write_text(report,encoding='utf-8')
    print(path)


if __name__=='__main__':build()
