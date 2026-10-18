// Same pinned MediaPipe release/models used by 코드페어_결선.
const ROOT='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
export async function loadVision() {
  const {FilesetResolver,PoseLandmarker}=await import(`${ROOT}/vision_bundle.mjs`);
  const files=await FilesetResolver.forVisionTasks(`${ROOT}/wasm`);
  let pose;
  async function create(Task,model,extra={}) {
    const options={baseOptions:{modelAssetPath:model,delegate:'GPU'},runningMode:'VIDEO',...extra};
    try{return await Task.createFromOptions(files,options);}
    catch{return Task.createFromOptions(files,{...options,baseOptions:{...options.baseOptions,delegate:'CPU'}});}
  }
  try {
    pose=await create(PoseLandmarker,'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',{numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5});
    return {pose};
  } catch(error) {pose?.close();throw error;}
}
