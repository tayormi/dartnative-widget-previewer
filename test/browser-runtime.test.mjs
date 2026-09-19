import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createPreviewSession, sampleValues } from '../runtime/widget-previews.js';

const context = vm.createContext({
  console,
  location: { href: 'http://localhost/parser/worker.js' },
});
context.self = context;
vm.runInContext(
  readFileSync(new URL('../web/parser/bridge.js', import.meta.url), 'utf8'),
  context,
  { timeout: 15000 },
);
function parse(files) {
  const result = JSON.parse(context.nativeLabRequest('parse', JSON.stringify({ files })));
  if (result.error) throw new Error(result.error);
  return result.result;
}
function widgets(tree, result = []) {
  if (!tree || typeof tree !== 'object') return result;
  if (tree.widget) result.push(tree);
  for (const [key, value] of Object.entries(tree)) {
    if (['node', 'componentNode'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((node) => widgets(node, result));
    else if (value && typeof value === 'object') widgets(value, result);
  }
  return result;
}
const text = (session) =>
  widgets(session.render())
    .filter((n) => n.widget === 'Text')
    .map((n) => n.args[0]);

test('standalone parser and interpreter run real sample factories with independent state', () => {
  const source = readFileSync(new URL('../examples/previews.dart', import.meta.url), 'utf8');
  const model = parse({
    'previews.dart': source,
    'main.dart': "void main() { throw 'Production startup must not run'; }",
  });
  assert.deepEqual(model.diagnostics, []);
  const fixture = model.previews.find((p) => p.name === 'readingSessionPreview');
  assert.ok(fixture?.sampleable);
  const sessions = [0, 1].map(() =>
    createPreviewSession({ ...model, startup: null }, fixture, sampleValues(fixture), () => {}, {
      fullScreen: true,
    }),
  );
  try {
    assert.ok(text(sessions[0]).includes('0 pages read'));
    const button = widgets(sessions[0].render()).find((n) => n.widget === 'Button');
    sessions[0].action(button.props.onPressed);
    assert.ok(text(sessions[0]).includes('10 pages read'));
    assert.ok(text(sessions[1]).includes('0 pages read'));
    assert.deepEqual(sessions[0].errors, []);
  } finally {
    sessions.forEach((s) => s.dispose());
  }
});

test('compiled parser reports invalid Dart and exposes only the preview parsing operation', () => {
  assert.ok(
    parse({ 'broken.dart': 'Widget broken( =>' }).diagnostics.some((d) => d.severity === 'ERROR'),
  );
  assert.match(JSON.parse(context.nativeLabRequest('edit', '{}')).error, /parsing only/);
});

test('reading card starts and pauses a reading session, and reset creates a fresh state', () => {
  const model = parse({
    'previews.dart': readFileSync(new URL('../examples/previews.dart', import.meta.url), 'utf8'),
  });
  const fixture = model.previews.find((p) => p.name === 'readingCardPreview');
  const create = () =>
    createPreviewSession({ ...model, startup: null }, fixture, sampleValues(fixture), () => {}, {
      fullScreen: true,
    });
  const session = create();
  try {
    const button = () => widgets(session.render()).find((n) => n.widget === 'Button');
    assert.equal(button().props.title, 'Continue reading');
    session.action(button().props.onPressed);
    assert.ok(text(session).includes('NOW READING'));
    assert.equal(button().props.title, 'Pause reading');
    session.action(button().props.onPressed);
    assert.ok(text(session).includes('ON YOUR SHELF'));
    assert.equal(button().props.title, 'Continue reading');
    assert.deepEqual(session.errors, []);
  } finally {
    session.dispose();
  }
  const reset = create();
  try {
    assert.ok(text(reset).includes('ON YOUR SHELF'));
  } finally {
    reset.dispose();
  }
});

const libraryModel = parse({
  'library.dart': readFileSync(new URL('../examples/library.dart', import.meta.url), 'utf8'),
});
function demo(name, width = 390, height = 844) {
  const fixture = libraryModel.previews.find((p) => p.name === name);
  assert.ok(fixture?.sampleable, name);
  const session = createPreviewSession(
    { ...libraryModel, startup: null },
    fixture,
    sampleValues(fixture),
    () => {},
    { fullScreen: true },
  );
  session.viewport.setFixtureMetrics({ width, height, fullScreen: true });
  return session;
}
function nodes(session, kind) {
  const result = widgets(session.render()).filter((n) => n.widget === kind);
  assert.deepEqual(session.errors, []);
  return result;
}
function press(session, title) {
  const button = [...nodes(session, 'Button'), ...nodes(session, 'BarButtonItem')].find(
    (n) => n.props.title === title,
  );
  assert.ok(button?.props.onPressed, `Expected enabled ${title}`);
  session.action(button.props.onPressed);
  assert.deepEqual(session.actionErrors, []);
}
function input(session, hint, value) {
  const field = nodes(session, 'TextField').find((n) => n.props.decoration.props.hintText === hint);
  assert.ok(field, hint);
  field.props.controller.text = value;
  if (field.props.onChanged) session.action(field.props.onChanged, value);
  assert.deepEqual(session.actionErrors, []);
}

test('library search, filters, navigation and separate viewport variants run actual Dart logic', () => {
  const phone = demo('libraryPreview');
  const wide = demo('libraryPreview', 760, 760);
  try {
    assert.ok(text(phone).includes('4 BOOKS'));
    assert.equal(
      nodes(phone, 'SizedBox').some((n) => n.props.width === 250),
      false,
    );
    assert.equal(
      nodes(wide, 'SizedBox').some((n) => n.props.width === 250),
      true,
    );
    assert.deepEqual(wide.viewport.size, { width: 760, height: 760 });
    phone.action(nodes(phone, 'SegmentedControl')[0].props.onValueChanged, 1);
    assert.ok(text(phone).includes('2 BOOKS'));
    input(phone, 'Search title or author', 'rick rubin');
    assert.ok(text(phone).includes('1 BOOKS'));
    press(phone, 'Continue');
    assert.equal(phone.stack.length, 1);
    assert.ok(text(phone).includes('80 of 400 pages'));
    phone.popRoute();
    assert.ok(text(phone).includes('1 BOOKS'));
    input(phone, 'Search title or author', 'missing');
    assert.ok(text(phone).includes('No books found'));
    press(phone, 'Clear search');
    assert.ok(text(phone).includes('4 BOOKS'));
    assert.ok(text(wide).includes('4 BOOKS'));
  } finally {
    phone.dispose();
    wide.dispose();
  }
});

test('validated add-book flow updates its parent library and preserves form choices', () => {
  const session = demo('libraryPreview');
  try {
    press(session, 'Add book');
    press(session, 'Add to shelf');
    assert.ok(text(session).includes('Add a title and author to continue.'));
    input(session, 'Book title', '  Piranesi  ');
    input(session, 'Author', 'Susanna Clarke');
    input(session, 'A note for later (optional)', 'Recommended by Maya');
    session.action(nodes(session, 'SegmentedControl')[0].props.onValueChanged, 1);
    session.action(nodes(session, 'Switch')[0].props.onChanged, false);
    press(session, 'Add to shelf');
    assert.ok(text(session).includes('Piranesi'));
    assert.ok(text(session).includes('E-book'));
    assert.ok(text(session).includes('Saved for your next read.'));
    assert.ok(text(session).includes('Recommended by Maya'));
    press(session, 'View book');
    assert.equal(session.stack.length, 2);
    assert.ok(text(session).includes('Piranesi'));
    session.popRoute();
    session.popRoute();
    assert.ok(text(session).includes('5 BOOKS'));
    assert.ok(text(session).includes('Piranesi'));
    session.action(nodes(session, 'SegmentedControl')[0].props.onValueChanged, 2);
    assert.ok(text(session).includes('3 BOOKS'));
  } finally {
    session.dispose();
  }
});

test('book progress clamps at completion, disables logging and toggles favorites', () => {
  const session = demo('bookDetailsPreview');
  try {
    press(session, 'Save to favorites');
    assert.ok(nodes(session, 'Button').some((n) => n.props.title === 'Saved to favorites'));
    press(session, 'Log 20 pages');
    assert.ok(text(session).includes('100 of 400 pages'));
    assert.ok(text(session).includes('5 reading sessions'));
    session.action(nodes(session, 'Slider')[0].props.onChanged, 390);
    press(session, 'Log 20 pages');
    assert.ok(text(session).includes('400 of 400 pages'));
    assert.equal(
      nodes(session, 'Button').find((n) => n.props.title === 'Book finished').props.onPressed,
      null,
    );
    assert.equal(nodes(session, 'LinearProgressIndicator')[0].props.value, 1);
    session.action(nodes(session, 'Slider')[0].props.onChanged, 40);
    press(session, 'Log 20 pages');
    assert.ok(text(session).includes('60 of 400 pages'));
  } finally {
    session.dispose();
  }
});

test('preferences update theme, dependent controls, slider and save state', () => {
  const session = demo('preferencesPreview');
  try {
    session.action(nodes(session, 'Switch')[0].props.onChanged, true);
    assert.equal(session.render().props.brightness.symbol, 'Brightness.dark');
    session.action(nodes(session, 'Switch')[1].props.onChanged, false);
    assert.equal(nodes(session, 'SegmentedControl').length, 0);
    session.action(nodes(session, 'Slider')[0].props.onChanged, 45);
    assert.ok(text(session).includes('45 minutes'));
    press(session, 'Save preferences');
    assert.equal(
      nodes(session, 'Button').find((n) => n.props.title === 'Preferences saved').props.onPressed,
      null,
    );
    session.action(nodes(session, 'Switch')[1].props.onChanged, true);
    assert.equal(nodes(session, 'SegmentedControl').length, 1);
    press(session, 'Save preferences');
  } finally {
    session.dispose();
  }
});

test('empty, loading and failed fixtures support deterministic recovery and isolated state', () => {
  const empty = demo('emptyLibraryPreview');
  const loading = demo('loadingLibraryPreview');
  const failed = demo('failedLibraryPreview');
  try {
    press(empty, 'Add sample book');
    assert.ok(text(empty).includes('Your shelf is ready'));
    press(failed, 'Try again');
    assert.equal(nodes(failed, 'CircularProgressIndicator').length, 1);
    press(failed, 'Finish loading');
    assert.ok(text(failed).includes('Your shelf is ready'));
    assert.ok(text(loading).includes('Finding your books…'));
    press(loading, 'Finish loading');
    assert.ok(text(loading).includes('Your shelf is ready'));
  } finally {
    [empty, loading, failed].forEach((s) => s.dispose());
  }
});

test('preview metrics describe the fixture and keep component safe areas empty', () => {
  const session = demo('libraryPreview');
  try {
    session.viewport.setFixtureMetrics({ width: 320, height: 180 });
    assert.deepEqual(session.viewport.size, { width: 320, height: 180 });
    assert.deepEqual(session.viewport.padding, { top: 0, bottom: 0, left: 0, right: 0 });
    assert.equal(session.viewport.landscape, true);
    assert.throws(() => session.viewport.setFixtureMetrics({ width: 0, height: 100 }));
  } finally {
    session.dispose();
  }
});

const { createFixtureSession, stablePreviewModel, captureFixtureState, restoreFixtureState } =
  await import('../runtime/fixture-environment.js');
const componentSource = readFileSync(
  new URL('../examples/a_components.dart', import.meta.url),
  'utf8',
);
const componentModel = stablePreviewModel(parse({ 'a_components.dart': componentSource }));
const componentFixture = {
  id: 'component',
  file: 'lib/a_components.dart',
  symbol: 'readingComponentPreview',
  width: 360,
  height: 300,
  fullScreen: false,
  brightness: 'light',
  textScaleFactor: 1,
  wrapper: { symbol: 'sampleBook' },
  theme: { symbol: 'readingTheme' },
};
test('component environment injects data, theme, locale, direction and font metrics independently', () => {
  const light = createFixtureSession(componentModel, componentFixture, {}, () => {});
  const dark = createFixtureSession(
    componentModel,
    componentFixture,
    { brightness: 'dark', textScaleFactor: 2, width: 260 },
    () => {},
  );
  const arabic = createFixtureSession(
    componentModel,
    { ...componentFixture, localizations: { symbol: 'arabicPreview' } },
    {},
    () => {},
  );
  try {
    assert.ok(text(light).includes('The Creative Act'), JSON.stringify(light.errors));
    assert.deepEqual(light.errors, []);
    assert.ok(text(arabic).includes('الفعل الإبداعي'), JSON.stringify(arabic.errors));
    assert.equal(arabic.previewEnvironment.textDirection, 'rtl');
    assert.equal(dark.previewEnvironment.textScaleFactor, 2);
    assert.equal(dark.viewport.size.width, 260);
    const surface = nodes(dark, 'Container')[0].props.color.args[0];
    assert.equal(surface, 0xff202622);
    press(light, 'Start reading');
    assert.ok(nodes(light, 'Button').some((n) => n.props.title === 'Pause reading'));
    assert.ok(nodes(dark, 'Button').some((n) => n.props.title === 'Start reading'));
  } finally {
    [light, dark, arabic].forEach((s) => s.dispose());
  }
});
test('compatible local state survives text edits and environment changes; reset remains fresh', () => {
  const first = createFixtureSession(componentModel, componentFixture, {}, () => {});
  let next;
  try {
    text(first);
    press(first, 'Start reading');
    const saved = captureFixtureState(first);
    assert.ok(saved);
    const changed = stablePreviewModel(
      parse({ 'a_components.dart': componentSource.replace('ON YOUR SHELF', 'YOUR BOOK') }),
    );
    next = createFixtureSession(changed, componentFixture, { brightness: 'dark' }, () => {});
    text(next);
    assert.equal(restoreFixtureState(next, saved), true);
    assert.ok(text(next).includes('YOUR BOOK'));
    assert.ok(nodes(next, 'Button').some((n) => n.props.title === 'Pause reading'));
  } finally {
    first.dispose();
    next?.dispose();
  }
});
test('fixture environment rejects invalid controls and runs loading/error wrappers', () => {
  assert.throws(
    () => createFixtureSession(componentModel, componentFixture, { width: 0 }, () => {}),
    /Dimensions/,
  );
  assert.throws(
    () => createFixtureSession(componentModel, componentFixture, { textScaleFactor: 5 }, () => {}),
    /scale/,
  );
  for (const [wrapper, title] of [
    ['emptyBook', 'Add sample book'],
    ['loadingBook', 'Finish loading'],
    ['unavailableBook', 'Try again'],
  ]) {
    const session = createFixtureSession(
      componentModel,
      { ...componentFixture, wrapper: { symbol: wrapper } },
      {},
      () => {},
    );
    try {
      press(session, title);
      assert.ok(text(session).includes('The Creative Act'));
    } finally {
      session.dispose();
    }
  }
});
