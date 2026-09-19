import { color, boxShadows } from './style-values.js';
import { borderRadius } from './layout-values.js';
const symbol = (v) => v?.symbol?.split('.').at(-1);
const groups = new WeakMap();
export function roundedDistance(x, y, shape) {
  const dx = x - shape.x - shape.width / 2,
    dy = y - shape.y - shape.height / 2;
  const radius = Math.min(
    shape.width / 2,
    shape.height / 2,
    shape.radii[dy < 0 ? (dx < 0 ? 0 : 1) : dx < 0 ? 3 : 2],
  );
  const qx = Math.abs(dx) - shape.width / 2 + radius,
    qy = Math.abs(dy) - shape.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}
export function glassDistance(x, y, shapes, spacing) {
  let distance = Infinity;
  for (const shape of shapes) {
    const next = roundedDistance(x, y, shape);
    if (!Number.isFinite(distance) || spacing <= 0) {
      distance = Math.min(distance, next);
      continue;
    }
    const k = spacing * 2,
      h = Math.max(k - Math.abs(distance - next), 0) / k;
    distance = Math.min(distance, next) - (h * h * k) / 4;
  }
  return distance;
}
export function glassMask(shapes, spacing, width, height) {
  const step = Math.max(
      1,
      width / 4096,
      height / 4096,
      Math.sqrt((width * height * Math.max(1, shapes.length)) / 131072),
    ),
    w = Math.ceil(width / step),
    h = Math.ceil(height / step),
    fill = new Uint8ClampedArray(w * h * 4),
    rim = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = glassDistance((x + 0.5) * step, (y + 0.5) * step, shapes, spacing),
        i = (y * w + x) * 4,
        a = Math.max(0, Math.min(1, 0.5 - d / step));
      fill[i] = fill[i + 1] = fill[i + 2] = 255;
      fill[i + 3] = Math.round(a * 255);
      rim[i] = rim[i + 1] = rim[i + 2] = 255;
      rim[i + 3] = Math.round(a * Math.max(0, 1 - Math.abs(d + 0.75) / Math.max(1, step)) * 255);
    }
  return { width: w, height: h, fill, rim };
}
export function mountGlass(el, p, { platform, mode, child }) {
  el.append(child);
  el.dataset.glassSurface = '';
  const dark = symbol(p.brightness) === 'dark',
    clear = symbol(p.style) === 'clear';
  const tint = color(p.tint),
    base = dark
      ? `rgb(30 30 34 / ${clear ? 0.12 : 0.4})`
      : `rgb(255 255 255 / ${clear ? 0.1 : 0.3})`;
  el.dataset.glassFill = tint ? `color-mix(in srgb, ${tint} 70%, ${base})` : base;
  el.dataset.glassBlur = String(clear ? 6 : 18);
  el.dataset.glassStyle = clear ? 'clear' : 'regular';
  el.style.borderRadius = borderRadius(p.borderRadius) || '0';
  if (platform !== 'ios') return;
  if (p.shadow) el.dataset.glassCustomShadow = 'true';
  Object.assign(el.style, {
    background: el.dataset.glassFill,
    backdropFilter: `blur(${el.dataset.glassBlur}px) saturate(150%)`,
    boxShadow: p.shadow
      ? boxShadows([p.shadow])
      : 'inset 0 1px 1px #ffffff80, inset 0 -1px 1px #00000016, 0 3px 9px #00000015',
    overflow: p.interactive ? 'visible' : 'hidden',
  });
  el.style.webkitBackdropFilter = el.style.backdropFilter;
  if (p.interactive && mode === 'interact') {
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.dataset.interactiveGlass = 'true';
    el.style.transition = reduced ? 'none' : 'transform 140ms ease-out, filter 140ms ease-out';
    const release = () => {
      el.style.transform = '';
      el.style.filter = '';
      delete el.dataset.glassPressed;
    };
    el.addEventListener(
      'pointerdown',
      () => {
        el.dataset.glassPressed = 'true';
        if (!reduced) el.style.transform = 'scale(1.045)';
        el.style.filter = 'brightness(1.12)';
      },
      { capture: true },
    );
    el.addEventListener('pointerup', release, { capture: true });
    el.addEventListener('pointercancel', release, { capture: true });
    el.addEventListener('pointerleave', release);
  }
}
export function markGlassGroup(el, spacing) {
  el.dataset.glassGroup = '';
  el.style.position = 'relative';
  groups.set(el, spacing);
}

// CSS supplies the backdrop material; a distance-field mask joins descendant
// shapes from their real layout. This is a browser approximation of UIKit.
export class PreviewGlassGroups {
  constructor() {
    this.cleanup = null;
  }
  bind(root, runtime) {
    this.cleanup?.();
    const releases = [];
    for (const group of root.querySelectorAll('[data-glass-group]')) {
      const spacing = groups.get(group) ?? 40,
        surfaces = [...group.querySelectorAll('[data-glass-surface]')].filter(
          (el) => el.closest('[data-glass-group]') === group,
        );
      if (!surfaces.length) continue;
      if (surfaces.length > 64) throw Error('Glass groups support up to 64 visible surfaces.');
      for (const el of surfaces) {
        el.style.background = 'none';
        el.style.backdropFilter = 'none';
        el.style.webkitBackdropFilter = 'none';
        if (!el.dataset.glassCustomShadow) el.style.boxShadow = 'none';
        el.style.position = 'relative';
        el.style.zIndex = '1';
      }
      const material = document.createElement('div'),
        rim = document.createElement('div');
      material.className = 'glass-group-material';
      rim.className = 'glass-group-rim';
      for (const el of [material, rim]) {
        el.setAttribute('aria-hidden', 'true');
        Object.assign(el.style, { position: 'absolute', pointerEvents: 'none' });
        group.prepend(el);
      }
      Object.assign(material.style, {
        backdropFilter: `blur(${Math.max(...surfaces.map((el) => Number(el.dataset.glassBlur)))}px) saturate(150%)`,
        background: `linear-gradient(90deg, ${surfaces.map((el) => el.dataset.glassFill).join(', ')})`,
      });
      if (surfaces.length === 1) material.style.background = surfaces[0].dataset.glassFill;
      material.style.webkitBackdropFilter = material.style.backdropFilter;
      rim.style.background = 'linear-gradient(150deg,#ffffffb0,#ffffff20 45%,#00000030)';
      rim.style.zIndex = '1';
      const canvas = document.createElement('canvas'),
        ctx = canvas.getContext('2d');
      let scheduled = null,
        last = '',
        trackingUntil = 0,
        disposed = false;
      const update = () => {
        scheduled = null;
        if (disposed || !group.isConnected) return;
        const box = group.getBoundingClientRect(),
          scale = box.width / group.offsetWidth || 1,
          pad = Math.min(128, spacing + 4);
        const shapes = surfaces.map((el) => {
          const r = el.getBoundingClientRect(),
            style = getComputedStyle(el);
          return {
            x: (r.left - box.left) / scale + pad,
            y: (r.top - box.top) / scale + pad,
            width: r.width / scale,
            height: r.height / scale,
            radii: [
              'borderTopLeftRadius',
              'borderTopRightRadius',
              'borderBottomRightRadius',
              'borderBottomLeftRadius',
            ].map((key) => parseFloat(style[key]) || 0),
          };
        });
        const width = Math.ceil(group.offsetWidth + pad * 2),
          height = Math.ceil(group.offsetHeight + pad * 2),
          key = JSON.stringify([width, height, shapes]);
        if (width > 0 && height > 0 && Number.isFinite(width + height) && key !== last) {
          last = key;
          const mask = glassMask(shapes, spacing, width, height);
          canvas.width = mask.width;
          canvas.height = mask.height;
          for (const [el, data] of [
            [material, mask.fill],
            [rim, mask.rim],
          ]) {
            ctx.putImageData(new ImageData(data, mask.width, mask.height), 0, 0);
            Object.assign(el.style, {
              left: `${-pad}px`,
              top: `${-pad}px`,
              width: `${width}px`,
              height: `${height}px`,
              maskImage: `url(${canvas.toDataURL()})`,
              maskSize: '100% 100%',
            });
          }
          group.dataset.glassShapeCount = String(shapes.length);
        }
        if (performance.now() < trackingUntil) scheduled = requestAnimationFrame(update);
      };
      const schedule = () => {
        if (scheduled == null) scheduled = requestAnimationFrame(update);
      };
      const press = () => {
        trackingUntil = performance.now() + 180;
        schedule();
      };
      group.addEventListener('pointerdown', press, true);
      group.addEventListener('pointerup', press, true);
      group.addEventListener('pointerleave', press, true);
      const observer = new ResizeObserver(schedule);
      observer.observe(group);
      surfaces.forEach((el) => observer.observe(el));
      schedule();
      releases.push(() => {
        disposed = true;
        observer.disconnect();
        cancelAnimationFrame(scheduled);
        group.removeEventListener('pointerdown', press, true);
        group.removeEventListener('pointerup', press, true);
        group.removeEventListener('pointerleave', press, true);
        material.remove();
        rim.remove();
      });
    }
    const cleanup = () => {
      releases.forEach((fn) => fn());
      runtime.cleanups.delete(cleanup);
      if (this.cleanup === cleanup) this.cleanup = null;
    };
    if (releases.length) {
      this.cleanup = cleanup;
      runtime.cleanups.add(cleanup);
    }
  }
}
