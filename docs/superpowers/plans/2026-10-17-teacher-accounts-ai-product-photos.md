# 교사 권한과 AI 상품 사진 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable teacher-only AI product photos, teacher-code changes, and student password resets through server-enforced roles.

**Architecture:** Store `role` with each account; older records without a role remain students. Store only a salted PBKDF2 hash of the teacher signup code and update it through authenticated server routes. Teacher-only APIs use the session's server-side role; Replicate/Qwen generation runs server-side and stores an image separate from the original.

**Tech Stack:** Python standard library, existing `tools/replicate_gemini.py` HTTP patterns, HTML/CSS/Vanilla JS ES Modules, Python `unittest`.

**Spec:** `docs/superpowers/specs/2026-10-17-teacher-accounts-ai-product-photos-design.md`

## Global Constraints

- HTML, CSS, and Vanilla JavaScript only; use ES Modules.
- Do not add npm or pip packages.
- Keep external API credentials on the server; use `REPLICATE_API_TOKEN` and never return it to a browser.
- Do not expose or log plain-text passwords or teacher signup codes.
- Use Qwen Image Edit Plus for the existing garment photo; preserve source photos and save generated photos under `server-data/`.
- Keep role checks in the server even when the user interface hides teacher actions.

## Review Focus

- A signup request that claims `role: "teacher"` without the current code must create only a student account or fail; it must never grant teacher access.
- An existing account without a role must behave as a student for every teacher-only route.
- Updating the signup code must not demote existing teachers and must take effect for the next signup, including after restart.
- A teacher reset request for a teacher account, unknown ID, empty/too-long password, or malformed JSON must not modify any password or sessions.
- A missing token/model version, external API timeout, invalid output URL, or non-image result must leave the source and account records intact and return a readable error.

---

### Task 1: Add roles and persistent teacher signup code

**Files:**
- Modify: `tools/accounts.py`
- Create: `tests/test_accounts.py`

**Interfaces:**
- `AccountStore.signup(username, password, nickname, teacher_code=None) -> dict` returns `{username, name, role}`; role is `teacher` only when the code matches.
- `AccountStore.user_for_token(token) -> dict | None` includes the current role, defaulting missing historical role fields to `student`.
- Teacher signup code uses a persisted salt/hash and defaults to `fitshare` only when no setting exists.

- [ ] **Step 1: Write failing tests** for `test_signup_defaults_to_student`, `test_signup_with_initial_teacher_code_gets_teacher_role`, `test_wrong_teacher_code_creates_no_account`, `test_legacy_account_without_role_is_student`, `test_teacher_code_hash_is_not_plaintext`, and `test_teacher_code_change_persists_after_store_restart`.
- [ ] **Step 2: Run the focused tests** with `python -m unittest tests.test_accounts -v`. Confirm current `AccountStore` lacks roles/code storage.
- [ ] **Step 3: Implement role and code storage** in `tools/accounts.py`. Persist teacher-code salt/hash beside account data, compare with `hmac.compare_digest`, return role fields from signup/login/session lookup, and treat missing role fields as `student`.
- [ ] **Step 4: Re-run account tests** with `python -m unittest tests.test_accounts -v`; expect all six tests to pass.
- [ ] **Step 5: Commit** only `tools/accounts.py` and `tests/test_accounts.py` as `feat: add teacher and student account roles`.

### Task 2: Enforce teacher-only account routes

**Files:**
- Modify: `tools/accounts.py`, `server.py`
- Modify: `tests/test_ranking_api.py`
- Test: `tests/test_accounts.py`

**Interfaces:**
- `AccountStore.change_teacher_code(actor_username, new_code) -> None` rejects non-teacher actors.
- `AccountStore.reset_student_password(actor_username, student_username, new_password) -> None` rejects non-teacher actors and non-student targets; updates PBKDF2 salt/hash and removes every target session.
- `POST /api/auth/teacher-code` accepts `{newCode}`; `POST /api/auth/reset-student-password` accepts `{username, newPassword}`.

- [ ] **Step 1: Write failing unit and API tests** for student/anonymous denial, teacher success, rejection of a teacher target, bad password input, and invalidation of all prior sessions after reset.
- [ ] **Step 2: Run the focused tests** with `python -m unittest tests.test_accounts tests.test_ranking_api -v`; confirm the new routes and authorization rules fail.
- [ ] **Step 3: Add role-checked account methods** in `tools/accounts.py`; validate nonempty code/password at <=200 characters, rehash reset passwords with a fresh salt, and remove target sessions while holding the account-store lock.
- [ ] **Step 4: Add routes in `server.py`** for code update and password reset. Derive actor identity from `current_user()` only; reject unauthenticated requests with 401 and students with 403. Add `role` to `/api/auth/me` and preserve existing login/signup cookie behavior.
- [ ] **Step 5: Re-run account and API tests** with `python -m unittest tests.test_accounts tests.test_ranking_api -v`; expect authorization and session revocation tests to pass.
- [ ] **Step 6: Commit** only the account/server/API test files as `feat: add teacher account controls`.

### Task 3: Add teacher signup, profile controls, and role display

**Files:**
- Modify: `index.html`, `js/app.js`, `js/auth.js`
- Modify: `modules/profile.js`, `css/ranking.css`
- Test: `tests/test_teacher_ui.py` (new)

**Interfaces:**
- `signup(username, password, name, teacherCode)` posts the optional code and stores the server-returned role.
- Profile actions call `POST /api/auth/teacher-code` and `POST /api/auth/reset-student-password` through a small exported `js/auth.js` helper.

- [ ] **Step 1: Write failing UI/source tests** for student signup with no code, teacher code field shown only in signup mode, teacher role label, student profile without teacher controls, and teacher profile with both controls.
- [ ] **Step 2: Run** `python -m unittest tests.test_teacher_ui -v`; confirm current page has no teacher fields/controls.
- [ ] **Step 3: Add a student/teacher account type selector and optional teacher code field** to `index.html`; update `setAuthMode()` in `js/app.js` to show the selector only at signup and require/show the code only when teacher is selected. Keep student signup the default.
- [ ] **Step 4: Extend `js/auth.js`** to send the teacher code and requested account type, refresh the current user from `/me`, and expose `authAction(path, payload)` that reports server errors without losing role data. Ignore any client-supplied role when assigning access; only the verified teacher code grants teacher role.
- [ ] **Step 5: Add teacher-aware profile sections** in `modules/profile.js`: role label, code-change form, and student username/new-password form. Escape display text and show pending/error/success states; do not render these controls for students.
- [ ] **Step 6: Add profile form styling** in `css/ranking.css`, retaining current avatar actions and responsive layout.
- [ ] **Step 7: Re-run** `python -m unittest tests.test_teacher_ui tests.test_registration_pages -v`; expect teacher and existing profile/registration UI checks to pass.
- [ ] **Step 8: Commit** only auth UI, profile, CSS, and UI test files as `feat: add teacher profile controls`.

### Task 4: Generate and display teacher-only AI product photos

**Files:**
- Create: `tools/replicate_product_photo.py`
- Modify: `server.py`, `modules/garmentDetail.js`, `css/ranking.css`
- Modify: `.env.example`, `server.py` (`load_env_file`)
- Modify: `tests/test_ranking_api.py`
- Create: `tests/test_replicate_product_photo.py`, `tests/test_teacher_product_photo_ui.py`

**Interfaces:**
- `generate_product_photo(source_bytes, prompt, token, model_version, opener=urlopen, sleep=time.sleep) -> tuple[bytes, str]` returns validated image bytes and MIME type or raises a readable `ProductPhotoError`.
- `POST /api/garments/<id>/product-photo` requires a teacher session and returns `{productPhotoUrl, generatedAt}`.
- `GET /api/garments/<id>/product-photo` serves only a saved generated image; it never invokes the model.
- Garment metadata adds `productPhotoUrl` and `productPhotoGeneratedAt`; original `photoUrl` remains unchanged.

- [ ] **Step 1: Write failing helper tests** for successful image output, prediction error, timeout, missing image output, non-image URL response, and cleanup of the temporary Replicate upload.
- [ ] **Step 2: Run** `python -m unittest tests.test_replicate_product_photo -v`; confirm the module is missing.
- [ ] **Step 3: Implement the Replicate helper** using the existing upload/poll/delete patterns in `tools/replicate_gemini.py`; use model slug `qwen/qwen-image-edit-plus` (official API: https://replicate.com/qwen/qwen-image-edit-plus/api), `REPLICATE_API_TOKEN`, and server setting `REPLICATE_PRODUCT_MODEL_VERSION`. Send the saved transparent cutout from `closet.png` and prompt for a clean studio background while preserving the photographed garment's silhouette, color, patterns, seams, buttons, and logos. Validate the returned HTTP content type before saving.
- [ ] **Step 4: Add failing API tests** for unauthenticated denial, student 403, teacher generation success, unknown garment 404, missing token/model setting 503, generation failure without changing source, and GET serving the generated image without another model call.
- [ ] **Step 5: Add teacher-checked POST/GET handlers** in `server.py`. Save output atomically as a separate garment image, update both `garment.json` and `index.json`, return an already-saved generated photo without another paid model call, and return a message when token/model settings are absent.
- [ ] **Step 6: Add teacher-only generation controls** to `modules/garmentDetail.js`: show the original photo at all times, offer the generated reference image when available, and report busy, success, and readable failure states. Students receive no generation button.
- [ ] **Step 7: Load `REPLICATE_PRODUCT_MODEL_VERSION` from `.env`** in `server.py` without overriding a shell environment value and add an empty placeholder with a comment to `.env.example`; never log or return this setting.
- [ ] **Step 8: Add responsive styling** in `css/ranking.css`; add UI tests for teacher button visibility and original/generated image switching.
- [ ] **Step 9: Run focused tests** with `python -m unittest tests.test_replicate_product_photo tests.test_ranking_api tests.test_teacher_product_photo_ui -v`; expect mocked provider calls and permission cases to pass without spending credits.
- [ ] **Step 10: Commit** only helper, server, garment detail, styles, `.env.example`, and tests as `feat: add teacher-only AI garment photos`.

### Task 5: Verify full account and image flows

**Files:**
- Verify: `index.html`, profile dialog, garment detail, all new endpoints
- Modify: `Handspff/진행상황.md`

**Interfaces:**
- Student signup/login, teacher signup/login, code rotation, student reset, and teacher image generation use the interfaces established in Tasks 1–4.

- [ ] **Step 1: Run the full project suite** with `python -m unittest discover -s tests -v`; report the exact pass/fail result.
- [ ] **Step 2: Run `python -m py_compile server.py tools/accounts.py tools/replicate_product_photo.py`** and `git diff --check`.
- [ ] **Step 3: Verify local UI** on `http://localhost:8000/`: student signup/login, teacher signup using `fitshare`, teacher signup after code rotation, password reset invalidating an existing student session, student denial of teacher API, and teacher-only image button.
- [ ] **Step 4: Verify provider setup** with presence-only checks (never print token/model version) and a single teacher-requested sample image generation; confirm source image hash is unchanged and generated image is stored separately.
- [ ] **Step 5: Record completed work, tests, any external-service limits, and remaining work** in `Handspff/진행상황.md`; review `git diff` and commit the handoff note.
