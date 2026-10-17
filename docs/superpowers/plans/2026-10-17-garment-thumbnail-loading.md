# 옷장 사진 로딩 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the time and bytes needed to show existing dataset garment photos in closet cards, including `데이터셋 2 크롭 티셔츠`.

**Architecture:** Cards already request cached 320px PNG thumbnails and are lazy-loaded. Reduce stored thumbnails to the rendered card size, add an independent thumbnail cache version so existing cutouts can be resized without rerunning YOLO/GrabCut, and warm missing/stale cutouts in a background worker while returning a small original-photo thumbnail immediately.

**Tech Stack:** Python standard library, existing OpenCV/NumPy image helpers, Vanilla JavaScript ES modules, Python `unittest`.

**Spec:** `docs/superpowers/specs/2026-10-17-garment-thumbnail-loading-design.md`

## Observed Data

On 2026-10-17, dataset 2 already had a version-current 320px transparent thumbnail (131,957 bytes). The endpoint returned HTTP 200 in 63–79ms after the first request; the first PowerShell client request took 2,197ms, so its client startup time is not attributed to the server. Across all 35 cached garment thumbnails, the average was 23,553 bytes. The implementation therefore reduces the 320px payload to 200px for a 145px card and keeps cache misses from blocking on segmentation.

## Global Constraints

- HTML, CSS, and Vanilla JavaScript only; use ES Modules.
- Add no npm or pip package.
- Preserve original uploaded photos and saved measurement fields.
- Store all user photos and generated cache files under `server-data/`; do not commit them.
- Keep the change within the closet image path; do not edit recommendation or ranking logic.

## Review Focus

- A thumbnail with a missing or old thumbnail version must be resized from an existing current `closet.png`, without calling YOLO/GrabCut.
- A missing/stale cutout must show a quick original-photo thumbnail while background preparation runs.
- Background preparation failure for one garment must not stop the server or other garment images.
- A corrupt source photo must return an understandable 404/422 and must not create a falsely valid cache marker.
- The image shown at 145 CSS pixels must remain sharp enough after reducing the thumbnail edge from 320 to 200 pixels.

---

### Task 1: Version and shrink cached thumbnails

**Files:**
- Modify: `server.py` (`make_garment_thumbnail`, `get_garment_thumbnail`, `save_garment`)
- Modify: `js/measurement/garmentCloset.js` (intrinsic image dimensions)
- Test: `tests/test_ranking_api.py`

**Interfaces:**
- `make_garment_thumbnail(png_bytes, maximum_side=200) -> bytes` returns a transparent PNG whose longest edge is at most 200 px.
- Garment records store `thumbnailVersion: 2` independently of `maskPipelineVersion`.

- [ ] **Step 1: Write failing tests** for `test_thumbnail_is_at_most_200px` and `test_legacy_thumbnail_resizes_from_saved_cutout_without_segmentation`. Assert the output edge is <=200 and mock `get_yolo_grabcut_provider` to fail if called when current `closet.png` exists.
- [ ] **Step 2: Run the focused tests** with `python -m unittest tests.test_ranking_api.RankingApiTests.test_thumbnail_is_at_most_200px tests.test_ranking_api.RankingApiTests.test_legacy_thumbnail_resizes_from_saved_cutout_without_segmentation -v`. Confirm both fail against the current 320px/version-coupled implementation.
- [ ] **Step 3: Implement cache version 2** in `server.py`. Regenerate a stale thumbnail from current `closet.png` alone; only run garment segmentation when no current cutout exists. Set the thumbnail version in both `garment.json` and `index.json` when saving new garment data. Keep source photo and measurement fields unchanged.
- [ ] **Step 4: Set card intrinsic dimensions to 200×200** in `js/measurement/garmentCloset.js`; retain `loading='lazy'` and `decoding='async'`.
- [ ] **Step 5: Run focused tests** with `python -m unittest tests.test_ranking_api -v`. Expect all ranking API tests to pass and the segmentation mock to remain uncalled for cache migration.
- [ ] **Step 6: Review and commit** only these three files with `git diff --check` and `git diff --stat`; commit as `perf: reduce closet thumbnail size`.

### Task 2: Prepare missing legacy thumbnails outside image requests

**Files:**
- Create: `tools/garment_thumbnails.py`
- Modify: `server.py` (`main`, thumbnail response helpers)
- Test: `tests/test_garment_thumbnail_loading.py`

**Interfaces:**
- `prepare_garment_thumbnails(garments_dir) -> dict` returns `{'prepared': int, 'failed': list[str]}` and continues after a per-garment error.
- `make_source_photo_thumbnail(jpeg_bytes, maximum_side=200) -> bytes` returns a small JPEG fallback without running the garment segmentation model.
- `ensure_garment_cutout(garments_dir, garment_id) -> bytes` is the extracted server helper used by both the full-size closet-photo route and the background worker when a valid cutout is absent.

- [ ] **Step 1: Write failing tests** for `test_prepare_creates_missing_thumbnail_from_current_cutout`, `test_prepare_continues_after_one_garment_fails`, and `test_missing_thumbnail_request_returns_source_preview_without_segmentation`. Assert one failed garment does not prevent a later valid record from being prepared.
- [ ] **Step 2: Run the focused tests** with `python -m unittest tests.test_garment_thumbnail_loading -v`. Confirm the module/behavior is missing.
- [ ] **Step 3: Extract `ensure_garment_cutout(garments_dir, garment_id) -> bytes`** from the current nested handler into a module-level helper in `server.py`, preserving the current segmentation pipeline and metadata update behavior.
- [ ] **Step 4: Implement `tools/garment_thumbnails.py`** with `prepare_garment_thumbnails(garments_dir, ensure_cutout) -> dict`. Scan valid IDs from `index.json`, skip current version-2 thumbnails, resize current cutouts, and call `ensure_cutout(garment_id)` only when the cutout itself is missing/stale. Catch and report failures per item.
- [ ] **Step 5: Make thumbnail cache misses fast** in `server.py`: send a resized original-photo preview immediately when no current cutout exists, with `Cache-Control: no-store`; do not run YOLO/GrabCut in this request. Keep 404 for missing garment/source files. The background worker later prepares a transparent cutout; the next card load uses it.
- [ ] **Step 6: Start cache preparation as a daemon thread in `main()`** after binding the HTTP server and before `serve_forever()`. Pass the extracted helper as the worker callback; a failed cache worker must not terminate the HTTP server.
- [ ] **Step 7: Run the focused and related API tests** with `python -m unittest tests.test_garment_thumbnail_loading tests.test_ranking_api -v`. Expect preview, cache, and existing closet behavior to pass.
- [ ] **Step 8: Review and commit** only `tools/garment_thumbnails.py`, `server.py`, and the new test file with `git diff --check`; commit as `perf: warm legacy garment thumbnails`.

### Task 3: Check the local dataset image path

**Files:**
- Verify: `server-data/garments/<dataset-garment-id>/` (local data only; never stage it)
- Verify: `http://localhost:8000/api/garments/<id>/thumbnail`

**Interfaces:**
- The dataset 2 card requests a <=200px transparent PNG after preparation; a cold cache request returns a <=200px JPEG preview without waiting for segmentation.

- [ ] **Step 1: Record the existing source photo and measurement metadata hashes** for the dataset 2 garment before starting the updated server.
- [ ] **Step 2: Restart the local server** so the daemon preparation starts, then request the dataset 2 thumbnail once during warm-up and once after preparation.
- [ ] **Step 3: Verify** both responses are HTTP 200 and <=200px on the longest edge; confirm the second response is PNG and the original photo SHA-256 plus saved length/width metadata are unchanged (thumbnail version metadata may be updated).
- [ ] **Step 4: Run the full relevant suite** with `python -m unittest tests.test_server tests.test_ranking_api tests.test_garment_thumbnail_loading -v`; record the actual result in `Handspff/진행상황.md`.
- [ ] **Step 5: Review the final diff and commit** the handoff note with `docs: record closet thumbnail loading work`.
