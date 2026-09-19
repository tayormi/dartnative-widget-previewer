# Speech runtime notices

The browser adapter uses ONNX Runtime Web 1.30.0, copyright Microsoft Corporation, under the MIT License. Its matching JavaScript and WASM files are served from this application's origin. The complete license is included at `web/licenses/onnxruntime.txt` and served at `/licenses/onnxruntime.txt`.

`runtime/speech-tokenizer.js` adapts the Unicode processor from [Supertone's browser example](https://github.com/supertone-inc/supertonic/blob/main/web/helper.js), copyright 2025 Supertone Inc., under the MIT License. The complete license is included at `web/licenses/supertonic-code.txt` and served at `/licenses/supertonic-code.txt`.

Model files download directly from the pinned public Hugging Face repositories on first use. They are not included in the application bundle:

- [SuperTonic-3 int8 weights](https://huggingface.co/csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11/tree/cca5a0e6c96e1d2c720986bf7e75fcc81dee3ae4), revision `cca5a0e6c96e1d2c720986bf7e75fcc81dee3ae4`.
- [Official configuration and voice styles](https://huggingface.co/Supertone/supertonic-3/tree/3cadd1ee6394adea1bd021217a0e650ede09a323), revision `3cadd1ee6394adea1bd021217a0e650ede09a323`.

The model repository supplies the BigScience Open RAIL-M License, including its use restrictions. The complete, unchanged license is included at `web/licenses/supertonic-model.txt` and served at `/licenses/supertonic-model.txt`. This model license is separate from the MIT code licenses above.

`runtime/speech-model-manifest.js` records every downloaded file's revision URL, byte length and SHA-256 digest. The browser verifies those values before caching or using a model file. Speech text stays in the browser worker; model downloads do not send it to an inference service.
