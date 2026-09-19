# Third-party notices

The browser interpreter and renderer in `runtime/`, and the parser in `lib/browser/`, were extracted from the Native Lab builder. This checkout contains the source needed to build them independently.

The build copies these dependency licenses into `web/licenses/`:

- ONNX Runtime Web: MIT.
- Lottie Web: MIT.
- JSZip: MIT or GPL-3.0-or-later; see its bundled dual-license notice.
- Material Symbols font: Apache-2.0, with its license in `assets/fonts/`.

Speech code and downloaded model weights have separate terms described in [speech runtime notices](assets/licenses/SPEECH-RUNTIME-NOTICES.md). Models download only when that runtime feature is used; they are not included in this repository.

The installed `serve-sim` dependency retains its Apache-2.0 license in `node_modules/serve-sim`. Dart analysis packages retain their licenses in the Dart package cache. The DartNative SDK is supplied by the user and is not redistributed with this tool.

## DartNative logo

The logo in `web/dartnative-logo.png` and `vscode/icon.png` comes from the [DartNative repository](https://github.com/DartNative/dartnative/blob/main/docs/assets/dn-logo-transparent.png). The DartNative name and logo belong to their respective owners. This project’s MIT license does not grant trademark rights.
