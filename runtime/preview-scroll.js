// Shared by Studio and the native comparison harness. Offsets belong to a
// source version, runtime epoch and route, never to the global canvas.
export class PreviewScroll {
  constructor() {
    this.runtime = null;
    this.epoch = null;
    this.route = null;
    this.routes = new Map();
  }
  elements(root) {
    const counts = new Map();
    return [...root.querySelectorAll('[data-source], .screen-body')].map((el) => {
      const cell = el.closest?.('[data-scroll-index]'),
        collection = cell?.closest?.('[data-virtual-collection]');
      const item = collection
        ? `${collection.dataset.virtualCollection}/item:${cell.dataset.scrollIndex}:`
        : '';
      const site = `${item}${el.dataset.source || 'body'}:${el.dataset.widget || ''}`;
      const ordinal = counts.get(site) || 0;
      counts.set(site, ordinal + 1);
      return { el, key: `${site}:${ordinal}` };
    });
  }
  transition(root, runtime, route) {
    if (this.runtime === runtime && this.epoch === runtime.epoch) {
      this.routes.set(
        this.route,
        this.elements(root)
          .filter(({ el }) => el.scrollTop || el.scrollLeft)
          .map(({ el, key }) => ({ key, top: el.scrollTop, left: el.scrollLeft })),
      );
    } else this.routes.clear();
    this.runtime = runtime;
    this.epoch = runtime.epoch;
    this.route = route;
    for (const key of this.routes.keys())
      if (typeof key === 'function' && !runtime.stack.includes(key)) this.routes.delete(key);
    const saved = this.routes.get(route) || [];
    return () => {
      const elements = new Map(this.elements(root).map(({ el, key }) => [key, el]));
      for (const position of saved) {
        const el = elements.get(position.key);
        if (el) {
          el.scrollTop = position.top;
          el.scrollLeft = position.left;
        }
      }
    };
  }
}
