import assert from 'node:assert/strict';
import { Blob, File } from 'node:buffer';

export async function runCameraTests(createRegistrationCamera) {
  const results = [];
  function fixture(getUserMedia, secureContext = true) {
    const element = () => ({ hidden: true, disabled: false, textContent: '',
      listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
      classList: { toggle() {} }, focus() {} });
    const video = { ...element(), videoWidth: 1920, videoHeight: 1080,
      srcObject: null, async play() {}, pause() {} };
    const canvas = { getContext: () => ({ drawImage() {} }),
      toBlob(callback) { callback(new Blob(['photo'], { type: 'image/jpeg' })); } };
    const ui = { openButton: element(), panel: element(), video,
      captureButton: element(), cancelButton: element(), status: element(),
      onPhoto: async (file) => { ui.photo = file; } };
    const windowListeners = {};
    const camera = createRegistrationCamera(ui, { secureContext,
      FileClass: File,
      mediaDevices: { getUserMedia }, documentRef: { createElement: () => canvas },
      windowRef: { addEventListener(name, action) { windowListeners[name] = action; } } });
    return { ui, camera, canvas, windowListeners };
  }
  async function test(name, action) { await action(); results.push(name); }
  const makeStream = () => {
    const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {} };
    return { track, getTracks: () => [track] };
  };

  await test('정상: 카메라 영상의 원래 크기로 JPEG 촬영하고 카메라 종료', async () => {
    const stream = makeStream();
    let constraints;
    const { ui, camera, canvas } = fixture(async (value) => { constraints = value; return stream; });
    await camera.open();
    assert.equal(ui.panel.hidden, false);
    assert.equal(ui.video.srcObject, stream);
    assert.equal(constraints.audio, false);
    assert.equal(constraints.video.facingMode.ideal, 'environment');
    assert.equal(ui.captureButton.disabled, false);
    await camera.capture();
    assert.equal(ui.photo.type, 'image/jpeg');
    assert.equal(canvas.width, 1920);
    assert.equal(canvas.height, 1080);
    assert.equal(stream.track.stopped, true);
    assert.equal(ui.panel.hidden, true);
  });
  await test('경계: 영상 크기가 아직 없으면 촬영하지 않음', async () => {
    const { ui, camera } = fixture(async () => makeStream());
    ui.video.videoWidth = 0;
    await camera.open();
    await camera.capture();
    assert.equal(ui.photo, undefined);
    assert.equal(ui.captureButton.disabled, true);
    camera.close();
  });
  await test('경계: 카메라 닫기 버튼과 페이지 이동에서 카메라 종료', async () => {
    const stream = makeStream();
    const { ui, camera, windowListeners } = fixture(async () => stream);
    await camera.open();
    ui.cancelButton.listeners.click();
    assert.equal(stream.track.stopped, true);
    assert.equal(ui.video.srcObject, null);
    assert.equal(ui.panel.hidden, true);
    stream.track.stopped = false;
    await camera.open();
    windowListeners.pagehide();
    assert.equal(stream.track.stopped, true);
    assert.equal(ui.video.srcObject, null);
  });
  await test('오류: 영상 재생 실패 시 켜진 카메라도 종료', async () => {
    const stream = makeStream();
    const { ui, camera } = fixture(async () => stream);
    ui.video.play = async () => { throw new Error('play failed'); };
    await camera.open();
    assert.equal(stream.track.stopped, true);
    assert.equal(ui.video.srcObject, null);
    assert.equal(ui.captureButton.disabled, true);
    assert.match(ui.status.textContent, /카메라/);
  });
  await test('오류: 권한 거부 안내 후 다시 시도 가능', async () => {
    const { ui, camera } = fixture(async () => { throw { name: 'NotAllowedError' }; });
    await camera.open();
    assert.match(ui.status.textContent, /권한/);
    assert.equal(ui.openButton.disabled, false);
    assert.equal(ui.captureButton.disabled, true);
  });
  await test('오류: 카메라 없음 안내', async () => {
    const { ui, camera } = fixture(async () => { throw { name: 'NotFoundError' }; });
    await camera.open();
    assert.match(ui.status.textContent, /카메라.*찾/);
  });
  await test('오류: HTTP IP 주소에서는 localhost 안내', async () => {
    let requested = false;
    const { ui, camera } = fixture(async () => { requested = true; }, false);
    await camera.open();
    assert.equal(requested, false);
    assert.match(ui.status.textContent, /localhost/);
  });
  await test('오류: 카메라 API 없는 브라우저도 앱이 깨지지 않음', async () => {
    const { ui, camera } = fixture(undefined);
    await camera.open();
    assert.match(ui.status.textContent, /브라우저/);
    assert.equal(ui.captureButton.disabled, true);
  });
  await test('경계: 권한 응답 전에 취소해도 늦게 도착한 카메라 종료', async () => {
    let resolve;
    const stream = makeStream();
    const { ui, camera } = fixture(() => new Promise((done) => { resolve = done; }));
    const opening = camera.open();
    camera.close();
    resolve(stream);
    await opening;
    assert.equal(stream.track.stopped, true);
    assert.equal(ui.video.srcObject, null);
    assert.equal(ui.panel.hidden, true);
  });
  await test('오류: JPEG 변환 실패해도 다시 촬영 가능', async () => {
    const { ui, camera, canvas } = fixture(async () => makeStream());
    canvas.toBlob = (callback) => callback(null);
    await camera.open();
    await camera.capture();
    assert.match(ui.status.textContent, /사진/);
    assert.equal(ui.captureButton.disabled, false);
    assert.equal(ui.photo, undefined);
    camera.close();
  });
  await test('경계: JPEG 변환 중 닫으면 늦게 완성된 사진을 선택하지 않음', async () => {
    const { ui, camera, canvas } = fixture(async () => makeStream());
    let finish;
    canvas.toBlob = (callback) => { finish = callback; };
    await camera.open();
    const capture = camera.capture();
    camera.close();
    finish(new Blob(['photo'], { type: 'image/jpeg' }));
    await capture;
    assert.equal(ui.photo, undefined);
    assert.equal(ui.panel.hidden, true);
  });
  return results;
}
