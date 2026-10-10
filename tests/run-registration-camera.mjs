import { createRegistrationCamera } from '../js/measurement/registrationCamera.js';
import { runCameraTests } from './registration-camera.mjs';

const results = await runCameraTests(createRegistrationCamera);
console.log(`${results.length} camera tests passed\n${results.join('\n')}`);
