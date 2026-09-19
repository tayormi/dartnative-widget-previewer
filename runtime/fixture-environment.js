import { Runtime } from './runtime.js';
import { fixtureEnvironment } from './fixture-settings.js';
export { fixtureEnvironment } from './fixture-settings.js';

const literal = (value) => ({ kind: 'literal', value });
const call = (name, args = [], named = {}) => ({ kind: 'call', name, args, named });
const symbol = (name) => ({ symbol: name });
// Stable call sites preserve compatible component state across text/style edits.
export function stablePreviewModel(model) {
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v, i) => walk(v, `${path}/${i}`));
    return Object.fromEntries([
      ...Object.entries(value).map(([key, v]) => [key, walk(v, `${path}/${key}`)]),
      ...(value.kind === 'call' ? [['previewSite', path]] : []),
    ]);
  };
  return walk(model, 'fixture');
}
function factoryExpression(model, fixture) {
  const [owner] = fixture.symbol.split('.');
  const declaration = model.functions[owner] || model.classes[owner];
  if (!declaration)
    throw Error(
      `Browser source for ${fixture.symbol} is unavailable. Use the iOS preview for external packages.`,
    );
  return {
    ...call(fixture.symbol),
    file: fixture.file.replace(/^lib\//, ''),
    start: declaration.start || 0,
    previewSite: fixture.id,
  };
}
export function createFixtureSession(model, fixture, overrides, onChange) {
  const env = fixtureEnvironment(fixture, overrides);
  const runtime = new Runtime(
    { ...model, startup: null, root: factoryExpression(model, fixture) },
    onChange,
  );
  try {
    runtime.viewport.setFixtureMetrics({ ...env, fullScreen: fixture.fullScreen });
    runtime.brightness = symbol(`Brightness.${env.brightness}`);
    runtime.previewEnvironment = env;
    let child = runtime.model.root;
    if (fixture.wrapper) child = call(fixture.wrapper.symbol, [child]);
    if (fixture.localizations) {
      const config = runtime.eval(call(fixture.localizations.symbol), runtime.global);
      if (config?.valueType !== 'DNPreviewLocalizations')
        throw Error('localizations must return DNPreviewLocalizations.');
      env.locale ??= config.props.locale;
      env.textDirection ??= config.props.textDirection?.symbol?.split('.').at(-1) || 'ltr';
      if (config.props.wrapper) {
        runtime.global.values.dnPreviewLocaleWrapper = config.props.wrapper;
        child = call('dnPreviewLocaleWrapper', [child]);
      }
    }
    env.locale ??= 'en';
    env.textDirection ??= /^(ar|fa|he|ur)(-|_|$)/.test(env.locale) ? 'rtl' : 'ltr';
    fixtureEnvironment(fixture, env);
    child = call('DNPreviewScope', [], {
      locale: literal(env.locale),
      textScaleFactor: literal(env.textScaleFactor),
      child,
    });
    child = call('Directionality', [], {
      textDirection: {
        kind: 'get',
        target: { kind: 'ref', name: 'TextDirection' },
        name: env.textDirection,
      },
      child,
    });
    if (fixture.theme) child = call('App', [], { theme: call(fixture.theme.symbol), home: child });
    runtime.model = { ...runtime.model, root: child };
    return runtime;
  } catch (error) {
    runtime.dispose();
    throw error;
  }
}
export function captureFixtureState(runtime) {
  if (
    runtime.stack.length ||
    runtime.overlays.length ||
    runtime.pending.size ||
    runtime.cleanups.size
  )
    return null;
  const snapshot = new Map();
  for (const [key, state] of runtime.instances) {
    if (!state.stateful) continue;
    const fields = {};
    for (const field of state.object.fields) {
      if (field === 'widget' || field === 'key') continue;
      let value;
      try {
        value = state.scope.get(field);
      } catch {
        return null;
      }
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) return null;
      fields[field] = value;
    }
    snapshot.set(key, { name: state.object.name, fields });
  }
  return snapshot;
}
export function restoreFixtureState(runtime, snapshot) {
  if (!snapshot) return false;
  for (const [key, saved] of snapshot) {
    const state = runtime.instances.get(key);
    if (
      !state ||
      state.object.name !== saved.name ||
      JSON.stringify(
        [...state.object.fields].filter((k) => !['widget', 'key'].includes(k)).sort(),
      ) !== JSON.stringify(Object.keys(saved.fields).sort())
    )
      return false;
  }
  for (const [key, saved] of snapshot) {
    const state = runtime.instances.get(key);
    Object.assign(state.scope.values, saved.fields);
    state.dirty = true;
  }
  return snapshot.size > 0;
}
