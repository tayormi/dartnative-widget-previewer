import { parseSources } from '/vendor/browser-runtime.js';
import { request } from './api.js';
import { createPreviewCard } from './preview-card.js';
const $ = (id) => document.getElementById(id);
const bridge = new URLSearchParams(location.search).get('bridge');
if (bridge) {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.classList.add('embedded');
}
$('follow-control').hidden = !bridge;
$('theme').hidden = !!bridge;
let state,
  model,
  sources = {},
  revision = -1,
  attemptedRevision = -1;
let currentFile = '',
  pending = false,
  connected = false,
  rendering = false;
let catalogKey = '',
  selectedId,
  resetRevision = 0,
  actionError = '',
  parseError = '';
let deviceRequest = 0,
  lastBrowserRevision = 0;
const cards = new Map();
const labels = {
  'compile-error': 'Source error',
  'restart-required': 'Restart required',
  'stream-stopped': 'Stream stopped',
  starting: 'Starting iOS…',
  building: 'Building…',
  analyzing: 'Analyzing…',
  reloading: 'Reloading…',
  ready: 'Ready',
  error: 'Needs attention',
  stopped: 'Stopped',
};
function notice(text) {
  $('notice').hidden = !text;
  $('notice').textContent = text;
}
function showConsole(open) {
  $('diagnostics').hidden = !open;
  $('diagnostics').open = open;
  $('console-toggle').setAttribute('aria-expanded', String(open));
  const label = open ? 'Hide console' : 'Show console';
  $('console-toggle').setAttribute('aria-label', label);
  $('console-toggle').title = label;
}
function message(data) {
  if (bridge) parent.postMessage({ ...data, bridge }, '*');
}
function source(fixture) {
  if (bridge)
    return message({
      type: 'dnPreview.openSource',
      id: fixture.id,
      file: fixture.file,
      line: fixture.line,
    });
  const text = sources[fixture.file.replace(/^lib\//, '')];
  if (typeof text !== 'string') {
    actionError = 'Source is unavailable. Reload previews to try again.';
    paint();
    return;
  }
  $('source-title').textContent = `${fixture.file}:${fixture.line}`;
  const lines = text.split('\n').map((text, index) => {
    const line = document.createElement('span');
    line.className = 'source-line';
    line.dataset.line = index + 1;
    line.classList.toggle('current', index + 1 === fixture.line);
    line.textContent = text || ' ';
    return line;
  });
  $('source-code').replaceChildren(...lines);
  $('source-dialog').showModal();
  lines[Math.max(0, fixture.line - 1)]?.scrollIntoView({ block: 'center' });
}
function selectCard(id) {
  if (!connected || pending || state.busy || state.selected === id) return;
  state.selected = id;
  // Scrolling on pointerdown would move the button before its click arrives.
  selectedId = id;
  catalog();
  request('/api/action', { action: 'select', id }).catch((error) => {
    actionError = error.message;
    paint();
  });
}
function catalog() {
  if (!model || !state) return;
  const key = JSON.stringify([revision, state.browserRevision || 0, state.previews]);
  if (key !== catalogKey) {
    catalogKey = key;
    const previousCards = new Map(cards),
      scrollTop = $('gallery').scrollTop;
    const opened = new Map(
      [...$('gallery').querySelectorAll('.preview-group')].map((g) => [
        g.querySelector('summary').textContent,
        g.dataset.openBeforeSearch == null ? g.open : g.dataset.openBeforeSearch === 'true',
      ]),
    );
    cards.clear();
    $('gallery').replaceChildren();
    const groups = new Map();
    for (const fixture of state.previews) {
      const name = fixture.group || 'Previews';
      if (!groups.has(name)) {
        const group = document.createElement('details');
        group.className = 'preview-group';
        group.open =
          opened.get(name) ?? !['Screens', 'Layouts', 'States', 'Components'].includes(name);
        const title = document.createElement('summary');
        title.textContent = name;
        const body = document.createElement('div');
        body.className = 'group-cards';
        group.append(title, body);
        $('gallery').append(group);
        groups.set(name, { group, body });
      }
      const existing = previousCards.get(fixture.id);
      const view =
        existing ||
        createPreviewCard(fixture, {
          getProject: () => ({ model, sources, environments: state.environments }),
          onSelect: selectCard,
          onSource: source,
          onNative: (id) =>
            bridge ? message({ type: 'dnPreview.runNative', id }) : chooseDevice(id),
          saveEnvironment: (id, environment) =>
            request('/api/action', { action: 'environment', id, environment }),
        });
      groups.get(name).body.append(view.card);
      cards.set(fixture.id, view);
      if (existing) {
        view.update(fixture, state.browserRevision !== lastBrowserRevision);
        previousCards.delete(fixture.id);
      } else view.mount();
    }
    for (const view of previousCards.values()) view.dispose();
    lastBrowserRevision = state.browserRevision;
    $('gallery').scrollTop = scrollTop;
  }
  const query = $('search').value.trim().toLowerCase();
  let count = 0;
  for (const view of cards.values()) {
    view.update(view.fixture, false);
    const f = view.fixture;
    view.card.hidden =
      !(
        query === '' ||
        ($('filter-kind').value === 'all'
          ? `${f.name} ${f.group} ${f.file} ${f.uri.split('/')[0]}`
          : String(f[$('filter-kind').value] || '')
        )
          .toLowerCase()
          .includes(query)
      ) || !!(bridge && $('follow-file').checked && currentFile && f.file !== currentFile);
    if (!view.card.hidden) count++;
    view.card.classList.toggle('selected', f.id === state.selected);
  }
  for (const group of $('gallery').querySelectorAll('.preview-group')) {
    group.hidden = ![...group.querySelectorAll('.preview-card')].some((card) => !card.hidden);
    if (query) {
      group.dataset.openBeforeSearch ??= String(group.open);
      if (!group.hidden) group.open = true;
    } else if (group.dataset.openBeforeSearch != null) {
      group.open = group.dataset.openBeforeSearch === 'true';
      delete group.dataset.openBeforeSearch;
    }
  }
  $('count').textContent = count;
  const native = state.mode === 'native';
  $('gallery').hidden = native || count === 0;
  $('empty').hidden = native || count > 0;
  $('empty-title').textContent = state.previews.length ? 'No matching previews' : 'No previews yet';
  $('empty-description').textContent = state.previews.length
    ? 'Try another search or show all files.'
    : 'Add a @DNPreview factory to a Dart file in lib/.';
  $('clear-search').hidden = !state.previews.length;
  if (selectedId !== undefined && selectedId !== state.selected && !native) {
    const selected = cards.get(state.selected)?.card;
    if (selected && !selected.hidden) {
      selected.closest('details').open = true;
      selected.scrollIntoView({ block: 'nearest' });
    }
  }
  selectedId = state.selected;
  const nextReset = state.browserReset?.revision || 0;
  if (nextReset !== resetRevision) {
    resetRevision = nextReset;
    cards.get(state.browserReset?.id)?.reset();
  }
}
async function parse() {
  if (!state || attemptedRevision === state.sourceRevision) return;
  attemptedRevision = state.sourceRevision;
  try {
    const project = await request('/api/project');
    sources = project.files;
    const next = await parseSources(project.files);
    model = next;
    revision = project.revision;
    parseError = '';
  } catch (error) {
    parseError = `Browser preview: ${error.message}\nShowing the last working preview.`;
  }
}
function paint() {
  const native = state?.mode === 'native';
  const busy = pending || state?.busy || !connected;
  $('project').textContent = state?.project || '';
  $('status').textContent = connected ? labels[state.status] || state.status : 'Disconnected';
  $('status').title = $('status').textContent;
  $('native-panel').hidden = !native;
  $('browser-toolbar').hidden = native;
  $('view-controls').hidden = native;
  $('follow-control').hidden = !bridge || native;
  $('renderer-label').textContent = native ? 'iOS' : 'Browser';
  $('renderer-label').title = native
    ? 'Actual DartNative rendering on an iOS simulator.'
    : 'Interpreted browser preview. Run on iOS to check native rendering.';
  $('stop-background').hidden = native || !state?.native;
  const selected = state?.previews.find((p) => p.id === state.selected);
  $('native-name').textContent = selected?.name || '';
  const nativeEnv = { ...selected, ...state?.environments?.[state?.selected] };
  $('native-limits').textContent =
    `Native uses simulator MediaQuery metrics.${nativeEnv.textScaleFactor !== 1 ? ' Requested ' + nativeEnv.textScaleFactor + '× text; native uses the device text size.' : ''}`;
  const live = native && !!state?.native;
  if (live && !$('simulator').getAttribute('src')) $('simulator').src = '/sim';
  if (!native || !state?.native) $('simulator').removeAttribute('src');
  $('simulator').hidden = !live;
  $('native-placeholder').hidden = live;
  $('native-progress').textContent = connected
    ? labels[state.status] || 'Starting iOS…'
    : 'Previewer disconnected';

  $('native-input').disabled = !live || busy || state?.status !== 'ready';
  $('errors').textContent =
    state?.diagnostics.map((d) => `${d.file}:${d.line}  ${d.message}`).join('\n') || '';
  const count = state?.diagnostics.length || 0;
  $('diagnostic-count').textContent = count ? `(${count})` : '';
  $('console-count').textContent = count ? ` · ${count}` : '';
  $('logs').textContent =
    state?.logs
      .slice(-15)
      .map((l) => l.text)
      .join('\n') || '';
  let problem = '';
  if (!connected) problem = 'Previewer disconnected. Start the local controller to reconnect.';
  else if (state.status === 'compile-error')
    problem = 'Fix the source errors to update this preview. See Console for details.';
  else if (state.status === 'restart-required')
    problem = 'Dependencies changed. Restart the iOS app to apply them.';
  else if (['error', 'stopped', 'stream-stopped'].includes(state.status))
    problem = state.logs.at(-1)?.text || 'The iOS preview stopped. Restart to try again.';
  notice(actionError || parseError || problem);
  $('back-browser').disabled = busy;
  for (const button of document.querySelectorAll('[data-action], .native-button')) {
    button.disabled = busy || (button.dataset.action === 'reset' && !state?.native);
  }
  catalog();
}
async function render() {
  if (rendering) return;
  rendering = true;
  try {
    state = await request('/api/state');
    connected = true;
    await parse();
  } catch {
    connected = false;
  } finally {
    rendering = false;
    paint();
  }
}
async function chooseDevice(id) {
  if (!connected || pending || state.busy) return;
  if (state.native) return action('native', id, state.device);
  const token = ++deviceRequest;
  const dialog = $('device-dialog'),
    select = $('device-select'),
    run = $('device-run');
  select.replaceChildren();
  select.disabled = true;
  run.disabled = true;
  $('device-error').textContent = 'Finding simulators…';
  dialog.showModal();
  try {
    const devices = await request('/api/devices');
    if (token !== deviceRequest || !dialog.open) return;
    if (!devices.length) throw new Error('No iOS simulators found. Add one in Xcode.');
    for (const device of devices) {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = `${device.name} · ${device.runtime}${device.state === 'Booted' ? ' · Running' : ''}`;
      select.append(option);
    }
    const preferred =
      devices.find((d) => d.id === state.device) || devices.find((d) => d.state === 'Booted');
    if (preferred) select.value = preferred.id;
    $('device-error').textContent = '';
    select.disabled = false;
    run.disabled = false;
    run.onclick = () => {
      dialog.close();
      action('native', id, select.value);
    };
  } catch (error) {
    if (token === deviceRequest && dialog.open) $('device-error').textContent = error.message;
  }
}
async function action(action, id, device) {
  if (pending || !connected) return;
  pending = true;
  actionError = '';
  paint();
  try {
    await request('/api/action', { action, id, device });
    if (action === 'reload') attemptedRevision = -1;
    if (action === 'native-stop') $('input-status').textContent = '';
  } catch (error) {
    actionError = error.message;
  } finally {
    pending = false;
    await render();
  }
}
$('source-dialog').addEventListener('close', () => $('source-code').replaceChildren());
$('search').oninput = catalog;
$('filter-kind').onchange = catalog;
$('follow-file').onchange = catalog;
$('clear-search').onclick = () => {
  $('search').value = '';
  $('follow-file').checked = false;
  catalog();
  $('search').focus();
};
$('back-browser').onclick = () => action('browser');
for (const [id, list] of [
  ['grid-view', false],
  ['list-view', true],
]) {
  $(id).onclick = () => {
    $('gallery').classList.toggle('list', list);
    $('grid-view').setAttribute('aria-pressed', String(!list));
    $('list-view').setAttribute('aria-pressed', String(list));
  };
}
$('console-toggle').onclick = () => showConsole($('diagnostics').hidden);
$('diagnostics').ontoggle = () => {
  if (!$('diagnostics').open) showConsole(false);
};
$('theme').onclick = () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const label = dark ? 'Switch to light appearance' : 'Switch to dark appearance';
  $('theme').title = label;
  $('theme').setAttribute('aria-label', label);
};
window.addEventListener('message', (event) => {
  if (
    bridge &&
    event.source === parent &&
    event.data?.bridge === bridge &&
    event.data.type === 'dnPreview.filter'
  ) {
    currentFile = event.data.file || '';
    if (event.data.theme) document.documentElement.dataset.theme = event.data.theme;
    catalog();
  }
});
document
  .querySelectorAll('[data-action]')
  .forEach((button) => (button.onclick = () => action(button.dataset.action)));
let inputQueue = Promise.resolve();
function sendInput(input) {
  const previewId = state?.selected;
  $('input-status').textContent = 'Sending to iOS…';
  inputQueue = inputQueue
    .then(async () => {
      await request('/api/input', { ...input, previewId });
      $('input-status').textContent = 'Sent to the focused iOS field';
    })
    .catch((error) => {
      $('input-status').textContent = error.message;
    });
}
const input = $('native-input');
input.addEventListener('input', (event) => {
  if (event.isComposing) return;
  const text = input.value;
  input.value = '';
  if (text) sendInput({ kind: 'text', text });
});
input.addEventListener('compositionend', () => {
  const text = input.value;
  input.value = '';
  if (text) sendInput({ kind: 'text', text });
});
input.addEventListener('keydown', (event) => {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
  if (
    [
      'Backspace',
      'Delete',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ].includes(event.key)
  ) {
    event.preventDefault();
    sendInput({ kind: 'key', key: event.key, shift: event.shiftKey });
  }
});
await render();
setInterval(render, 700);
