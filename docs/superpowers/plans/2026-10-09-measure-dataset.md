# Measure Dataset 자동 측정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 20개 실측 사진을 배경별로 평판화하고 옷 종류에 맞는 가슴/허리 너비와 기장을 자동 측정해 결과와 오차를 보여준다.

**Architecture:** Python 서버에 OpenCV 처리기를 선택적으로 연결한다. 정적 비교 화면은 데이터 파일명에서 기준값만 읽고 분석 API의 결과를 표시한다. 실측 화면은 사진을 서버 분석 API로 보내되 기존 수동 보정 경로를 유지한다.

**Tech Stack:** Python 표준 라이브러리, OpenCV contrib Python(ChArUco 검출/이미지 변환), Vanilla JavaScript/HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-10-09-measure-dataset-pipeline-design.md`

## Global Constraints

- 새 프레임워크는 추가하지 않는다.
- OpenCV는 실측 배경 검출과 원근 변환 목적에만 사용하고 설치 방법과 이유를 안내한다.
- 파일명 w/h는 평가 기준에만 사용하며 영상 처리 입력이나 추정값 생성에 사용하지 않는다.
- 종류별 기준은 1~4 가슴 너비, 5 허리 너비, 모두 h는 기장이다.
- 계정/DB/원격 저장, 추천·랭킹 모듈 변경은 제외한다.
- 실패/낮은 신뢰도는 숨기지 않고 결과에서 식별한다.

## Review Focus

- 흰 크롭티셔츠와 밝은 매트가 비슷한 색: 분리 실패 시 설명 가능한 상태를 보여주는가?
- 소매가 몸통보다 넓은 상의: 가슴 너비 측정선이 소매 끝을 포함하지 않는가?
- 바지 허리 너비: 전체 다리 폭 대신 허리선을 재는가?
- EXIF 방향/가로 촬영/잘린 보드: 방향을 정규화하고 부정확한 원근 결과를 거절하는가?
- OpenCV 미설치 또는 분석 API 오류: 나머지 서버와 직접 입력 대체 경로가 동작하는가?

---

### Task 1: Dataset catalog and baseline tests

**Files:**
- Create: `tools/measure_dataset.py`
- Create: `tests/test_measure_dataset.py`
- Create: `requirements-vision.txt`

**Interfaces:**
- `read_dataset_label(path) -> dict`: 배경 ID, 옷 ID, 기준 w/h, 옷 측정 종류를 반환한다.
- `analyze_dataset(root) -> dict`: 처리별 결과와 그룹 요약을 반환한다.

- [ ] 파서 정상/잘못된 파일명과 전체 20개 라벨 수 테스트 작성 후 RED 확인.
- [ ] OpenCV 의존성 체크가 되는 데이터 카탈로그와 결과 구조를 구현하고 GREEN 확인.

### Task 2: Background rectification and garment measurements

**Files:**
- Modify: `tools/measure_dataset.py`
- Create: `tests/fixtures/` (작은 인공 이미지 또는 실제 데이터 경로 기반 fixture)
- Modify: `tests/test_measure_dataset.py`

**Interfaces:**
- `rectify_photo(image, background) -> RectificationResult`
- `measure_garment(rectified, garment_id) -> MeasurementResult`

- [ ] 점/격자/ChArUco 각각 기준 표식 검출 실패/성공을 고정하는 테스트를 추가한다.
- [ ] 표식의 평면 위치로 A0 보정 후 종류별 측정선을 계산하고 테스트를 통과시킨다.
- [ ] 전체 데이터셋을 반복 실행해 신뢰도/실패 이유와 오차를 확인한다.

### Task 3: Dataset comparison report and student-facing explanation

**Files:**
- Modify: `server.py`
- Create: `measure-dataset.html`
- Create: `js/measurement/datasetReport.js`
- Modify: `css/measurement.css`
- Modify: `tests/test_server.py`

**Interfaces:**
- `GET /api/measure-dataset`: 데이터셋 분석 JSON을 반환한다.
- Report rows include image, category, reference w/h, measured w/h, absolute errors, confidence, and status.

- [ ] API 정상/누락 데이터/의존성 오류 테스트를 먼저 쓴다.
- [ ] 결과 표와 요약, 사진 오버레이를 붙이고 쉬운 한국어 안내를 제공한다.
- [ ] 로컬 HTTP로 모든 사진 행과 그룹 집계를 확인한다.

### Task 4: Live measurement integration

**Files:**
- Modify: `server.py`
- Modify: `js/measurement/automaticMeasurement.js`
- Modify: `js/measurement/app.js`
- Modify: `tests/measurement-auto.js`
- Modify: `Handspff/진행상황.md`

- [ ] 카메라 사진 분석 요청/응답과 의존성 없는 서버의 오류 응답 테스트를 추가한다.
- [ ] 앱의 자동 측정 결과에 의미 치수(가슴/허리/기장)를 매핑하고, 서버 분석 실패 시 현재 수동 측정 흐름을 유지한다.
- [ ] 실측 테스트 및 전체 20장 비교를 실행하고 변경사항과 한계를 Handspff에 기록한다.
