import { durationMilliseconds } from './preview-controllers.js';
const names = [
  'none',
  'slideFromRight',
  'slideFromLeft',
  'slideFromBottom',
  'slideFromTop',
  'fade',
];
export function routeOptions(props = {}) {
  const value = props.transition ?? { symbol: 'RouteTransition.slideFromRight' };
  const transition = typeof value === 'number' ? names[value] : value?.symbol?.split('.').at(-1);
  if (!names.includes(transition))
    throw Error(
      'This route transition needs another browser adapter. Native zoom gestures are not implemented.',
    );
  const duration = props.duration == null ? 350 : durationMilliseconds(props.duration);
  if (!Number.isFinite(duration) || duration < 0 || duration > 60000)
    throw Error('Route duration must be between zero and 60 seconds.');
  if (props.zoomSourceTag != null)
    throw Error('Native zoomSourceTag needs another browser adapter.');
  return { transition, duration };
}
export function logicalRect(rect, hostRect, width, height) {
  const sx = width / hostRect.width,
    sy = height / hostRect.height;
  return {
    left: (rect.left - hostRect.left) * sx,
    top: (rect.top - hostRect.top) * sy,
    width: rect.width * sx,
    height: rect.height * sy,
  };
}
export function routeFrames(transition, pop = false) {
  if (transition === 'none') return null;
  if (transition === 'fade')
    return {
      incoming: [{ opacity: 0 }, { opacity: 1 }],
      outgoing: [{ opacity: 1 }, { opacity: 0 }],
    };
  const horizontal = transition === 'slideFromRight' || transition === 'slideFromLeft',
    axis = horizontal ? 'X' : 'Y',
    sign = ['slideFromLeft', 'slideFromTop'].includes(transition) ? -1 : 1;
  const transform = (n) => ({ transform: `translate${axis}(${n}%)` });
  return pop
    ? {
        incoming: [transform(-sign * 25), transform(0)],
        outgoing: [transform(0), transform(sign * 100)],
      }
    : {
        incoming: [transform(sign * 100), transform(0)],
        outgoing: [transform(0), transform(-sign * 25)],
      };
}
const paintProperties = [
  'display',
  'box-sizing',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'padding',
  'margin',
  'border',
  'border-radius',
  'background',
  'background-image',
  'box-shadow',
  'opacity',
  'overflow',
  'color',
  'font',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'white-space',
  'word-break',
  'object-fit',
  'object-position',
  'flex',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'align-self',
  'justify-content',
  'gap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-area',
  'place-items',
  'transform',
  'transform-origin',
  'filter',
  'backdrop-filter',
  'visibility',
];
let snapshotId = 0;
// Canvas cloneNode does not copy pixels. Freeze paint and media before the
// old route's controllers are disposed, then animate a noninteractive snapshot.
function snapshot(source) {
  const clone = source.cloneNode(true),
    originals = [source, ...source.querySelectorAll('*')],
    copies = [clone, ...clone.querySelectorAll('*')];
  if (originals.length > 5000) throw Error('Hero snapshot exceeds the preview node limit.');
  const ids = new Map(),
    prefix = `flight-${++snapshotId}-`;
  for (let i = 0; i < originals.length; i++) {
    const original = originals[i],
      copy = copies[i],
      style = getComputedStyle(original);
    for (const prop of paintProperties) copy.style.setProperty(prop, style.getPropertyValue(prop));
    copy.style.animation = 'none';
    copy.style.transition = 'none';
    if (copy.dataset.heroId) copy.dataset.snapshotHeroId = copy.dataset.heroId;
    copy.removeAttribute('data-hero-id');
    copy.removeAttribute('data-virtual-collection');
    for (const attr of ['data-hero-flight', 'data-hero-from', 'data-hero-to'])
      copy.removeAttribute(attr);
    if (copy.id) {
      ids.set(copy.id, prefix + copy.id);
      copy.id = prefix + copy.id;
    }
    if (original.tagName === 'CANVAS') copy.getContext('2d')?.drawImage(original, 0, 0);
    if (original.tagName === 'VIDEO') {
      const canvas = document.createElement('canvas');
      canvas.width = original.videoWidth || 1;
      canvas.height = original.videoHeight || 1;
      canvas.style.cssText = copy.style.cssText;
      if (original.readyState >= 2) canvas.getContext('2d')?.drawImage(original, 0, 0);
      copy.replaceWith(canvas);
    }
    if ('value' in original && original.tagName !== 'OPTION') copy.value = original.value;
    if ('checked' in original) copy.checked = original.checked;
  }
  for (const copy of copies)
    for (const attr of [...copy.attributes]) {
      let value = attr.value;
      for (const [id, next] of ids) {
        value = value.replaceAll(`url(#${id})`, `url(#${next})`);
        if (['href', 'xlink:href'].includes(attr.name) && value === `#${id}`) value = `#${next}`;
      }
      if (value !== attr.value) copy.setAttribute(attr.name, value);
    }
  clone.inert = true;
  clone.setAttribute('aria-hidden', 'true');
  clone.removeAttribute('id');
  Object.assign(clone.style, {
    position: 'absolute',
    inset: '0 auto auto 0',
    margin: '0',
    transformOrigin: '0 0',
    pointerEvents: 'none',
  });
  return clone;
}
const heroElements = (root) => [...root.querySelectorAll('[data-hero-id]')];
export class PreviewTransitions {
  constructor() {
    this.runtime = null;
    this.epoch = null;
    this.route = null;
    this.flight = null;
  }
  before(root, runtime, route) {
    const same = this.runtime === runtime && this.epoch === runtime.epoch,
      changed = same && this.route !== route;
    const host = root.closest('.device-screen') || root,
      hostRect = host.getBoundingClientRect();
    const rect = (el) =>
      logicalRect(el.getBoundingClientRect(), hostRect, host.clientWidth, host.clientHeight);
    let sources = [],
      page = null;
    if (changed) {
      // Capture a running flight at its displayed position before reversing it.
      const active = this.flight?.heroes ?? new Map();
      for (const el of heroElements(root)) {
        const current = active.get(el.dataset.heroId)?.box || el,
          r = rect(current);
        if (r.width && r.height)
          sources.push({ id: el.dataset.heroId, rect: r, snapshot: snapshot(current) });
      }
      const frames = routeFrames(
        runtime.navigation?.transition || 'none',
        runtime.navigation?.type === 'pop',
      );
      if (frames && root.firstElementChild)
        page = { rect: rect(root), snapshot: snapshot(root.firstElementChild) };
    }
    if (!same || changed) this.cancel();
    this.runtime = runtime;
    this.epoch = runtime.epoch;
    this.route = route;
    return () => {
      if (!changed) {
        this.hideTargets(root);
        return;
      }
      const navigation = runtime.navigation;
      if (!navigation) return;
      const reduced = runtime.browserEnvironment.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      if (!navigation.duration || reduced) return;
      const targets = new Map(heroElements(root).map((el) => [el.dataset.heroId, el]));
      const pairs = sources
        .filter((item) => targets.has(item.id))
        .map((item) => ({ ...item, to: rect(targets.get(item.id)) }));
      const frames = routeFrames(navigation.transition, navigation.type === 'pop');
      if (!pairs.length && !frames) return;
      const layer = document.createElement('div');
      layer.className = 'preview-transition-layer';
      layer.inert = true;
      layer.setAttribute('aria-hidden', 'true');
      Object.assign(layer.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        zIndex: '30',
        overflow: 'hidden',
      });
      host.append(layer);
      const flight = {
        root,
        layer,
        heroes: new Map(),
        animations: [],
        hidden: new Map(),
        runtime,
        cleanup: null,
      };
      this.flight = flight;
      const options = {
        duration: navigation.duration,
        easing: 'cubic-bezier(.2,.65,.3,1)',
        fill: 'both',
      };
      const animate = (el, keys) => {
        if (!el.animate) return;
        const animation = el.animate(keys, options);
        flight.animations.push(animation);
        return animation;
      };
      if (frames) {
        if (page) {
          for (const el of page.snapshot.querySelectorAll('[data-snapshot-hero-id]'))
            if (pairs.some((p) => p.id === el.dataset.snapshotHeroId))
              el.style.visibility = 'hidden';
          const box = document.createElement('div');
          Object.assign(box.style, {
            position: 'absolute',
            overflow: 'hidden',
            ...Object.fromEntries(Object.entries(page.rect).map(([k, v]) => [k, `${v}px`])),
          });
          Object.assign(page.snapshot.style, {
            width: `${page.rect.width}px`,
            height: `${page.rect.height}px`,
          });
          box.append(page.snapshot);
          layer.append(box);
          animate(box, frames.outgoing);
        }
        // The viewport survives state rebuilds; an incoming widget tree does
        // not. Keep the page animation alive while controllers notify.
        if (root.firstElementChild) animate(root, frames.incoming);
      }
      for (const source of pairs) {
        const to = source.to,
          from = source.rect;
        if (!to.width || !to.height) continue;
        const box = document.createElement('div');
        box.dataset.heroFlight = source.id;
        box.dataset.heroFrom = JSON.stringify(from);
        box.dataset.heroTo = JSON.stringify(to);
        Object.assign(box.style, {
          position: 'absolute',
          overflow: 'hidden',
          left: `${from.left}px`,
          top: `${from.top}px`,
          width: `${from.width}px`,
          height: `${from.height}px`,
        });
        Object.assign(source.snapshot.style, {
          width: `${from.width}px`,
          height: `${from.height}px`,
          transform: 'none',
        });
        box.append(source.snapshot);
        layer.append(box);
        flight.heroes.set(source.id, { box, from, to });
        animate(
          box,
          [from, to].map((r) =>
            Object.fromEntries(Object.entries(r).map(([k, v]) => [k, `${v}px`])),
          ),
        );
        animate(source.snapshot, [
          { transform: 'scale(1,1)' },
          { transform: `scale(${to.width / from.width},${to.height / from.height})` },
        ]);
      }
      this.hideTargets(root);
      flight.cleanup = () => {
        if (this.flight === flight) this.cancel();
      };
      runtime.cleanups.add(flight.cleanup);
      root.dataset.lastRouteTransition = navigation.type;
      root.dataset.lastHeroCount = String(flight.heroes.size);
      root.dataset.transitionState = 'running';
      const finish = () => {
        if (this.flight === flight) {
          root.dataset.transitionState = 'finished';
          this.cancel();
        }
      };
      Promise.all(flight.animations.map((a) => a.finished.catch(() => {}))).then(finish);
      flight.timeout = setTimeout(finish, navigation.duration + 100);
    };
  }
  hideTargets(root) {
    const flight = this.flight;
    if (!flight) return;
    for (const el of heroElements(root))
      if (flight.heroes.has(el.dataset.heroId)) {
        if (!flight.hidden.has(el)) flight.hidden.set(el, el.style.visibility);
        el.style.visibility = 'hidden';
      }
  }
  cancel() {
    const flight = this.flight;
    if (!flight) return;
    this.flight = null;
    if (flight.root.dataset.transitionState === 'running')
      flight.root.dataset.transitionState = 'cancelled';
    clearTimeout(flight.timeout);
    for (const a of flight.animations) a.cancel();
    for (const [el, visibility] of flight.hidden) el.style.visibility = visibility;
    flight.layer.remove();
    if (flight.cleanup) flight.runtime.cleanups.delete(flight.cleanup);
  }
}
