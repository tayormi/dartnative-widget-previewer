import { decodeLottieSource } from './lottie-source.js';
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ result: await decodeLottieSource(data) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
