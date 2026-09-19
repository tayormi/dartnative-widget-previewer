# Shelf demo

Nineteen previews cover an isolated reading component, a small reading app, and common recovery states. All sample data is local. Each card owns its state; Reset restores its starting data.

## Watch the demo

[![Widget preview, Dart source, and native comparison](media/demo-poster.jpg)](media/demo.mp4)

[Play the demo](media/demo.mp4) · 34 seconds with narration · [Captions](media/demo.en.vtt)

## Start with one component

The first five cards render the same `EnvironmentReadingCard`: light, dark, 200% text, narrow, and Arabic. Four content-state cards use wrapper callbacks to supply a long title, no book, loading, or an unavailable shelf. Start reading in one card; the others keep independent state.

Use **Aa** to change its environment, or **Inspect widgets** to inspect bounds and open the selected widget's source. Change a label in `a_components.dart` and save: compatible local reading state is retained. Reset starts the card again.

The Arabic fixture supplies translations and right-to-left direction. Choosing another locale only changes metadata; the application must supply translations for it.

## Try the connected flow

1. In **Library**, search for an author and switch between Reading and Up next. Search for an unknown title to see the empty result and clear it.
2. Choose **Add book**. Submit the empty form to see validation, then enter a title and author. Pick a format, change the reading switch, and add a note.
3. Submit, then use Back. The new book appears in the library and its matching filter. Open its details.
4. Save it to favorites, log pages, and move the progress slider. At 400 pages, logging is disabled. Move the slider back to continue.
5. Open **Reading preferences** from the library. Change appearance, reminders, the daily goal, and the reminder schedule. Turning reminders off hides the schedule. Saving disables the button until another change.

The standalone form confirms the entry within its own card. The form opened from Library also adds that entry to the parent library. Book progress and favorites belong to the open details screen; they do not persist after leaving it. Preferences are local to their screen. This demo has no account, database, or network service.

## Coverage

| Preview | Use cases |
| --- | --- |
| Reading card variants | Reusable configuration set, inherited mock data, theme, brightness, size, text scaling, Arabic/RTL |
| Content states | Long text, empty, loading, error, deterministic recovery using the same widget |
| Library | Data-driven rows, search by title/author, segmented filters, scrolling, navigation, adding an item through a child screen |
| Library · wide | Same factory at 760 × 760; `MediaQuery` selects a two-column layout; independent state |
| Book & progress | Constructor data, favorites, slider, computed progress, clamping, disabled completion state |
| Add a book | Required fields, whitespace validation, multiline input, format selection, switch, confirmation, controller disposal |
| Preferences | Light/dark screen appearance, switches, conditional controls, discrete slider, save state |
| Empty library | Empty state and adding a sample entry |
| Loading library | Indeterminate progress and deterministic completion |
| Connection error | Error → retry → loading → content |
| Reading card · basic | Local image asset and start/pause state |
| Reading session | Counter and reset/disposal |

Loading and failure are deliberately controlled fixtures. **Finish loading** advances the state immediately so it is easy to demonstrate or test. It does not contact a server.

## Compare native rendering

Choose **Run on iOS** on any card. The same annotated factory runs through DartNative on the selected simulator. Reset remounts it; Restart launches a new native process. Browser and native state are separate. Native mode uses simulator MediaQuery values and cannot yet apply arbitrary per-preview text scaling. See [the SDK constraint](NATIVE-SDK-GAPS.md).

The wide browser fixture uses its declared 760-point width. A native full-screen fixture uses the simulator's real viewport: choose an iPad to exercise the wide branch natively. Running that fixture on an iPhone correctly selects the phone layout.

If a native navigation-bar action stops responding after changing fixtures, use **Restart**. See the [native switching issue](NATIVE-SDK-GAPS.md#separate-native-root-switching-issue).

Browser rendering remains an interpretation of the supported APIs. This demo does not establish support for arbitrary packages, storage, network calls, camera, or every DartNative widget.

## Source

- [Component environments](../examples/a_components.dart)
- [App screens and recovery fixtures](../examples/library.dart)
- [Small component fixtures](../examples/previews.dart)
- [Behavior regression tests](../test/browser-runtime.test.mjs)

`npm run demo -- /new/path` copies all three source files into a fresh DartNative app. Existing demo folders are preserved; copy the example files into their `lib/` folder to update them.
