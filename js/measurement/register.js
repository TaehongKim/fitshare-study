import { readRegistrationPhoto } from './registrationPhoto.js?v=garment-registration-2';
import { createGarmentCloset } from './garmentCloset.js?v=closet-tools-3';
import { fetchMe } from '../auth.js?v=auth-1';
import { createRegistrationCamera } from './registrationCamera.js?v=registration-camera-1';

const photoInputs = [document.querySelector('#camera-photo'), document.querySelector('#gallery-photo')];
const photoPreview = document.querySelector('#garment-preview');
const analyzeButton = document.querySelector('#analyze-garment');
const analysisStatus = document.querySelector('#analysis-status');
const form = document.querySelector('#garment-form');
const saveStatus = document.querySelector('#save-status');
const listStatus = document.querySelector('#garment-list-status');
const garmentList = document.querySelector('#garment-list');
const garmentClosetView = createGarmentCloset({
  list: garmentList,
  status: listStatus,
  pagination: document.querySelector('#garment-list-pages')
});
const garmentTypeInput = document.querySelector('#garment-type');
const backgroundInput = document.querySelector('#background-id');
let photoDataUrl = '';
let closetImageDataUrl = '';
const camera = createRegistrationCamera({
  openButton: document.querySelector('#open-camera'),
  panel: document.querySelector('#camera-panel'),
  video: document.querySelector('#camera-video'),
  captureButton: document.querySelector('#capture-camera'),
  cancelButton: document.querySelector('#close-camera'),
  status: document.querySelector('#camera-status'),
  onPhoto: (file) => handlePhotoSelection({ files: [file] })
});
// HTTP로 접속한 휴대폰은 기존 기본 카메라 선택도 사용할 수 있습니다.
document.querySelector('#native-camera-action').hidden = globalThis.isSecureContext ||
  !/Android|iPhone|iPad/i.test(navigator.userAgent);

async function handlePhotoSelection(input) {
  const file = input.files?.[0];
  if (!file) return;
  camera.close();
  if (photoPreview.src.startsWith('blob:')) URL.revokeObjectURL(photoPreview.src);
  form.hidden = true;
  photoDataUrl = '';
  closetImageDataUrl = '';
  analyzeButton.disabled = true;
  analysisStatus.textContent = '';
  photoPreview.hidden = true;
  if (!file.type.startsWith('image/')) {
    showStatus(analysisStatus, '사진 파일을 골라 주세요.', true);
    return;
  }
  try {
    photoDataUrl = await readRegistrationPhoto(file);
    photoPreview.src = URL.createObjectURL(file);
    photoPreview.hidden = false;
    analyzeButton.disabled = !garmentTypeInput.value;
    showStatus(analysisStatus, '사진을 골랐어요. 다음 버튼을 눌러 옷을 찾아봐요.');
  } catch (error) {
    showStatus(analysisStatus, error.message, true);
  }
}

photoInputs.forEach((input) => input.addEventListener('change', () => handlePhotoSelection(input)));

analyzeButton.addEventListener('click', runAnalysis);

backgroundInput.addEventListener('change', () => {
  if (!form.hidden && photoDataUrl) runAnalysis();
});

garmentTypeInput.addEventListener('change', () => {
  analyzeButton.disabled = !photoDataUrl || !garmentTypeInput.value;
  if (!form.hidden && photoDataUrl) runAnalysis();
});

async function runAnalysis() {
  analyzeButton.disabled = true;
  form.hidden = true;
  showStatus(analysisStatus, '고른 배경의 표시와 옷 모양을 찾고 있어요. 잠시 기다려 주세요.');
  try {
    const result = await requestJson('/api/garments/analyze', {
      method: 'POST', body: JSON.stringify({ backgroundId: backgroundInput.value, garmentId: Number(garmentTypeInput.value), photoDataUrl })
    });
    fillForm(result);
    form.hidden = false;
    showStatus(analysisStatus, result.message);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showStatus(analysisStatus, error.message, true);
  } finally {
    analyzeButton.disabled = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!photoDataUrl) return showStatus(saveStatus, '저장할 사진을 먼저 골라 주세요.', true);
  const values = new FormData(form);
  const garmentTypeId = Number(garmentTypeInput.value);
  const payload = {
    name: values.get('name'), category: categoryForId(garmentTypeId), garmentTypeId, gender: values.get('gender'),
    lengthCm: Number(values.get('lengthCm')), widthCm: Number(values.get('widthCm')),
    colorName: values.get('colorName'), photoDataUrl, closetImageDataUrl, backgroundId: backgroundInput.value
  };
  const saveButton = form.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  showStatus(saveStatus, '옷과 사진을 서버에 저장하고 있어요.');
  try {
    const saved = await requestJson('/api/garments', { method: 'POST', body: JSON.stringify(payload) });
    showStatus(analysisStatus, `${saved.name}을(를) 옷장에 저장했어요!`);
    await loadGarments();
    form.reset();
    form.hidden = true;
    photoInputs.forEach((input) => { input.value = ''; });
    photoDataUrl = '';
    closetImageDataUrl = '';
    backgroundInput.value = 'M4';
    garmentTypeInput.value = '';
    photoPreview.hidden = true;
    analyzeButton.disabled = true;
  } catch (error) {
    showStatus(saveStatus, error.message, true);
  } finally {
    saveButton.disabled = false;
  }
});

function fillForm(result) {
  form.elements.lengthCm.value = result.lengthCm;
  form.elements.widthCm.value = result.widthCm;
  form.elements.colorName.value = result.colorName;
  form.elements.name.value = '';
  document.querySelector('#width-label').textContent = `${result.widthLabel}(cm)`;
  document.querySelector('#chosen-garment-type').textContent = `선택한 종류: ${result.garmentName}`;
  document.querySelector('#analysis-preview').src = result.analysisPhotoDataUrl;
  closetImageDataUrl = result.closetImageDataUrl;
  document.querySelector('#review-note').textContent = '초록 선은 옷 테두리, 주황 선은 길이, 파란 선은 너비예요. 사진과 숫자가 맞는지 살펴보고 필요하면 고쳐 주세요.';
}

async function loadGarments() {
  return garmentClosetView.reload();
}

function categoryForId(garmentId) {
  if (garmentId === 3) return 'dress';
  if (garmentId === 5) return 'pants';
  return 'top';
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
  } catch {
    throw new Error('저장 서버에 연결할 수 없어요. FitShare 서버가 켜져 있는지 확인해 주세요.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '요청을 마치지 못했어요. 사진을 확인하고 다시 해 주세요.');
  return result;
}

function showStatus(target, message, isError = false) {
  target.textContent = message;
  target.classList.toggle('is-error', isError);
}

loadGarments();

// 옷을 올리려면 로그인해야 해요. 로그인하지 않았으면 등록 화면 대신 안내를 보여 줍니다.
fetchMe().then((user) => {
  const main = document.querySelector('#garment-registration');
  if (user) {
    document.querySelector('#owner-note').textContent = `올린 사람은 로그인한 ${user.name} 님으로 자동으로 적혀요.`;
    return;
  }
  main.hidden = true;
  const notice = document.createElement('section');
  notice.className = 'measurement-panel registration-panel';
  notice.innerHTML = '<h1>먼저 로그인해 주세요</h1><p class="measurement-intro">옷을 등록하려면 로그인이 필요해요.</p><a class="primary-action" href="../index.html">로그인하러 가기 →</a>';
  main.after(notice);
});

