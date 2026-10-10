// 사진은 측정 전에 크기를 줄이지 않습니다. 원본 JPG 데이터는 그대로 사용합니다.
export function readRegistrationPhoto(file, browser = {}) {
  const maxBytes = browser.maxBytes ?? 12 * 1024 * 1024;
  if (!file || !file.type?.startsWith('image/')) {
    return Promise.reject(new Error('사진 파일을 골라 주세요. JPG나 PNG 사진을 사용할 수 있어요.'));
  }
  if (file.size > maxBytes) {
    return Promise.reject(new Error('사진 원본이 12MB보다 커요. 사진 크기를 줄여 다시 골라 주세요. 측정 정확도를 위해 자동으로 축소하지 않아요.'));
  }

  const Reader = browser.FileReaderClass || FileReader;
  const ImageClass = browser.ImageClass || Image;
  const documentRef = browser.documentRef || document;
  const jpegFile = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name || '');
  return new Promise((resolve, reject) => {
    const reader = new Reader();
    reader.onerror = () => reject(new Error('사진을 읽지 못했어요. 다시 골라 주세요.'));
    reader.onload = () => {
      if (jpegFile) {
        resolve(reader.result);
        return;
      }
      const image = new ImageClass();
      image.onerror = () => reject(new Error('사진을 열지 못했어요. JPG나 PNG 사진을 다시 골라 주세요.'));
      image.onload = () => {
        const canvas = documentRef.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 1));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
