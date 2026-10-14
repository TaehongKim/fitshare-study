# 국내 아동복 호수 자동 매핑 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 옷 종류와 실측 너비·기장에 맞춰 국내 아동복 키 호수를 자동 선택하고 사용자가 직접 수정할 수 있게 한다.

**Architecture:** 기존 문서 페이지의 호수 비교 영역과 ES module matcher에 자동 매핑 UI와 종류별 참고표를 추가한다. 기존 상품별 치수표 비교는 보조 기능으로 유지하며, KS 공식 판정이 아닌 참고값임을 화면에 밝힌다.

**Tech Stack:** HTML, CSS, Vanilla JavaScript ES modules, 기존 브라우저 테스트 러너와 Python unittest.

---

### Task 1: 자동 매핑 동작 테스트 작성

**Files:**
- Modify: `tests/measurement-size-matcher.js`

- [x] 자동 매핑 기준값 선택, 경계값, 잘못된 입력, 사용자 호수 수정에 대한 테스트를 먼저 추가하고 누락 export로 실패를 확인했다.

### Task 2: 자동 호수 선택과 수정 UI 구현

**Files:**
- Modify: `docs/js/measurement-size-matcher.js`
- Modify: `docs/measurement-process.html`

- [x] 옷 종류별 참고 치수표 및 가장 가까운 호수 자동 선택을 구현한다.
- [x] 선택 결과를 사용자가 수정할 수 있게 하고, 기존 상품 치수표 입력 비교는 유지한다.
- [x] 국내 키 호수 체계, 참고 매핑의 한계, 브랜드별 차이를 쉬운 설명으로 갱신한다.

### Task 3: 확인 및 기록

**Files:**
- Modify: `tests/test_measurement_process_page.py` (필요한 페이지 설명 단언)
- Modify: `Handspff/진행상황.md`

- [x] JS 브라우저 테스트 14개와 페이지 설명 DOM 확인을 실행했다. Python 페이지 검사기는 실행 환경에 Python이 없어 실행하지 못했다.
- [x] 정상값, 경계값, 잘못된 입력, 직접 변경 결과를 확인했다.
- [x] 변경 파일과 다른 모듈 영향 여부를 확인하고 진행 기록을 갱신했다.

