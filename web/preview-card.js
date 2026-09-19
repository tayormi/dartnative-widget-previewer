import { mountBrowserPreview } from '/vendor/browser-runtime.js';

export function createPreviewCard(
  fixture,
  { getProject, onSelect, onSource, onNative, saveEnvironment },
) {
  const card = document.getElementById('preview-card').content.firstElementChild.cloneNode(true);
  const name = card.querySelector('.card-title');
  const link = card.querySelector('.source-link');
  const controls = card.querySelector('.card-tools');
  const settings = card.querySelector('.environment-settings');
  const slot = card.querySelector('.preview-slot');
  const size = card.querySelector('.preview-size');
  const host = card.querySelector('.browser-host');
  const meta = card.querySelector('.card-meta');
  const fault = card.querySelector('.card-fault');
  const inspector = card.querySelector('.widget-inspector');
  const updateNote = card.querySelector('.update-note');

  function updateTitle() {
    name.textContent = fixture.name;
    card.setAttribute('aria-label', fixture.name + ' preview');
    link.title = `View ${fixture.file}:${fixture.line}`;
    link.setAttribute('aria-label', `View source for ${fixture.name}`);
  }
  updateTitle();
  link.onclick = () => onSource(fixture);
  let zoom = null,
    runtime,
    inspecting = false,
    appliedModel,
    settingsKey = '',
    metadataKey = '',
    overrides = {},
    configurationVersion = 0,
    configuring = false,
    disposed = false,
    configurationQueue = Promise.resolve();
  const inputTimers = new Map();
  let width = fixture.width,
    height = fixture.height;
  function inspect(info) {
    inspector.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = info.type;
    const geometry = document.createElement('span');
    geometry.textContent = `${info.width} × ${info.height} pt · ${info.layout}`;
    const details = document.createElement('p');
    details.textContent = info.constraints
      ? `Constraints: ${info.constraints}`
      : `Preview bounds: ${width} × ${height} pt`;
    const tree = document.createElement('div');
    tree.className = 'widget-path';
    for (const item of [...info.ancestors, { type: info.type }, ...info.children]) {
      const b = document.createElement('button');
      b.textContent = item.type;
      b.disabled = !item.select;
      b.onclick = item.select;
      tree.append(b);
    }
    inspector.append(title, geometry, details, tree);
    if (info.file && Number.isInteger(info.offset)) {
      const content = getProject().sources[info.file];
      if (typeof content === 'string') {
        const line = content.slice(0, info.offset).split('\n').length;
        const button = document.createElement('button');
        button.className = 'inspect-source';
        button.textContent = `${info.file}:${line}`;
        button.onclick = () => onSource({ ...fixture, file: 'lib/' + info.file, line });
        inspector.append(button);
      }
    }
  }
  function layout() {
    if (!slot.clientWidth) return zoom ?? 1;
    const ratio = zoom ?? Math.min(1, Math.max(0.15, (slot.clientWidth - 24) / width));
    Object.assign(host.style, {
      width: width + 'px',
      height: height + 'px',
      transform: `scale(${ratio})`,
    });
    Object.assign(size.style, { width: width * ratio + 'px', height: height * ratio + 'px' });
    controls.querySelector('.zoom-level').textContent = `${Math.round(ratio * 100)}%`;
    controls.querySelector('.zoom-in').disabled = ratio >= 2;
    controls.querySelector('.zoom-out').disabled = ratio <= 0.15;
    return ratio;
  }
  function reset(preserve = false) {
    const { model } = getProject();
    const snapshot = preserve ? runtime?.snapshot() : null;
    runtime?.dispose();
    runtime = null;
    fault.textContent = '';
    updateNote.textContent = '';
    try {
      runtime = mountBrowserPreview(host, model, fixture, (text) => (fault.textContent = text), {
        overrides,
        snapshot,
        onInspect: inspect,
      });
      if (preserve)
        updateNote.textContent = runtime.retained
          ? 'Updated · state retained'
          : 'Updated · state reset';
      const env = runtime.environment;
      width = env.width;
      height = env.height;
      settings.querySelector('.width').value = width;
      settings.querySelector('.height').value = height;
      const scales = settings.querySelector('.scale');
      if (![...scales.options].some((o) => Number(o.value) === env.textScaleFactor)) {
        const option = document.createElement('option');
        option.value = env.textScaleFactor;
        option.textContent = Math.round(env.textScaleFactor * 100) + '%';
        scales.append(option);
      }
      scales.value = env.textScaleFactor;
      settings.querySelector('.locale').value = overrides.locale || '';
      settings.querySelector('.locale').placeholder = env.locale;
      settings.querySelector('.direction').value = overrides.textDirection || '';
      const brightnessLabel =
        env.brightness === 'dark' ? 'Switch widget to light' : 'Switch widget to dark';
      controls.querySelector('.brightness').setAttribute('aria-label', brightnessLabel);
      controls.querySelector('.brightness').title = brightnessLabel;
      controls
        .querySelector('.brightness')
        .setAttribute('aria-pressed', String(env.brightness === 'dark'));
      meta.textContent = `${width} × ${height} · ${env.brightness} · ${Math.round(env.textScaleFactor * 100)}% text · ${env.locale}${env.textDirection === 'rtl' ? ' · RTL' : ''}`;
      layout();
      if (inspecting) runtime.inspect(true);
    } catch (error) {
      fault.textContent = error.message;
    }
    appliedModel = model;
    settingsKey = JSON.stringify(overrides);
    metadataKey = JSON.stringify(fixture);
  }
  async function configure(next) {
    if (disposed || JSON.stringify(next) === JSON.stringify(overrides)) return;
    const version = ++configurationVersion;
    overrides = next;
    configuring = true;
    try {
      configurationQueue = configurationQueue
        .catch(() => {})
        .then(() => saveEnvironment(fixture.id, next));
      await configurationQueue;
      if (disposed || version !== configurationVersion) return;
      getProject().environments[fixture.id] = next;
      reset(true);
    } catch (error) {
      fault.textContent = error.message;
    } finally {
      if (version === configurationVersion) configuring = false;
    }
  }
  settings.querySelector('.width').onchange = (e) =>
    configure({ ...overrides, width: Number(e.target.value) });
  settings.querySelector('.height').onchange = (e) =>
    configure({ ...overrides, height: Number(e.target.value) });
  settings.querySelector('.scale').onchange = (e) =>
    configure({ ...overrides, textScaleFactor: Number(e.target.value) });
  settings.querySelector('.locale').onchange = (e) =>
    configure({ ...overrides, locale: e.target.value.trim() || null });
  settings.querySelector('.direction').onchange = (e) =>
    configure({ ...overrides, textDirection: e.target.value || null });
  for (const input of settings.querySelectorAll('input')) {
    const commit = input.onchange;
    input.oninput = (event) => {
      clearTimeout(inputTimers.get(input));
      const value = event.target.value;
      inputTimers.set(
        input,
        setTimeout(() => commit({ target: { value } }), 200),
      );
    };
    input.onchange = (event) => {
      clearTimeout(inputTimers.get(input));
      commit(event);
    };
  }
  settings.querySelector('.defaults').onclick = () => configure({});
  controls.querySelector('.brightness').onclick = () =>
    configure({
      ...overrides,
      brightness: runtime?.environment.brightness === 'dark' ? 'light' : 'dark',
    });
  controls.querySelector('.settings').onclick = () => {
    settings.hidden = !settings.hidden;
    controls.querySelector('.settings').setAttribute('aria-expanded', String(!settings.hidden));
  };
  controls.querySelector('.inspect').onclick = () => {
    inspecting = !inspecting;
    inspector.hidden = !inspecting;
    controls.querySelector('.inspect').setAttribute('aria-pressed', String(inspecting));
    runtime?.inspect(inspecting);
  };
  controls.querySelector('.zoom-in').onclick = () => {
    zoom = Math.min(2, layout() + 0.1);
    layout();
  };
  controls.querySelector('.zoom-out').onclick = () => {
    zoom = Math.max(0.15, layout() - 0.1);
    layout();
  };
  controls.querySelector('.fit').onclick = () => {
    zoom = null;
    layout();
  };
  controls.querySelector('.reset').onclick = () => reset(false);
  controls.querySelector('.native-button').onclick = () => onNative(fixture.id);
  card.addEventListener('pointerdown', () => onSelect(fixture.id));
  card.addEventListener('focusin', () => onSelect(fixture.id));
  const resize = new ResizeObserver(layout);
  resize.observe(slot);
  return {
    card,
    get fixture() {
      return fixture;
    },
    reset: () => reset(false),
    mount() {
      overrides = getProject().environments?.[fixture.id] || {};
      layout();
      reset();
    },
    update(next, forceReset) {
      fixture = next;
      updateTitle();
      if (configuring) return;
      overrides = getProject().environments?.[fixture.id] || {};
      if (
        appliedModel !== getProject().model ||
        settingsKey !== JSON.stringify(overrides) ||
        metadataKey !== JSON.stringify(fixture) ||
        forceReset
      )
        reset(!forceReset);
    },
    dispose() {
      disposed = true;
      for (const timer of inputTimers.values()) clearTimeout(timer);
      resize.disconnect();
      runtime?.dispose();
      card.remove();
    },
  };
}
