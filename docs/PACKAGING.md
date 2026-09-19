# Install the packaged previewer

The release ZIP contains the companion source, annotation package, nineteen-fixture demo sources, and the VS Code extension in `dist/`. The VSIX requires the companion directory to remain installed.

## Browser setup

Extract the ZIP, open a terminal in `dartnative-previewer`, and run:

```sh
npm ci
npm run setup -- --dn /absolute/path/to/your-sdk/bin/dn
npm run demo -- ./demo
npm start -- --project ./demo
```

Use Node.js 22 or later and your own DartNative SDK. Setup downloads locked dependencies and builds the browser assets. For native previews, use an Apple Silicon Mac with Xcode, an iOS simulator, and the DartNative entitlement required by your project.

## VS Code setup

After browser setup, choose **Extensions: Install from VSIX…** and select `dist/dartnative-widget-previewer-0.1.0.vsix`. Open the generated `demo` folder, then run **DartNative: Open Widget Previewer**. The demo includes its companion-path settings. For an existing project, follow the [extension guide](../vscode/README.md).

The previewer and extension use the [MIT license](../LICENSE). [Dependency notices](../THIRD_PARTY_NOTICES.md) cover bundled libraries separately.

## Build another package

After setup and verification:

```sh
npm run package:release
```

This rebuilds the parser, browser runtime, and VSIX, then creates `dist/dartnative-previewer-0.1.0.zip` and `dist/SHA256SUMS.txt`. The ZIP includes a per-file SHA-256 manifest. It excludes local QA files, generated browser assets, dependencies, SDK files, and local configuration. Setup builds the browser assets on the recipient's machine.
