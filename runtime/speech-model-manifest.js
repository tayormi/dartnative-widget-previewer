// Immutable SuperTonic-3 weights and JSON sidecars. Sizes and SHA-256 digests
// are checked before a completed file enters preview storage.
export const speechModelFiles = [
  {
    path: 'duration_predictor.onnx',
    url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11/resolve/cca5a0e6c96e1d2c720986bf7e75fcc81dee3ae4/duration_predictor.int8.onnx',
    bytes: 3700147,
    sha256: 'c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db',
  },
  {
    path: 'text_encoder.onnx',
    url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11/resolve/cca5a0e6c96e1d2c720986bf7e75fcc81dee3ae4/text_encoder.int8.onnx',
    bytes: 36416150,
    sha256: 'c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff',
  },
  {
    path: 'vector_estimator.onnx',
    url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11/resolve/cca5a0e6c96e1d2c720986bf7e75fcc81dee3ae4/vector_estimator.int8.onnx',
    bytes: 78400833,
    sha256: '20cd86fa5c6effedfda0e7cffe5b0569ca401c440a0c3a1d72bf39286c0db3fd',
  },
  {
    path: 'vocoder.onnx',
    url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11/resolve/cca5a0e6c96e1d2c720986bf7e75fcc81dee3ae4/vocoder.int8.onnx',
    bytes: 25991073,
    sha256: 'e923d60f53f95eb1ce235f1dc33ec56d9c057823c96fa6f8acf98f32b0da6152',
  },
  {
    path: 'tts.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/tts.json',
    bytes: 8253,
    sha256: '42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09',
  },
  {
    path: 'unicode_indexer.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/unicode_indexer.json',
    bytes: 277676,
    sha256: '9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f',
  },
  {
    path: 'voice_styles/F1.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/F1.json',
    bytes: 292046,
    sha256: 'bbdec6ee00231c2c742ad05483df5334cab3b52fda3ba38e6a07059c4563dbc2',
  },
  {
    path: 'voice_styles/F2.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/F2.json',
    bytes: 292423,
    sha256: '7c722c6a72707b1a77f035d67f0d1351ba187738e06f7683e8c72b1df3477fc6',
  },
  {
    path: 'voice_styles/F3.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/F3.json',
    bytes: 290794,
    sha256: '12f6ef2573baa2defa1128069cb59f203e3ab67c92af77b42df8a0e3a2f7c6ab',
  },
  {
    path: 'voice_styles/F4.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/F4.json',
    bytes: 291808,
    sha256: 'c2fa764c1225a76dfc3e2c73e8aa4f70d9ee48793860eb34c295fff01c2e032b',
  },
  {
    path: 'voice_styles/F5.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/F5.json',
    bytes: 291479,
    sha256: '45966e73316415626cf41a7d1c6f3b4c70dbc1ba2bee5c1978ef0ce33244fc8d',
  },
  {
    path: 'voice_styles/M1.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/M1.json',
    bytes: 291748,
    sha256: 'e35604687f5d23694b8e91593a93eec0e4eca6c0b02bb8ed69139ab2ea6b0a5b',
  },
  {
    path: 'voice_styles/M2.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/M2.json',
    bytes: 292055,
    sha256: 'b76cbf62bac707c710cf0ae5aba5e31eea1a6339a9734bfae33ab98499534a50',
  },
  {
    path: 'voice_styles/M3.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/M3.json',
    bytes: 290198,
    sha256: 'ea1ac35ccb91b0d7ecad533a2fbd0eec10c91513d8951e3b25fbba99954e159b',
  },
  {
    path: 'voice_styles/M4.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/M4.json',
    bytes: 291522,
    sha256: 'ca8eefad4fcd989c9379032ff3e50738adc547eeb5e221b82593a6d7b3bac303',
  },
  {
    path: 'voice_styles/M5.json',
    url: 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/M5.json',
    bytes: 291469,
    sha256: 'dd22b92740314321f8ae11c5e87f8dd60d060f15dd3a632b5adf77f471f77af2',
  },
];
export const speechVoices = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'];
