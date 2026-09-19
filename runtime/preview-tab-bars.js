// Ignore bounce and small direction changes. Track accumulated travel so slow
// scrolling has the same result as a wheel or a touch fling.
export class TabBarScrollState {
  constructor(behavior, offset = 0) {
    this.behavior = behavior;
    this.offset = offset;
    this.travel = 0;
    this.direction = 0;
    this.minimized = false;
  }
  update(offset, max) {
    offset = Math.max(0, Math.min(Math.max(0, max), offset));
    const delta = offset - this.offset;
    this.offset = offset;
    if (!delta) return;
    const direction = Math.sign(delta);
    this.travel = direction === this.direction ? this.travel + Math.abs(delta) : Math.abs(delta);
    this.direction = direction;
    // The iOS 26.4 reference keeps the capsule minimized on reverse scrolling,
    // including at the top. Only tapping it expands the tabs. This differs
    // from the SDK comment describing automatic expansion on scroll up.
    if (this.travel >= 12 && direction === (this.behavior === 'minimizeOnScrollUp' ? -1 : 1))
      this.minimized = true;
  }
  expand() {
    this.minimized = false;
    this.travel = 0;
    this.direction = 0;
  }
}

export class PreviewTabBars {
  constructor() {
    this.cleanup = null;
    this.runtime = null;
    this.epoch = null;
    this.routes = new Map();
  }
  bind(root, runtime, route) {
    this.cleanup?.();
    if (this.runtime !== runtime || this.epoch !== runtime.epoch) this.routes.clear();
    this.runtime = runtime;
    this.epoch = runtime.epoch;
    for (const key of this.routes.keys())
      if (typeof key === 'function' && !runtime.stack.includes(key)) this.routes.delete(key);
    const records = this.routes.get(route) || new Map();
    this.routes.set(route, records);
    const releases = [],
      present = new Set();
    let ordinal = 0;
    for (const bar of root.querySelectorAll('[data-tab-scroll-behavior]')) {
      if (bar.dataset.tabPlatform !== 'ios') continue;
      const scaffold = bar.closest('.screen'),
        body = scaffold?.querySelector('.screen-body');
      if (!body) continue;
      const scroll =
        [...body.querySelectorAll('[data-scroll-axis="vertical"]')].find(
          (el) => el.closest('.screen') === scaffold && !el.closest('[aria-hidden="true"]'),
        ) || body;
      const key = `${bar.dataset.source}:${ordinal++}`,
        selected = bar.dataset.selectedTab,
        behavior = bar.dataset.tabScrollBehavior;
      present.add(key);
      let record = records.get(key);
      if (!record || record.selected !== selected || record.state.behavior !== behavior)
        record = { selected, state: new TabBarScrollState(behavior, scroll.scrollTop) };
      const state = record.state;
      state.offset = scroll.scrollTop;
      records.set(key, record);
      const buttons = [...bar.children],
        active = buttons[Number(selected)];
      if (!active) continue;
      const reduced = runtime.browserEnvironment?.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      const paint = () => {
        const small = state.minimized,
          width = small
            ? 48
            : Math.min(buttons.length * 94, Math.max(48, scaffold.clientWidth - 40));
        bar.dataset.minimized = String(small);
        Object.assign(bar.style, {
          position: 'absolute',
          right: 'auto',
          left: small ? '28px' : `${(scaffold.clientWidth - width) / 2}px`,
          width: `${width}px`,
          height: small ? '48px' : '62px',
          bottom: `calc(-1 * var(--preview-safe-bottom,34px) + ${small ? 28 : 20}px)`,
          margin: '0',
          padding: small ? '0' : '3px',
          zIndex: '3',
        });
        for (const button of buttons) {
          const hidden = small && button !== active;
          button.hidden = hidden;
          button.inert = hidden;
          button.setAttribute('aria-hidden', String(hidden));
          Object.assign(button.style, {
            display: hidden ? 'none' : '',
            minHeight: small ? '46px' : '54px',
            padding: small ? '10px' : '5px 12px',
          });
          if (button === active) {
            button.style.background = small ? 'transparent' : '';
            button.setAttribute('aria-expanded', String(!small));
            button.setAttribute(
              'aria-label',
              small ? `Show tabs, ${button.dataset.tabLabel}` : button.dataset.tabLabel,
            );
          }
          for (const label of button.querySelectorAll('small')) label.hidden = small;
        }
      };
      // Restored scroll offsets are the baseline, not a new scroll gesture.
      paint();
      bar.style.transition = reduced
        ? 'none'
        : 'left 220ms ease,width 220ms ease,height 220ms ease,bottom 220ms ease,padding 220ms ease';
      const update = () => {
        const previous = state.minimized;
        state.update(scroll.scrollTop, scroll.scrollHeight - scroll.clientHeight);
        if (previous !== state.minimized) paint();
      };
      const expand = (e) => {
        if (!state.minimized) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        state.expand();
        paint();
        active.focus({ preventScroll: true });
      };
      scroll.addEventListener('scroll', update, { passive: true });
      bar.addEventListener('click', expand, true);
      const observer = new ResizeObserver(paint);
      observer.observe(scaffold);
      releases.push(() => {
        scroll.removeEventListener('scroll', update);
        bar.removeEventListener('click', expand, true);
        observer.disconnect();
      });
    }
    for (const key of records.keys()) if (!present.has(key)) records.delete(key);
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
