import { findDominantClothingBox, findMatCorners, orderMatCornersForPortrait } from './vision.js?v=auto-photo-3';
import { getClothingCropBounds, measureA0Garment } from './calibration.js?v=auto-photo-3';
import { rectifyPhoto } from './homography.js?v=auto-photo-1';
import { loadPhotoImage, releasePhotoImage } from './photoImage.js?v=photo-load-fallback-2';

// 한 장의 사진에서 A0 매트를 펴고, 옷의 길이와 너비를 먼저 계산합니다.
export async function autoProcessPhoto(photoBlob, category, backgroundId = 'M1') {
  try {
    return await autoProcessOnServer(photoBlob, category, backgroundId);
  } catch (serverError) {
    // 서버 분석을 쓸 수 없을 때 기존 브라우저 분석으로 한 번 더 시도한다.
    const localResult = await autoProcessOnDevice(photoBlob, category);
    if (localResult.ok) {
      localResult.message = `${localResult.message} 서버 자동 분석에 연결하지 못해 기기 분석값을 보여 줘요.`;
    } else if (serverError?.message) {
      localResult.message = `${localResult.message || '자동 분석을 마치지 못했어요.'} ${serverError.message}`;
    }
    return localResult;
  }
}

async function autoProcessOnServer(photoBlob, category, backgroundId) {
  const photoDataUrl = await blobToDataUrl(photoBlob);
  const response = await fetch('/api/measurements/automatic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoDataUrl, category, backgroundId })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || '서버 자동 분석을 마치지 못했어요.');

  const fullPhoto = await dataUrlToBlob(result.fullPhotoDataUrl);
  const measuredPhoto = await dataUrlToBlob(result.photoDataUrl);
  const bitmap = await loadPhotoImage(measuredPhoto);
  const canvas = document.createElement('canvas');
  const box = result.box;
  const crop = getClothingCropBounds(box, bitmap.width, bitmap.height, 0.04);
  canvas.width = crop.width;
  canvas.height = crop.height;
  try {
    canvas.getContext('2d').drawImage(bitmap, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.width, crop.height);
  } finally {
    releasePhotoImage(bitmap);
  }
  const photo = await canvasToJpeg(canvas, 0.9);
  const outline = {
    ok: true,
    confidence: result.confidence,
    box: {
      left: box.left - crop.left, top: box.top - crop.top,
      right: box.right - crop.left, bottom: box.bottom - crop.top
    }
  };
  return {
    ok: true, photo, fullPhoto, corrected: true,
    outline, fullOutline: { ok: true, confidence: result.confidence, box },
    lengthCm: result.lengthCm, widthCm: result.widthCm,
    confidence: result.confidence,
    message: `${result.message} ${result.rectificationMethod}으로 보정했어요.`
  };
}

async function autoProcessOnDevice(photoBlob, category) {
  const bitmap = await loadPhotoImage(photoBlob);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = Math.round(bitmap.width * scale);
  sourceCanvas.height = Math.round(bitmap.height * scale);
  try {
    sourceCanvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0, sourceCanvas.width, sourceCanvas.height);
  } finally {
    releasePhotoImage(bitmap);
  }

  const normalizedPhoto = await canvasToJpeg(sourceCanvas, 0.86);
  const mat = findMatCorners(sourceCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sourceCanvas.width, sourceCanvas.height));
  if (!mat.ok) return { ok: false, photo: normalizedPhoto, corrected: false, message: mat.message };

  const portraitCorners = orderMatCornersForPortrait(mat.corners);
  const correctedPhoto = await rectifyPhoto(normalizedPhoto, portraitCorners, 600, 848);
  const correctedBitmap = await loadPhotoImage(correctedPhoto);
  const correctedCanvas = document.createElement('canvas');
  correctedCanvas.width = correctedBitmap.width; correctedCanvas.height = correctedBitmap.height;
  try {
    correctedCanvas.getContext('2d', { willReadFrequently: true }).drawImage(correctedBitmap, 0, 0);
  } finally {
    releasePhotoImage(correctedBitmap);
  }

  const outline = findDominantClothingBox(correctedCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, correctedCanvas.width, correctedCanvas.height));
  if (!outline.ok) return { ok: false, photo: correctedPhoto, corrected: true, outline, message: `사진 기울기는 폈어요. ${outline.message}` };

  try {
    const measurements = measureA0Garment(outline.box, category, correctedCanvas.width, correctedCanvas.height);
    if (outline.confidence < 0.25) {
      return { ok: false, photo: correctedPhoto, corrected: true, outline, message: '사진 기울기는 폈어요. 옷을 확실히 찾지 못해 길이를 직접 확인해 주세요.' };
    }
    const crop = getClothingCropBounds(outline.box, correctedCanvas.width, correctedCanvas.height, 0.04);
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = crop.width; croppedCanvas.height = crop.height;
    croppedCanvas.getContext('2d').drawImage(correctedCanvas, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const croppedPhoto = await canvasToJpeg(croppedCanvas, 0.9);
    const croppedOutline = { ...outline, box: {
      left: outline.box.left - crop.left, top: outline.box.top - crop.top,
      right: outline.box.right - crop.left, bottom: outline.box.bottom - crop.top
    } };
    return {
      ok: true, photo: croppedPhoto, fullPhoto: correctedPhoto, corrected: true,
      outline: croppedOutline, fullOutline: outline,
      ...measurements,
      confidence: outline.confidence,
      message: `사진 기울기를 펴고 옷 길이와 너비를 약 ${Math.round(outline.confidence * 100)}% 확신으로 찾았어요. 숫자를 확인해 주세요.`
    };
  } catch (error) {
    return { ok: false, photo: correctedPhoto, corrected: true, outline, message: error.message };
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('사진을 분석 서버로 보내지 못했어요.'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then((response) => response.blob());
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('사진을 준비하지 못했어요. 다시 찍어 주세요.')), 'image/jpeg', quality);
  });
}
