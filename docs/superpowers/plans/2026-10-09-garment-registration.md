# 학교 옷장 입장과 ChArUco 옷 등록 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학교 입장 뒤 ChArUco 교차점 사진으로 옷 정보를 제안하고 확인 저장하는 화면을 제공한다.

**Architecture:** 메인 페이지는 성공 메시지와 등록 CTA를 제공한다. 별도 Vanilla JavaScript 등록 화면이 M4 전용 분석 API를 호출하고 결과를 편집 가능한 폼으로 보여준다. Python 서버는 기존 `measure_pipeline` 분석 코드를 어댑터로 사용하고 사진/JSON을 로컬 저장한다.

**Tech Stack:** HTML, CSS, Vanilla JavaScript, 기존 Python 표준 라이브러리 서버, 기존 OpenCV contrib 및 NumPy 의존성.

**Spec:** `docs/superpowers/specs/2026-10-09-garment-registration-design.md`

## Global Constraints

- HTML, CSS, Vanilla JavaScript만 사용한다.
- 새로운 프레임워크나 npm 패키지를 추가하지 않는다.
- 기존 Python 서버와 이미 설치된 이미지 분석 의존성을 재사용한다.
- M4 ChArUco 교차점만 등록용 자동 분석 배경으로 허용한다.
- 남성용/여성용을 사진만으로 판정하지 않고 사람이 확인하도록 한다.
- 사진과 JSON은 `server-data/garments/`에 저장하고 Git에 올리지 않는다.
- 추천·랭킹 및 기존 실험 결과 화면은 수정하지 않는다.

## Review Focus

- 학교명 앞뒤 공백/한글 입력 — 엔터와 버튼 모두 등록 CTA 노출을 확인한다.
- M4가 아닌 매트 입력 — 400 오류와 사용자 메시지를 확인한다.
- 읽을 수 없는 사진 — 분석 중단, 저장 경로 미생성을 확인한다.
- 옷 종류 자동 제안 신뢰도가 낮음 — 직접 선택 상태를 표시하고 수동 수정할 수 있다.
- 성별/용도 미입력 — 필수 선택을 검증하고 남성용·여성용·공용·모름 모두 저장한다.

---

### Task 1: 메인 입장 후 옷 등록 CTA 연결

**Files:** `index.html`, `js/app.js`, `js/schoolEntry.js`, `modules/measurement.js`, `css/styles.css`, `tests/test_registration_pages.py`

- [x] 한국어 학교명, 공백, 빈 값, Enter 동작을 검증하는 실패 테스트를 추가한다.
- [x] 성공 상태에 `옷 등록 시작` CTA를 표시하고, 불필요한 강제 스크롤을 제거한다.
- [x] 실측 탭을 M4 옷 등록으로 연결하고, 기존 4배경 비교는 별도 보조 링크로 유지한다.
- [x] 테스트를 실행해 정상/경계/오류를 확인한다.

### Task 2: M4 분석 어댑터와 API

**Files:** `measure_pipeline/web_analysis.py`, `server.py`, `tests/test_garment_registration.py`

- [x] API 계약 테스트: `POST /api/garments/analyze`는 `photoDataUrl`과 `backgroundId='M4'`를 받고, 분류·치수·색·평판 사진을 돌려준다. `M1` 및 잘못된 사진은 거부한다.
- [x] M4 레이아웃으로 원근을 펴고 마스크/측정선을 생성하며, 치수·대표색·검토용 분석 사진을 반환한다.
- [x] 형태 후보는 낮은 확신도를 포함하고, 성별은 분석 결과에 넣지 않는다.
- [x] 정상 데이터셋 M4 이미지, 경계 입력, 분석 실패를 테스트한다.

### Task 3: 옷 등록 저장 API

**Files:** `server.py`, `tests/test_garment_registration.py`

- [x] 유효성 검사 테스트부터 추가한다: 이름/종류/성별 선택/양수 크기/유효 JPEG가 필요하다.
- [x] `POST /api/garments`로 `server-data/garments/<id>/photo.jpg`와 `garment.json`을 원자적으로 저장한다.
- [x] `GET /api/garments`는 사진 데이터가 아닌 목록 메타데이터를 반환하고, `GET /api/garments/<id>`는 사진 URL과 상세 정보를 반환한다.
- [x] 정상, 경계, 잘못된 입력 및 누락된 ID 테스트를 실행한다.

### Task 4: 초등학생용 등록 화면

**Files:** `measure/register.html`, `css/garment-registration.css`, `js/measurement/register.js`, `tests/test_registration_pages.py`

- [x] M4 안내, 카메라/갤러리 입력, 분석 진행/실패/성공 상태를 화면 테스트와 HTTP 확인으로 검증한다.
- [x] 자동 후보를 폼에 채우고, 종류·이름·길이·너비·색·용도를 직접 수정하게 한다.
- [x] 저장 후 성공 메시지와 등록된 옷 목록을 표시하고, 사진/분석 이미지를 함께 보여준다.
- [x] 서버 API 정상/오류를 계약 테스트로 확인한다.

### Task 5: 통합 검증과 진행 기록

**Files:** `Handspff/진행상황.md`

- [x] `python -m unittest discover -s tests -v` 전체를 실행한다.
- [x] JS 문법/동작 검사와 로컬 HTTP 페이지/API 스모크 테스트를 실행한다.
- [x] 5벌 M4 데이터셋 자동 분석과 사용자 편집 저장 흐름을 확인한다.
- [x] 해결한 내용, 실행법, 제한사항, 남은 성별 라벨 데이터 요구를 인수인계 기록에 적는다.

## 파이프라인 통일 후속 변경 (2026-10-09)

- 등록 분석은 실험과 같은 `rectify_photo(..., "M4")`와 `measure_garment(..., garment_id=...)`를 사용한다.
- 분석 전에 옷 종류 ID(1~5)를 고르게 하며, 실험에서 쓰는 종류별 측정 프로필을 그대로 전달한다.
- 15cm 미만의 기장은 부분 윤곽 오인식으로 보고 거부한다.
- 같은 사진을 두 경로로 분석해 기장·너비·결과 그림이 일치하는 회귀 테스트를 추가했다.
