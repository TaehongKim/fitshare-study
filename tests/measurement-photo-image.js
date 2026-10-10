import { loadPhotoImage, releasePhotoImage } from '../js/measurement/photoImage.js';

const results = [];
async function check(name, action) {
  try { await action(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}
function makeImageTools() {
  const revoked = [];
  class FakeImage {
    naturalWidth = 40;
    naturalHeight = 20;
    set src(value) { this.url = value; queueMicrotask(() => this.onload?.()); }
  }
  return {
    revoked,
    ImageClass: FakeImage,
    URLApi: { createObjectURL: () => 'blob:test-photo', revokeObjectURL: (url) => revoked.push(url) }
  };
}

await check('경계: createImageBitmap이 없어도 사진 이미지로 열어요', async () => {
  const tools = makeImageTools();
  const image = await loadPhotoImage(new Blob(['photo']), { ...tools, createBitmap: undefined });
  if (!(image instanceof tools.ImageClass) || image.naturalWidth !== 40) throw new Error('대체 이미지 읽기를 사용하지 않았어요.');
  if (tools.revoked[0] !== 'blob:test-photo') throw new Error('사진을 읽은 뒤 임시 주소를 정리하지 않았어요.');
});

await check('오류 회복: createImageBitmap이 실패하면 이미지 읽기를 다시 시도해요', async () => {
  const tools = makeImageTools();
  const image = await loadPhotoImage(new Blob(['photo']), { ...tools, createBitmap: async () => { throw new Error('decoder unavailable'); } });
  if (!(image instanceof tools.ImageClass)) throw new Error('대체 이미지 읽기에 도달하지 않았어요.');
});

await check('정상: ImageBitmap 자원은 사용 후 닫을 수 있어요', async () => {
  let closed = false;
  const bitmap = { width: 10, height: 10, close: () => { closed = true; } };
  const result = await loadPhotoImage(new Blob(['photo']), { createBitmap: async () => bitmap });
  releasePhotoImage(result);
  if (!closed) throw new Error('ImageBitmap을 정리하지 않았어요.');
});

await check('오류: 지원하지 않는 사진 형식은 안내와 함께 실패해요', async () => {
  const tools = makeImageTools();
  class BrokenImage { set src(_) { queueMicrotask(() => this.onerror?.()); } }
  try { await loadPhotoImage(new Blob(['photo']), { ...tools, ImageClass: BrokenImage, createBitmap: undefined }); }
  catch (error) { if (/JPG|PNG/.test(error.message)) return; throw error; }
  throw new Error('열 수 없는 사진 형식을 거부하지 않았어요.');
});

await check('오류: 브라우저가 열지 못한 HEIC 사진에는 변환 방법을 안내해요', async () => {
  const tools = makeImageTools();
  class BrokenImage { set src(_) { queueMicrotask(() => this.onerror?.()); } }
  const header = new Uint8Array(16);
  header.set([102, 116, 121, 112], 4); // 파일 안의 ftyp 표시
  header.set([104, 101, 105, 99], 8); // heic 형식 표시
  try {
    await loadPhotoImage(new Blob([header], { type: 'application/octet-stream' }), {
      ...tools, ImageClass: BrokenImage, createBitmap: async () => { throw new Error('decoder unavailable'); }
    });
  } catch (error) {
    if (/HEIC|HEIF/.test(error.message) && /JPG|PNG/.test(error.message)) return;
    throw error;
  }
  throw new Error('열 수 없는 HEIC 사진의 변환 안내가 나오지 않았어요.');
});

const list = document.querySelector('#results');
results.forEach(({ name, passed, error }) => {
  const item = document.createElement('li'); item.textContent = `${passed ? '통과' : '실패'} · ${name}${error ? ` · ${error}` : ''}`;
  item.style.color = passed ? 'green' : 'red'; list.append(item);
});
