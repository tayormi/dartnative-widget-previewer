# DartNative Widget Previewer for VS Code

Preview annotated DartNative widgets beside their source. Browser previews use an interpreter. Choose **Run on iOS** to check a widget with the DartNative engine.

This extension connects to the companion preview controller in the parent directory. Run `npm ci` and `npm run setup` in the companion directory before starting a session. Then run `npm run package:extension` to build the VSIX.

## Install and configure

Install the included `.vsix` with **Extensions: Install from VSIX…**, or run the VS Code CLI:

```sh
code --install-extension /absolute/path/to/dartnative-previewer/dist/dartnative-widget-previewer-0.1.0.vsix
```

The generated demo includes its companion and Node settings. For an existing app, open its folder and set:

```json
{
  "dartnativePreview.toolPath": "/absolute/path/to/dartnative-previewer",
  "dartnativePreview.nodePath": "/absolute/path/to/node"
}
```

The controller reuses the SDK path saved by setup. `dartnativePreview.dnPath` is an optional per-workspace override. The official DartNative extension can remain installed for editing and ordinary app runs.

Run **DartNative: Open Widget Preview Sidebar** for the Flutter-style sidebar, or **DartNative: Open Widget Previewer** for an editor panel. Browser preview opens first and starts no native app or simulator stream.

When you choose **Run on iOS**, the extension asks for an available iOS simulator and boots it if needed. Set `dartnativePreview.deviceId` to its UDID to reuse it automatically.

If the companion controller already runs on the configured port (default 5196), the extension attaches after checking its protocol and project path. It refuses a session belonging to another project. Starting a new session requires a local Mac with Xcode and a configured DartNative SDK. Previewing runs project code, so Workspace Trust is required.

## Working with previews

- Add `@DNPreview` factories as described in the companion guide.
- Use the preview icon in a Dart editor's title bar to open the panel.
- After discovery, use **Preview …** above a factory or **DartNative: Select Widget Preview** to select it.
- Click the source location inside the panel to open that factory in the editor.
- Switching to a Dart file with fixtures filters the catalog to that file. Set `dartnativePreview.followActiveFile` to false to disable this behavior.
- Save Dart edits to update the browser cards. Compatible scalar state survives text, style, and environment changes; structural changes can reset it. In native mode, compatible edits hot reload. Source diagnostics appear in **Problems** and **Console**. The last working native view remains visible during a source error.
- Use each browser card's zoom and Reset controls. The command palette also provides **Reload Widget Preview**, **Reset Widget Preview** and **Restart Preview App** for the controller session.

Tap a native text field, then use **Keyboard** below the stream for desktop typing or paste. It forwards US-layout characters, Enter, arrows, Delete and Backspace to the simulator. Shift with an arrow extends the native selection. Tab moves focus out of the browser typing control for keyboard accessibility. Use the onscreen iOS keyboard for other layouts and composed characters.

## Session ownership

Closing the preview panel keeps the session alive so reopening it is quick. **DartNative: Stop Widget Previewer** disconnects the panel. If the extension started the controller, this command also stops its native app and stream; an externally started controller stays running.

Closing the VS Code window stops its owned session. The controller also watches its launching extension host, so an unexpectedly closed host triggers cleanup. The simulator remains booted.

## Current limits

The browser and native previews run the same fixture source, but their state is separate. Browser output is an approximation of supported widgets and APIs. Native output comes from the actual DartNative app.

The extension supports one active project/session per VS Code window. It uses the companion controller's local iOS simulator scope and requires that controller to remain installed at `toolPath`. The VSIX does not bundle the DartNative SDK or the simulator transport. Remote SSH, Codespaces, physical devices and Android are not supported in this release.

Source actions use the resolved preview catalog once connected. Initial discovery can take several seconds; the analyzer stays running for later updates. Source navigation is restricted to Dart files inside the selected project.

The implementation follows VS Code's [Webview API](https://code.visualstudio.com/api/extension-guides/webview) and [Workspace Trust guidance](https://code.visualstudio.com/api/extension-guides/workspace-trust).
