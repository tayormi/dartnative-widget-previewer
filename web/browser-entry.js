import { parserRequest } from '../runtime/parser-client.js';
import { renderTree } from '../runtime/render.js';
import { PreviewDOM } from '../runtime/preview-dom.js';
import {
  stablePreviewModel,
  createFixtureSession,
  captureFixtureState,
  restoreFixtureState,
} from '../runtime/fixture-environment.js';
import baseCSS from '../runtime/style.css?inline';
import nativeCSS from '../runtime/native-preview.css?inline';
import frameCSS from '../runtime/device-frame.css?inline';

export async function parseSources(files) {
  const model = await parserRequest('parse', { files });
  const errors = model.diagnostics.filter((d) => d.severity === 'ERROR');
  if (errors.length) throw new Error(errors.map((d) => `${d.file}: ${d.message}`).join('\n'));
  return stablePreviewModel(model);
}
export function mountBrowserPreview(host, model, fixture, onFault, options = {}) {
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  shadow.replaceChildren();
  const style = document.createElement('style');
  style.textContent =
    baseCSS +
    nativeCSS +
    frameCSS +
    `
    :host{display:block}.phone[data-platform]{position:relative;inset:auto;width:100%;height:100%;padding:0;border:0;border-radius:0;box-shadow:none;transform:none;background:var(--native-background,#fff)}
    .phone .device-screen{height:100%;border-radius:0;box-shadow:none}#preview{width:100%;height:100%;min-height:0}*{box-sizing:border-box}
    [data-inspecting=true] [data-widget]{cursor:crosshair!important}.inspected-widget{outline:2px solid #2684ff!important;outline-offset:-2px}
  `;
  const frame = document.createElement('div');
  frame.className = 'phone';
  frame.dataset.platform = 'ios';
  frame.innerHTML = '<div class="device-screen"><div id="preview"></div></div>';
  frame.style.setProperty('--preview-safe-top', fixture.fullScreen ? '62px' : '0px');
  frame.style.setProperty('--preview-safe-bottom', fixture.fullScreen ? '34px' : '0px');
  shadow.append(style, frame);
  const target = frame.querySelector('#preview'),
    dom = new PreviewDOM();
  let runtime,
    disposed = false,
    inspecting = false,
    selectedElement;
  function inspect(el) {
    if (!el) return;
    selectedElement?.classList.remove('inspected-widget');
    selectedElement = el;
    el.classList.add('inspected-widget');
    const rect = el.getBoundingClientRect();
    const ratio = host.getBoundingClientRect().width / Number.parseFloat(host.style.width);
    const definition = el.dataset.definition || el.dataset.source;
    const split = definition?.lastIndexOf(':') ?? -1;
    const css = getComputedStyle(el);
    options.onInspect?.({
      type: el.dataset.widget,
      width: Math.round((rect.width / ratio) * 10) / 10,
      height: Math.round((rect.height / ratio) * 10) / 10,
      file: split < 0 ? null : definition.slice(0, split),
      offset: split < 0 ? null : Number(definition.slice(split + 1)),
      layout: css.display,
      constraints: el.dataset.constraints || null,
      fontSize: css.fontSize,
      ancestors: [
        ...(function* () {
          for (let p = el.parentElement; p && p !== target; p = p.parentElement)
            if (p.dataset.widget) yield p;
        })(),
      ]
        .reverse()
        .map((p) => ({ type: p.dataset.widget, select: () => inspect(p) })),
      children: [...el.querySelectorAll('[data-widget]')]
        .filter((e) => e.parentElement?.closest('[data-widget]') === el)
        .slice(0, 50)
        .map((p) => ({ type: p.dataset.widget, select: () => inspect(p) })),
    });
  }
  frame.addEventListener(
    'click',
    (event) => {
      if (!inspecting) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      inspect(event.target.closest('[data-widget]'));
    },
    true,
  );
  frame.addEventListener(
    'pointerdown',
    (event) => {
      if (inspecting) event.preventDefault();
    },
    true,
  );
  const render = () => {
    if (disposed || !runtime) return;
    const errors = [];
    try {
      const env = runtime.previewEnvironment;
      frame.dir = env.textDirection;
      frame.lang = env.locale;
      frame.style.colorScheme = env.brightness;
      frame.style.setProperty('--native-background', env.brightness === 'dark' ? '#000' : '#fff');
      frame.style.setProperty(
        '--native-secondary',
        env.brightness === 'dark' ? '#aeaeb2' : '#636366',
      );
      dom.replace(target, runtime, runtime.stack.at(-1) ?? 'entry', () =>
        renderTree(runtime.render(), {
          runtime,
          mode: inspecting ? 'design' : 'interact',
          platform: 'ios',
          device: frame,
          onSelect: () => {},
          resolveAsset: (asset) => '/api/asset?path=' + encodeURIComponent(asset),
          onFault: (error) => errors.push(error),
        }),
      );
      // Scale font metrics, not the surface. Read before writing so inherited
      // fonts are multiplied exactly once and text reflows at the same width.
      if (env.textScaleFactor !== 1) {
        const metrics = [...target.querySelectorAll('*')]
          .filter((el) => el instanceof HTMLElement && el.tagName !== 'STYLE')
          .map((el) => {
            const css = getComputedStyle(el);
            return [el, parseFloat(css.fontSize), parseFloat(css.lineHeight)];
          });
        for (const [el, font, line] of metrics) {
          if (font) el.style.fontSize = font * env.textScaleFactor + 'px';
          if (Number.isFinite(line)) el.style.lineHeight = line * env.textScaleFactor + 'px';
        }
      }
      if (inspecting) {
        for (const el of target.querySelectorAll('input,textarea,select,button')) el.tabIndex = -1;
        inspect(target.querySelector('[data-widget]:not([style*="display: contents"])'));
      }
      errors.push(...runtime.errors, ...runtime.actionErrors.map((e) => e.message || String(e)));
    } catch (error) {
      errors.push(error.message);
    }
    onFault([...new Set(errors)].join('\n'));
  };
  try {
    runtime = createFixtureSession(model, fixture, options.overrides, render);
  } catch (error) {
    shadow.replaceChildren();
    throw error;
  }
  render();
  const retained = restoreFixtureState(runtime, options.snapshot);
  if (retained) render();
  return {
    retained,
    environment: runtime.previewEnvironment,
    snapshot: () => captureFixtureState(runtime),
    inspect(value) {
      inspecting = value;
      frame.dataset.inspecting = String(value);
      selectedElement = null;
      render();
    },
    dispose() {
      disposed = true;
      runtime.dispose();
      shadow.replaceChildren();
    },
  };
}
