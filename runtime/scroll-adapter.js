import { PreviewScrollController } from './preview-controllers.js';
import { startScrollMotion } from './scroll-motion.js';

export function attachScrollView(el, props, runtime, mode, virtual = null, clock = undefined) {
  const layoutRevision = virtual?.layoutRevision ?? 0;
  const staleLayout = () => virtual && (virtual.layoutRevision ?? 0) !== layoutRevision;
  const horizontal = props.scrollDirection?.symbol === 'Axis.horizontal';
  el.dataset.scrollViewport = '';
  el.dataset.scrollAxis = horizontal ? 'horizontal' : 'vertical';
  if (mode !== 'interact') return;
  // Apply wheel deltas before an animation replaces this DOM frame. Deferring
  // scrolling to the compositor can otherwise target a detached old viewport.
  el.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.defaultPrevented) return;
      const extent = horizontal
        ? el.scrollWidth - el.clientWidth
        : el.scrollHeight - el.clientHeight;
      const before = horizontal ? el.scrollLeft : el.scrollTop;
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? horizontal
              ? el.clientWidth
              : el.clientHeight
            : 1;
      const delta =
        (horizontal ? event.deltaX || (event.shiftKey && event.deltaY) || 0 : event.deltaY) * unit;
      const next = Math.max(0, Math.min(extent, before + delta));
      if (!delta || next === before) return;
      event.preventDefault();
      event.stopPropagation();
      if (horizontal) el.scrollLeft = next;
      else el.scrollTop = next;
    },
    { passive: false },
  );
  const controllers = [props.controller, props.listController, props.gridController].filter(
    (c) => c instanceof PreviewScrollController,
  );
  if (!controllers.length && !props.onScroll && !props.reverse) return;
  let dragging = false,
    detachers = [],
    activeRequest = null,
    goal = null,
    cancelMotion = null;
  const stopMotion = () => {
    cancelMotion?.();
    cancelMotion = null;
  };
  const metrics = () => ({
    offset: horizontal ? el.scrollLeft : el.scrollTop,
    content: horizontal ? el.scrollWidth : el.scrollHeight,
    viewport: horizontal ? el.clientWidth : el.clientHeight,
  });
  const update = () => {
    if (!el.isConnected || runtime.disposed || staleLayout()) return;
    const { offset, content, viewport } = metrics();
    if (viewport <= 0 || el.closest('[aria-hidden="true"]')) return;
    // Dart listeners can rebuild immediately, before the browser dispatches its
    // scroll event. Preserve this offset in the virtual window first.
    virtual?.update?.(offset, viewport, virtual.cross);
    if (activeRequest && !activeRequest.timed && Math.abs(offset - goal) < 1) {
      for (const controller of controllers) controller.finish(activeRequest);
      activeRequest = null;
    }
    for (const controller of controllers)
      if (!controller.disposed) controller.update(offset, content, viewport, dragging);
    if (props.onScroll) {
      const metrics = [offset, Math.max(0, content - viewport), viewport, dragging];
      // Replacing a DOM frame is not a new native scroll event. Re-reporting
      // unchanged geometry can turn a failed page fetch into an endless retry.
      if (
        !virtual ||
        !virtual.lastReportedMetrics ||
        metrics.some((value, index) => value !== virtual.lastReportedMetrics[index])
      ) {
        if (virtual) virtual.lastReportedMetrics = metrics;
        runtime.runAction(props.onScroll, metrics, false);
      }
    }
  };
  const command = (request) => {
    stopMotion();
    for (const controller of controllers)
      if (controller.activeCommand !== request) controller.cancelScroll();
    const { kind, offset, index, alignment = 0, animated = false } = request;
    if (virtual && virtual.lastScrollCommand !== request) {
      virtual.lastScrollCommand = request;
      virtual.anchorEnd = kind === 'bottom';
      if (virtual.anchorEnd && virtual.transientEndAnchor) virtual.runtime.scheduleChange();
    }
    const { content, viewport } = metrics();
    let target = offset;
    if (kind === 'bottom') target = content - viewport;
    if (kind === 'item') {
      // A timed seek travels through virtual windows. Preparing the target first
      // would jump straight to its window before the animation even starts.
      const estimated = virtual && request.timed && !virtual.mountedIndices.has(index);
      if (estimated) {
        if (index >= virtual.layout.count)
          throw Error('Scroll item index is outside the collection.');
        const geometry = virtual.layout.geometry(index);
        target = geometry.main + virtual.paddingStart - alignment * (viewport - geometry.size);
      } else {
        if (virtual && !virtual.prepare(index)) return;
        const child = [...el.querySelectorAll('[data-scroll-index]')].find(
          (item) =>
            Number(item.dataset.scrollIndex) === index &&
            item.closest('[data-scroll-viewport]') === el,
        );
        if (!child) return;
        const itemRect = child.getBoundingClientRect(),
          viewRect = el.getBoundingClientRect();
        // Rectangles include the device preview scale. Convert back to logical
        // scroll coordinates, including nested sliver padding and headers.
        const scale =
          (horizontal ? viewRect.width / el.offsetWidth : viewRect.height / el.offsetHeight) || 1;
        target =
          (horizontal
            ? el.scrollLeft + (itemRect.left - viewRect.left) / scale - el.clientLeft
            : el.scrollTop + (itemRect.top - viewRect.top) / scale - el.clientTop) -
          alignment * (viewport - (horizontal ? child.offsetWidth : child.offsetHeight));
      }
    }
    target = Math.max(0, Math.min(Math.max(0, content - viewport), target));
    activeRequest = request;
    goal = target;
    const scroll = (value, behavior) => {
      el.scrollTo({ ...(horizontal ? { left: value } : { top: value }), behavior });
      update();
    };
    if (
      animated &&
      request.timed &&
      !runtime.browserEnvironment?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      cancelMotion = startScrollMotion(request, {
        from: metrics().offset,
        to: target,
        clock,
        apply: (value) => {
          if (!el.isConnected || runtime.disposed || activeRequest !== request) {
            stopMotion();
            return;
          }
          scroll(value, 'instant');
        },
        finish: () => {
          cancelMotion = null;
          if (activeRequest !== request) return;
          if (kind === 'item' && virtual && !virtual.mountedIndices.has(index)) {
            virtual.prepare(index);
            return;
          }
          for (const controller of controllers) controller.finish(request);
          activeRequest = null;
          update();
        },
      });
    } else {
      scroll(target, animated && !request.timed ? 'smooth' : 'instant');
      if (request.timed) {
        for (const controller of controllers) controller.finish(request);
        activeRequest = null;
      }
    }
  };
  el.dataset.scrollViewport = '';
  const userScroll = () => {
    stopMotion();
    for (const controller of controllers) controller.cancelScroll();
    activeRequest = null;
  };
  el.addEventListener('keydown', (event) => {
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'PageUp',
        'PageDown',
        'Home',
        'End',
        ' ',
      ].includes(event.key)
    )
      userScroll();
  });
  el.addEventListener('pointerdown', () => {
    dragging = true;
    userScroll();
  });
  el.addEventListener('wheel', userScroll, { passive: true });
  el.addEventListener('pointerup', () => {
    dragging = false;
  });
  el.addEventListener('pointercancel', () => {
    dragging = false;
  });
  el.addEventListener('scroll', update, { passive: true });
  queueMicrotask(() => {
    if (!el.isConnected || runtime.disposed || staleLayout()) return;
    const previous = controllers[0];
    const initial = virtual
      ? virtual.anchorEnd
        ? Infinity
        : virtual.initialPlacement
          ? previous?.contentHeight
            ? 0
            : (previous?.offset ?? 0)
          : virtual.offset
      : previous?.contentHeight
        ? previous.offset
        : props.reverse
          ? Infinity
          : (previous?.offset ?? 0);
    const { content, viewport } = metrics();
    const position = Math.min(Math.max(0, content - viewport), initial);
    if (horizontal) el.scrollLeft = position;
    else el.scrollTop = position;
    if (virtual) {
      virtual.initialPlacement = false;
      if (!virtual.anchorEnd) virtual.offset = position;
    }
    detachers = controllers.map((controller) => controller.attach(command));
    update();
  });
  // A render replaces DOM views without disposing their Dart controllers.
  // Release each previous attachment before binding the replacement.
  for (const controller of controllers) {
    controller.viewCleanup?.();
    controller.viewCleanup = () => {
      stopMotion();
      for (const detach of detachers) detach();
      el.removeEventListener('scroll', update);
    };
  }
}
