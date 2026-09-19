# Native preview environment: SDK gap

Verified against the locally installed DartNative SDK on 18 September 2026. Other SDK editions have not been checked.

## Missing public MediaQuery override

The installed SDK exposes `MediaQuery` as an abstract class with static readers:
`of`, `sizeOf`, `orientationOf`, `paddingOf`, `viewInsetsOf`, and `viewPaddingOf`.
It does not expose a widget constructor accepting `data` and `child`.

`MediaQueryData` already contains `size`, `textScaleFactor`,
`platformBrightness`, and `textDirection`. The SDK's internal
`_InheritedMediaQuery` can carry that data, but it is private to the framework.
Our preview host cannot instantiate it through the public API.

The documentation comment above `MediaQuery` says a subtree can be wrapped
with `MediaQuery(data: ..., child: ...)`. The installed public declarations do
not provide that constructor.

Source evidence: `package:dartnative/src/framework.dart`, `MediaQueryData`
(lines 439 to 480), `_InheritedMediaQuery` (503 to 510), and `MediaQuery` (522 to 537)
in the installed SDK. Line numbers can change between releases.

## Reproduction

Analyze this file inside a DartNative project after `dn pub get`:

```dart
import 'package:dartnative/dartnative.dart';

Widget previewEnvironment(Widget child) => MediaQuery(
  data: const MediaQueryData(
    size: Size(320, 240),
    textScaleFactor: 1.5,
    platformBrightness: Brightness.dark,
  ),
  child: child,
);
```

The bundled Dart analyzer reports:

- `instantiate_abstract_class`: `MediaQuery` cannot be instantiated.
- `undefined_named_parameter`: neither `data` nor `child` is defined.
- `return_of_invalid_type`: `MediaQuery` is not a `Widget`.

These are analyzer results. The check did not modify the SDK or test an override in the native engine.

## Impact on Widget Previewer

| Setting | What the native host can do | What this gap prevents |
| --- | --- | --- |
| Component size | Constrain a component with `SizedBox` | Make `MediaQuery.sizeOf(context)` report the isolated preview's dimensions instead of the simulator's screen |
| Text scale | Use the device's existing text behavior | Inject an arbitrary per-preview scale that normal text widgets consume |
| Brightness | Apply `setAppBrightness` and `App.theme` | Independently override the `MediaQuery` brightness value for a subtree |
| Insets and orientation | Read the simulator's actual metrics | Supply deterministic per-preview metrics for comparison |

Browser zoom only changes magnification. It does not test larger text and
reflow. Likewise, a native `SizedBox` establishes layout constraints but does
not replace the value returned by `MediaQuery.sizeOf`.

Localization injection and wrapper callbacks are separate work. This gap is
not evidence that DartNative cannot support localization or inherited state.

## API needed from DartNative

A public `MediaQuery(data: MediaQueryData(...), child: widget)` override, or an
equivalent supported preview-environment API, would let the host provide
metrics without modifying the application or SDK internals.

Acceptance checks for that API:

- Descendants read the supplied size, scale, brightness, direction, and insets.
- Changing the data rebuilds dependent widgets.
- Text widgets use the supplied scale in native measurement and rendering.
- Overrides stay within their subtree and do not alter the simulator's settings.
- Removing the override restores the enclosing environment.

`MediaQueryData.copyWith` would also help preserve device metrics while
changing only the properties under test.

## Previewer behavior until then

Keep browser environment controls useful, but identify overrides the native
host cannot reproduce. Do not present a native comparison as equivalent when
its text scale or reported viewport differs. Use public APIs for appearance,
wrappers, and physical component constraints. Avoid private framework imports,
simulator-wide accessibility changes, or demo-specific font rewrites as a
substitute for environment support.

## Separate native root-switching issue

On the same installed SDK, switching `Preferences → Library` in one native
process can leave the previous navigation item attached. The Library body and
Add book label render, but tapping Add book does not open the form. The
accessibility tree still identifies the root navigation group as Preferences.

The issue was reproduced with route replacement and again with a fresh keyed
root passed to the public `runApp` entry point. Restarting the native process
restores the action. This is an observed host/framework integration issue;
its SDK cause has not been established. It is separate from the missing
MediaQuery constructor.

Until resolved, use **Restart** after a fixture switch if a native navigation
bar becomes unresponsive. Source hot reload and simple component interaction
were verified separately.
