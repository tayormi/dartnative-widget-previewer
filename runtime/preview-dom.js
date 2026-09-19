import { PreviewTransitions } from './preview-transitions.js';
import { PreviewScroll } from './preview-scroll.js';
import { PreviewAppBars } from './preview-app-bars.js';
import { PreviewTabBars } from './preview-tab-bars.js';
import { PreviewImplicitAnimations } from './preview-implicit.js';
import { PreviewGlassGroups } from './preview-glass.js';

// Retain input identity and viewport positions when a runtime update replaces
// DOM controls. Source locations alone are insufficient for repeated widgets.
export class PreviewDOM {
  constructor() {
    this.scroll = new PreviewScroll();
    this.transitions = new PreviewTransitions();
    this.appBars = new PreviewAppBars();
    this.tabBars = new PreviewTabBars();
    this.implicit = new PreviewImplicitAnimations();
    this.glass = new PreviewGlassGroups();
  }
  replace(root, runtime, route, create) {
    const transition = this.transitions.before(root, runtime, route);
    const animateImplicit = this.implicit.before(root, runtime, route);
    const restoreScroll = this.scroll.transition(root, runtime, route);
    const active = root.getRootNode().activeElement;
    const viewportKey = root.contains(active) ? active?.dataset?.virtualCollection : null;
    const eligible = root.contains(active) && active.matches('input,textarea');
    const key = eligible ? active.dataset.definition || active.dataset.source : null;
    const cell = eligible ? active.closest('[data-scroll-index]') : null,
      collection = cell?.closest('[data-virtual-collection]');
    const cellIndex = collection ? cell.dataset.scrollIndex : null,
      collectionKey = collection?.dataset.virtualCollection;
    const matching = () =>
      [...root.querySelectorAll('input,textarea')].filter(
        (el) =>
          (el.dataset.definition || el.dataset.source) === key &&
          (cellIndex === null ||
            (el.closest('[data-scroll-index]')?.dataset.scrollIndex === cellIndex &&
              el.closest('[data-virtual-collection]')?.dataset.virtualCollection ===
                collectionKey)),
      );
    const ordinal = eligible ? matching().indexOf(active) : -1;
    const start = eligible ? active.selectionStart : null,
      end = eligible ? active.selectionEnd : null;
    const previous = [...root.childNodes],
      next = create();
    if (runtime.maps?.views.size) {
      root.append(next);
      runtime.maps.commit(root);
      for (const child of previous) child.remove();
    } else root.replaceChildren(next);
    restoreScroll();
    this.appBars.bind(root, runtime);
    this.tabBars.bind(root, runtime, route);
    animateImplicit();
    this.glass.bind(root, runtime);
    transition();
    if (ordinal >= 0) {
      const next = matching()[ordinal];
      if (next && !next.disabled) {
        next.focus({ preventScroll: true });
        if (start != null && next.setSelectionRange) next.setSelectionRange(start, end);
      }
    } else if (viewportKey) {
      [...root.querySelectorAll('[data-virtual-collection]')]
        .find((el) => el.dataset.virtualCollection === viewportKey)
        ?.focus({ preventScroll: true });
    }
  }
}
