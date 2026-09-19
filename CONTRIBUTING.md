# Working on the previewer

Follow the [quick start](README.md#quick-start) to install dependencies and build the demo. Keep the controller running while working on the UI. Reload the browser after changing files under `web/`; restart the controller after changing its Node.js modules.

## Code map

| Area | Entry points |
| --- | --- |
| Session lifecycle, source watching, native actions | `bin/preview.mjs` |
| HTTP routes, local-origin checks, asset serving | `lib/server.mjs` |
| Preview discovery and diagnostics | `lib/discovery.dart`, `lib/discovery-client.mjs` |
| Native host generation | `lib/generate.mjs`, `lib/native-host.dart.template` |
| Browser catalog, filtering, dialogs, native stream | `web/app.js` |
| Individual preview lifecycle and controls | `web/preview-card.js` |
| Page and card markup | `web/index.html` |
| Browser request helper | `web/api.js` |
| Dart syntax conversion for the browser | `lib/browser/` |
| Browser interpreter and renderer | `runtime/` |
| Annotations and preview scope | `packages/dartnative_preview/` |
| VS Code integration | `vscode/extension.cjs` |

The native host is a Dart template with two insertion markers. Keep widget logic there and fixture metadata generation in `lib/generate.mjs`.

## Editing

- Keep functions focused and pass dependencies explicitly when moving behavior between modules.
- Use names that explain intent. Reserve comments for constraints, ownership, SDK quirks, or decisions that the code cannot explain.
- Preserve comments about native behavior unless you have verified that the constraint no longer applies.
- Follow `.editorconfig` and the existing Prettier configuration. Format Dart with the SDK's bundled `dart format`.
- Edit source under `runtime/` and `lib/browser/`. Files under `web/vendor/` and `web/parser/` are build output. The large SDK and icon catalogs contain runtime data; keep their API coverage intact.

Run `npm run build:browser` after runtime changes and `npm run build:parser` after browser-parser changes. Changes under `web/` do not require a bundle rebuild.

## Verification

Resolve the annotation package against the SDK before analyzing its native imports, then run:

```sh
(cd packages/dartnative_preview && /absolute/path/to/your-sdk/bin/dn pub get)
npm test
npm run format:check
/absolute/path/to/your-sdk/bin/cache/dart-sdk/bin/dart test
/absolute/path/to/your-sdk/bin/cache/dart-sdk/bin/dart analyze lib bin test packages/dartnative_preview/lib
```

For browser UI changes, also check a stateful preview, Grid/List switching, environment controls, inspection, and source navigation. Confirm that changing an environment retains compatible state and that Reset clears it.

Changes to native host behavior need an iOS simulator check. Browser success alone does not establish native fidelity. Record any relevant SDK limitation in [Native SDK gaps](docs/NATIVE-SDK-GAPS.md).

Use `npm run package:release` to rebuild the source ZIP and VSIX. After changing setup or packaging, extract the ZIP into a new directory and repeat the quick start there.

Keep local QA reports, screenshots, and session data under `.local/`. Git and the release packager exclude that directory.
