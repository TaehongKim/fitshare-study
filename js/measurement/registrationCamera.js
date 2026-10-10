// 촬영한 JPEG를 기존 사진 선택 흐름에 넘깁니다. 분석·저장 방식은 바꾸지 않습니다.
export function createRegistrationCamera(ui, browser = {}) {
  const mediaDevices = browser.mediaDevices ?? globalThis.navigator?.mediaDevices;
  const secureContext = browser.secureContext ?? globalThis.isSecureContext;
  const documentRef = browser.documentRef ?? document;
  const windowRef = browser.windowRef ?? window;
  const FileClass = browser.FileClass ?? globalThis.File;
  let stream = null;
  let session = 0;

  function showStatus(message, isError = false) {
    ui.status.textContent = message;
    ui.status.classList.toggle('is-error', isError);
  }

  function close() {
    session += 1;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    ui.video.pause();
    ui.video.srcObject = null;
    ui.panel.hidden = true;
    ui.captureButton.disabled = true;
    ui.openButton.disabled = false;
  }

  function ready() {
    ui.captureButton.disabled = !stream || !ui.video.videoWidth || !ui.video.videoHeight;
  }

  async function open() {
    close();
    const currentSession = session;
    ui.panel.hidden = false;
    showStatus('카메라를 켜고 있어요. 카메라 사용 요청이 뜨면 허용해 주세요.');
    ui.cancelButton.focus();
    if (!secureContext) {
      showStatus('노트북에서는 http://localhost:8000/measure/register.html 로 열어 주세요. 다른 기기에서 직접 촬영하려면 HTTPS 연결이 필요해요.', true);
      return;
    }
    if (!mediaDevices?.getUserMedia) {
      showStatus('이 브라우저는 직접 촬영을 지원하지 않아요. 최신 Chrome이나 Edge를 쓰거나 갤러리에서 사진을 골라 주세요.', true);
      return;
    }
    ui.openButton.disabled = true;
    try {
      const openedStream = await mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      // 권한 요청 중 닫았다면, 늦게 켜진 카메라도 바로 끕니다.
      if (session !== currentSession) {
        openedStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = openedStream;
      ui.video.srcObject = stream;
      stream.getTracks().forEach((track) => track.addEventListener('ended', () => {
        if (session !== currentSession) return;
        close();
        ui.panel.hidden = false;
        showStatus('카메라 연결이 끊겼어요. 카메라로 촬영 버튼을 다시 눌러 주세요.', true);
      }));
      await ui.video.play();
      if (session !== currentSession) return;
      ready();
      showStatus('옷 전체와 매트가 화면에 보이면 사진 찍기를 눌러 주세요.');
    } catch (error) {
      if (session !== currentSession) return;
      close();
      ui.panel.hidden = false;
      const messages = {
        NotAllowedError: '카메라 권한이 꺼져 있어요. 주소창 옆 사이트 설정에서 카메라를 허용한 뒤 다시 눌러 주세요.',
        NotFoundError: '사용할 카메라를 찾지 못했어요. 노트북 카메라가 연결되어 있는지 확인해 주세요.',
        NotReadableError: '카메라를 켜지 못했어요. 다른 앱이 사용 중인지, 카메라 차단 스위치가 켜져 있는지 확인해 주세요.'
      };
      showStatus(messages[error.name] || '카메라를 켜지 못했어요. 연결과 권한을 확인하고 다시 시도해 주세요.', true);
    }
  }

  async function capture() {
    if (!stream || ui.captureButton.disabled || !ui.video.videoWidth || !ui.video.videoHeight) return;
    const currentSession = session;
    ui.captureButton.disabled = true;
    try {
      const canvas = documentRef.createElement('canvas');
      canvas.width = ui.video.videoWidth;
      canvas.height = ui.video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('사진을 만들지 못했어요. 다시 촬영해 주세요.');
      context.drawImage(ui.video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 1));
      if (session !== currentSession) return;
      if (!blob) throw new Error('사진을 만들지 못했어요. 다시 촬영해 주세요.');
      const file = new FileClass([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
      close();
      await ui.onPhoto(file);
      ui.openButton.focus();
    } catch (error) {
      if (session !== currentSession) return;
      showStatus(error.message || '사진을 찍지 못했어요. 다시 촬영해 주세요.', true);
      ready();
    }
  }

  ui.openButton.addEventListener('click', open);
  ui.captureButton.addEventListener('click', capture);
  ui.cancelButton.addEventListener('click', () => { close(); ui.openButton.focus(); });
  ui.video.addEventListener('loadeddata', ready);
  windowRef.addEventListener('pagehide', close);
  windowRef.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !ui.panel.hidden) { close(); ui.openButton.focus(); }
  });
  return { open, close, capture };
}
