export async function retryPhotoMeasurement(record, processPhoto, category, backgroundId) {
  const sourcePhoto = record.rawPhoto || record.photo;
  try {
    const result = await processPhoto(sourcePhoto, category, backgroundId);
    return {
      ...record,
      photo: result.photo || record.photo,
      fullPhoto: result.fullPhoto || null,
      fullOutline: result.fullOutline || null,
      outline: result.outline || record.outline,
      corrected: Boolean(result.corrected),
      autoMeasurement: {
        ok: Boolean(result.ok), lengthCm: result.lengthCm, widthCm: result.widthCm,
        confidence: result.confidence, message: result.message
      },
      measuredLengthCm: result.ok ? result.lengthCm : null,
      measuredWidthCm: result.ok ? result.widthCm : null
    };
  } catch (error) {
    return {
      ...record,
      autoMeasurement: { ok: false, message: error?.message || '사진 분석을 다시 시도하지 못했어요.' },
      measuredLengthCm: null,
      measuredWidthCm: null
    };
  }
}

