# 옷 인식 AI 비교 실험

이 실험은 기존 앱의 OpenCV 측정과 SAM의 점 지정 마스크, 옷 종류를 예측하는 YOLO-seg ONNX 후보 모델을 같은 M4 평판 사진에서 비교한다. 결과는 옷 등록이나 실험의 기본 파이프라인에 연결하지 않는다.

## 왜 이 모델을 골랐나요?

- SAM은 점이나 네모를 받아 물체 테두리를 찾는 모델이다. 옷인지, 어떤 종류인지, 어디서 너비를 재야 하는지는 알려주지 않는다.
- DeepFashion2는 프로그램 라이브러리가 아니라 13가지 옷 분류, 옷 마스크, 옷 기준점이 포함된 데이터셋이다.
- SAM ViT-B는 긍정/부정 점으로 옷 전체, 특히 바지 양쪽 다리를 함께 찾을 수 있는지 비교한다.
- YOLO 후보 모델은 옷 종류와 마스크를 한꺼번에 예측하고 ONNX Runtime CPU로 실행할 수 있다.
- 별도 측정식으로 바꾸지 않도록 모델 마스크도 프로젝트의 종류별 측정 위치 비율과 A0 실측판 크기를 사용해 너비·기장을 계산한다.

## 실행

```powershell
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r experiments/garment_ai/requirements.txt
python experiments/garment_ai/run_comparison.py
```

첫 실행 때 YOLO ONNX 모델(약 11MB)과 SAM ViT-B 가중치(약 375MB)를 `server-data/model-cache/`로 받는다. `server-data/`는 Git에서 제외되어 모델 파일이 저장소에 들어가지 않는다. 결과는 이 폴더의 `results/report.md`, `results/results.json`, OpenCV/YOLO/SAM 비교 그림에 저장된다.

## HRNet 기준점 비교 실험

HRNet은 옷의 기준점을 찾는 용도로만 따로 실행한다. 현재 환경의 PyTorch와 torchvision을 사용하며, 새 패키지는 설치하지 않았다.

```powershell
python experiments/garment_ai/run_hrnet_comparison.py
```

첫 실행은 DeepFashion2 HRNet 체크포인트(약 255MB)를 `server-data/model-cache/`에 저장하고 SHA-256을 확인한다. 코드는 공식 [HRNet 의류 기준점 저장소](https://github.com/svip-lab/HRNet-for-Fashion-Landmark-Estimation.PyTorch)의 MIT 라이선스 구현을 실험 폴더에 포함했다. 결과는 `results/hrnet_report.md`, `results/hrnet_results.json`, `*-hrnet.png`에 남는다.

2026-10-09의 M4 사진 다섯 장에서는 OpenCV가 너비 오차 0.58cm·기장 오차 4.76cm였고, HRNet 기준점 측정은 너비 10.24cm·기장 11.14cm였다. 옷 사진을 평평하게 펼친 현재 데이터와 모델 학습 사진의 차이가 보였고, 원피스 기장·바지 허리 너비 위치도 제대로 맞지 않았다. 그래서 HRNet은 기본 사이트 측정에 연결하지 않았다.

## 주의

- 현재 측정용 M4 사진은 옷마다 한 장뿐이다. 이 결과는 원인을 찾는 예비 실험이며, 일반적인 인식률을 증명하지 않는다.
- HRNet 공식 의류 기준점 모델은 한 장에 옷 하나가 있는 입력을 가정하므로 옷을 먼저 잘라야 한다. 이번 실험은 공통 OpenCV 옷 마스크 상자로 자른 사진을 넣었지만, 다섯 장에서 기준 측정 위치가 맞지 않아 기본 흐름에는 적용하지 않았다.
- 체크포인트는 공개 Hugging Face 미러에서 내려받아 실험에만 사용한다. 업스트림은 OneDrive 링크를 제공하지만 여기서는 자동으로 가져오지 못했고, 체크포인트의 별도 배포 조건을 확인하지 못했다. 따라서 앱 배포물에는 포함하지 않는다.
- 공개 모델 설명은 DeepFashion2 학습 및 Apache-2.0 사용을 적지만, 내려받은 ONNX 안의 메타데이터는 학습 데이터 경로를 `wardrobe_yolo`로 표시하고 라이선스를 AGPL-3.0으로 표시한다. 두 설명이 서로 맞지 않으므로 여기서는 비교 실험에만 쓴다. 실제 배포에 넣기 전에는 모델 원작자의 출처·학습 자료·라이선스를 확인해야 한다.
- 참고: [Meta SAM](https://github.com/facebookresearch/segment-anything), [DeepFashion2 데이터셋](https://github.com/switchablenorms/DeepFashion2), [YOLO26 DeepFashion2 모델 카드](https://huggingface.co/HasanKabir23/Yolov26s-DeepFashion2).
