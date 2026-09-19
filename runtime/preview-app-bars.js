const clamp = (value) => Math.max(0, Math.min(1, value));
export function largeTitleGeometry(offset, height = 56) {
  const progress = clamp(offset / Math.max(1, height));
  return {
    progress,
    translate: offset > 0 ? -Math.min(offset, height) : 0,
    largeOpacity: 1 - progress,
    smallOpacity: clamp((progress - 0.35) / 0.65),
    stretch: 1 + Math.min(100, Math.max(0, -offset)) / 700,
  };
}

// The primary browser scroll view drives chrome directly. No Dart rebuild is
// needed for each scroll frame; state rebuilds rebind after offsets restore.
export class PreviewAppBars {
  constructor() {
    this.cleanup = null;
  }
  bind(root, runtime) {
    this.cleanup?.();
    const releases = [];
    for (const bar of root.querySelectorAll('[data-large-title]')) {
      const scaffold = bar.closest('.screen'),
        body = scaffold?.querySelector('.screen-body');
      if (!body) continue;
      const scroll =
        [...body.querySelectorAll('[data-scroll-axis="vertical"]')].find(
          (el) => el.closest('.screen') === scaffold && !el.closest('[aria-hidden="true"]'),
        ) || body;
      const band = bar.querySelector('.large-title-band'),
        content = band.firstElementChild,
        title = bar.querySelector('.nav-title'),
        edge = bar.querySelector('.app-bar-edge');
      const update = () => {
        const g = largeTitleGeometry(scroll.scrollTop, band.offsetHeight || 56);
        content.style.transform = `translateY(${g.translate}px) scale(${g.stretch})`;
        content.style.opacity = String(g.largeOpacity);
        title.style.opacity = String(g.smallOpacity);
        band.setAttribute('aria-hidden', String(g.progress >= 1));
        title.setAttribute('aria-hidden', String(g.progress === 0));
        if (edge) edge.style.opacity = String(clamp(scroll.scrollTop / 24));
        bar.dataset.largeTitleProgress = String(g.progress);
      };
      scroll.addEventListener('scroll', update, { passive: true });
      const observer = new ResizeObserver(update);
      observer.observe(band);
      observer.observe(scroll);
      update();
      releases.push(() => {
        scroll.removeEventListener('scroll', update);
        observer.disconnect();
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

export function appendLargeTitle(bar, p, render) {
  bar.dataset.largeTitle = 'true';
  const band = document.createElement('div');
  band.className = 'large-title-band';
  Object.assign(band.style, {
    position: 'absolute',
    top: '100%',
    left: '0',
    right: '0',
    height: '56px',
    overflow: 'hidden',
    pointerEvents: 'none',
  });
  const content = document.createElement('div');
  Object.assign(content.style, { padding: '6px 16px 8px', transformOrigin: 'left top' });
  content.append(render(p.largeTitle));
  band.append(content);
  bar.append(band);
  if (p.backgroundColor == null) {
    const edge = document.createElement('div');
    edge.className = 'app-bar-edge';
    edge.setAttribute('aria-hidden', 'true');
    Object.assign(edge.style, {
      position: 'absolute',
      top: 'calc(-1 * var(--preview-safe-top,62px))',
      left: '0',
      right: '0',
      height: 'calc(100% + var(--preview-safe-top,62px) + 18px)',
      pointerEvents: 'none',
      zIndex: '-1',
      opacity: '0',
    });
    for (const [blur, end] of [
      [4, 100],
      [8, 88],
      [12, 76],
    ]) {
      const layer = document.createElement('div');
      Object.assign(layer.style, {
        position: 'absolute',
        inset: '0',
        backdropFilter: `blur(${blur}px)`,
        webkitBackdropFilter: `blur(${blur}px)`,
        maskImage: `linear-gradient(black ${end - 25}%, transparent ${end}%)`,
      });
      edge.append(layer);
    }
    bar.prepend(edge);
  }
}
