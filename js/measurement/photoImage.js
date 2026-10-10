// 브라우저마다 사진 읽기 기능이 달라서, 가능한 읽기 방법을 차례로 시도합니다.
export async function loadPhotoImage(blob, options = {}) {
  const createBitmap = Object.prototype.hasOwnProperty.call(options, 'createBitmap')
    ? options.createBitmap
    : globalThis.createImageBitmap;
  const ImageClass = options.ImageClass || globalThis.Image;
  const URLApi = options.URLApi || globalThis.URL;

  if (typeof createBitmap === 'function') {
    try {
      return await createBitmap(blob);
    } catch {
      // 이 방법으로 열리지 않으면 아래의 Image 방법을 시도합니다.
    }
  }

  if (typeof ImageClass !== 'function' || typeof URLApi?.createObjectURL !== 'function') {
    throw new Error('이 브라우저에서 사진을 열 수 없어요. JPG나 PNG 사진으로 다시 골라 주세요.');
  }

  return new Promise((resolve, reject) => {
    const image = new ImageClass();
    const imageUrl = URLApi.createObjectURL(blob);
    const cleanUp = () => URLApi.revokeObjectURL?.(imageUrl);
    image.onload = () => { cleanUp(); resolve(image); };
    image.onerror = async () => {
      cleanUp();
      reject(new Error(await unsupportedPhotoMessage(blob)));
    };
    image.src = imageUrl;
  });
}


async function unsupportedPhotoMessage(blob) {
  let header = '';
  try {
    const bytes = await blob.slice(0, 32).arrayBuffer();
    header = new TextDecoder().decode(bytes);
  } catch {
    // ??? ?? ? ??? ?? ??? ?? ??.
  }
  if (/image\/hei[cf]/i.test(blob?.type || '') || /ftyp(?:heic|heix|hevc|hevx|heim|heis|mif1|msf1)/i.test(header)) {
    return 'HEIC/HEIF ??? ? ?????? ? ? ???. ?? ??? JPG? ????? JPG/PNG ??? ?? ???.';
  }
  return '? ?? ??? ?????? ? ? ???. ????? JPG? PNG ??? ?? ???.';
}

// ImageBitmap은 다 쓴 뒤 닫아 기기의 메모리를 돌려줍니다.
export function releasePhotoImage(image) {
  image?.close?.();
}
