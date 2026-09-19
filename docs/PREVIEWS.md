# Preview guide

## Use your project

Add the annotation package to your project's `pubspec.yaml`, using the path to your previewer installation:

```yaml
dependencies:
  dartnative_preview:
    path: /absolute/path/to/dartnative-previewer/packages/dartnative_preview
```

Run `dn pub get`, then add a preview under `lib/`:

```dart
import 'package:dartnative/dartnative.dart';
import 'package:dartnative_preview/dartnative_preview.dart';

@DNPreview(name: 'Greeting', group: 'Components', width: 320, height: 120)
Widget greetingPreview() => const Text('Hello, DartNative');
```

Start the previewer with `npm start -- --project /absolute/path/to/your/app`. It creates `lib/dn_preview_generated.dart`; add that file to your app's `.gitignore`.

Factories must be public, synchronous, callable without required arguments, and return a DartNative `Widget`. Top-level functions, static methods, and constructors are supported, including annotation aliases and declarations in Dart part files. Supply sample data and dependencies inside the factory or a wrapper. The previewer does not call your app's `main()`.

The controller runs locally at `127.0.0.1`. Previewing executes project code, so open projects you trust.

## Size and appearance

Browser previews default to 320 × 240 for components. Set `fullScreen: true` for a screen; its default is 402 × 874. Explicit dimensions also set the browser's `MediaQuery` size. Zoom changes the display scale while keeping these logical dimensions.

Native screen previews use the simulator's dimensions. Components use their declared dimensions inside a centered Scaffold and inherit the simulator's device traits.

| Option | Behavior |
| --- | --- |
| `name`, `group` | Label and group the preview |
| `width`, `height` | Set preview dimensions |
| `size` | A `Size` that takes precedence over `width` and `height` |
| `textScaleFactor` | Browser text scaling and reflow, from 0.5 to 3 |
| `brightness` | Initial light or dark appearance |
| `wrapper` | A public function that receives and wraps the widget, for example with inherited mock data |
| `theme` | A public function returning `ThemeData`; the host applies the selected brightness |
| `localizations` | A public function returning `DNPreviewLocalizations` with locale, direction, and an optional localization wrapper |

```dart
ThemeData previewTheme() => ThemeData.light();
Widget withSampleData(Widget child) => MySampleData(child: child);

@DNPreview(
  name: 'Large text',
  group: 'Reading card',
  size: Size(360, 460),
  textScaleFactor: 2,
  brightness: Brightness.dark,
  wrapper: withSampleData,
  theme: previewTheme,
)
Widget readingPreview() => const ReadingCard();
```

`MySampleData` and `ReadingCard` are application widgets. See [a_components.dart](../examples/a_components.dart) for a working example.

Multiple annotations on one factory create separate cards. Reuse configurations with `@DNPreviewSet([...])` or a constant subclass of `DNPreviewSet`. Each card has independent state. The host applies the widget wrapper first, then the localization wrapper, preview scope, direction, and theme.

Locale metadata does not translate strings. Supply translations through a wrapper or read `DNPreviewScope.maybeOf(context)?.locale` in your widget. External localization packages do not load automatically. Each preview supports one theme callback; sequential theme layering is not implemented.

Native previews support wrappers, application themes, localization data, and component size constraints. Their `MediaQuery` values and normal text scale come from the simulator. See [native SDK gaps](NATIVE-SDK-GAPS.md).

## Browser controls

Search and group previews, switch between Grid and List, or use the current-file filter in VS Code. Each card has zoom, Fit, and Reset controls.

- **Aa** changes dimensions, text scale, locale, and direction for one card.
- The card's appearance button changes its brightness. The footer button changes the previewer shell.
- **Use annotation** restores the declared environment.
- **Inspect widgets** shows bounds, hierarchy, and source links without triggering widget actions.
- Source buttons show Dart code in the browser and open its location in VS Code.
- **Console** shows source diagnostics and native logs.

Save a Dart file under `lib/` to update previews. Compatible scalar fields in browser State objects survive text, style, and environment changes. Each card reports whether state was retained or reset. Controllers, active routes, pending work, and structural changes can require a reset. Browser and native sessions do not share state.

The interpreter supports a subset of DartNative widgets, logic, and package APIs. Cards report unsupported behavior. The controller supplies Dart files under `lib/` and local image assets; it does not automatically load external package source into the interpreter.

## Native controls

Choose **Run on iOS**, select a simulator, and choose **Run**. Native mode builds the same annotated factory with DartNative.

| Action | Behavior |
| --- | --- |
| Save a Dart file under `lib/` | Reanalyze source and request hot reload. Compatible edits retain widget state. |
| Select a preview | Mount the selected factory in the running native process. |
| Reset widget | Remount the selected widget. Globals and persistent storage remain. |
| Restart app | Launch a new native process. Persistent storage remains. |
| Source error | Show diagnostics and keep the last native output marked as stale. Fixing the error resumes reload. |
| Stop iOS | Stop the native app and stream, then return to browser cards. |
| Stop the controller | Stop its native process and stream, and release the project lock. The simulator stays booted. |

If a navigation-bar action stops responding after switching previews, use **Restart app**. This is a [known native issue](NATIVE-SDK-GAPS.md#separate-native-root-switching-issue).

Tap and drag inside the stream to use native controls. For desktop typing, tap a native field and type or paste into **Keyboard** below the stream. It forwards US-layout text, Enter, arrows, Delete, and Backspace. Use the onscreen iOS keyboard for other layouts. On Xcode 27, the transport may need Device Hub and macOS Accessibility access.

Native previews retain your app's dependencies, plugin registration, and declared assets. Plugins still need their usual setup and simulator support. After dependency or native configuration changes, resolve dependencies and restart the app. Changes in external path dependencies require manual **Reload**.

The stream shows the full simulator viewport. Native component cropping, native view inspection, and multiple live native previews are not available. Stream scaling and compression can affect the displayed image; physical-device behavior needs device testing.

## Troubleshooting

```sh
npm run doctor
npm run doctor -- --project ./demo --native
```

A hard process kill can leave a project lock or native app behind. The lock records its controller PID. Check that the session has stopped before removing the lock.
