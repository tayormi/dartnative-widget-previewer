// Connect measured DOM sizes to the shared virtual layout. Dart builds remain
// in Runtime, including widget lifecycle, inherited context and state identity.
export function mountVirtualViewport(el, resource, children, indices, render, runtime, mode) {
  resource.cleanup?.();
  const horizontal = resource.horizontal,
    p = resource.props,
    content = document.createElement('div'),
    layoutRevision = resource.layoutRevision ?? 0;
  el.style.overflow = p.physics?.valueType === 'NeverScrollableScrollPhysics' ? 'visible' : 'auto';
  el.style.position = 'relative';
  el.style.display = 'block';
  el.style.overflowAnchor = 'none';
  el.style.height =
    p.shrinkWrap || p.physics?.valueType === 'NeverScrollableScrollPhysics' ? 'auto' : '100%';
  el.style.width = '100%';
  el.style.minHeight = '0';
  el.tabIndex = 0;
  el.setAttribute(
    'aria-label',
    `${resource.kind === 'list' ? 'List' : 'Grid'} with ${resource.layout.count} items`,
  );
  el.dataset.virtualCollection = resource.key;
  el.dataset.itemCount = String(resource.layout.count);
  el.dataset.mountedCount = String(indices.length);
  content.className = 'virtual-content';
  content.style.position = 'relative';
  content.style[horizontal ? 'width' : 'height'] = `${resource.layout.total}px`;
  content.style[horizontal ? 'height' : 'width'] = '100%';
  const rows = [];
  for (let i = 0; i < children.length; i++) {
    const index = indices[i],
      box = resource.layout.geometry(index),
      row = document.createElement('div');
    row.className = 'virtual-cell';
    row.dataset.scrollIndex = String(index);
    row.style.position = 'absolute';
    row.style[horizontal ? 'left' : 'top'] = `${box.main}px`;
    row.style[horizontal ? 'top' : 'left'] = `${box.cross}px`;
    row.style[horizontal ? 'height' : 'width'] = `${box.crossSize}px`;
    if (resource.kind !== 'list' || resource.settings.extent)
      row.style[horizontal ? 'width' : 'height'] = `${box.size}px`;
    const widget = render(children[i]);
    if (resource.kind !== 'list' || resource.settings.extent) {
      widget.style.height = '100%';
      widget.style.width = '100%';
    }
    row.append(widget);
    content.append(row);
    rows.push([index, row]);
  }
  el.append(content);
  const dimensions = () => {
    const css = getComputedStyle(el);
    return {
      viewport: horizontal ? el.clientWidth : el.clientHeight,
      cross:
        (horizontal ? el.clientHeight : el.clientWidth) -
        parseFloat(horizontal ? css.paddingTop : css.paddingLeft) -
        parseFloat(horizontal ? css.paddingBottom : css.paddingRight),
    };
  };
  const update = () => {
    if (
      !el.isConnected ||
      runtime.disposed ||
      (resource.layoutRevision ?? 0) !== layoutRevision ||
      el.closest('[aria-hidden="true"]')
    )
      return;
    const size = dimensions();
    if (size.viewport <= 0 || size.cross <= 0) return;
    resource.update(horizontal ? el.scrollLeft : el.scrollTop, size.viewport, size.cross);
  };
  const measure = () => {
    if (!el.isConnected || runtime.disposed || el.closest('[aria-hidden="true"]')) return;
    update();
    resource.measure(
      rows.map(([index, row]) => [index, horizontal ? row.offsetWidth : row.offsetHeight]),
    );
  };
  const observer = new ResizeObserver(measure);
  observer.observe(el);
  for (const [, row] of rows) observer.observe(row);
  const releaseEnd = () => {
    resource.anchorEnd = false;
  };
  const keyScroll = (event) => {
    if (event.target !== el || event.altKey || event.metaKey || event.ctrlKey) return;
    const current = horizontal ? el.scrollLeft : el.scrollTop,
      page = (horizontal ? el.clientWidth : el.clientHeight) * 0.875;
    const movement = {
      PageUp: -page,
      PageDown: page,
      ' ': event.shiftKey ? -page : page,
      [horizontal ? 'ArrowLeft' : 'ArrowUp']: -40,
      [horizontal ? 'ArrowRight' : 'ArrowDown']: 40,
    };
    let target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? resource.maxScroll
          : movement[event.key] != null
            ? current + movement[event.key]
            : null;
    if (target === null) return;
    // Replacing a measured window interrupts the browser's animated key
    // scroll. Complete one keyboard step before rebuilding that window.
    releaseEnd();
    event.preventDefault();
    target = Math.max(0, Math.min(resource.maxScroll, target));
    el.scrollTo({ ...(horizontal ? { left: target } : { top: target }), behavior: 'instant' });
    update();
  };
  el.addEventListener('scroll', update, { passive: true });
  el.addEventListener('wheel', releaseEnd, { passive: true });
  el.addEventListener('pointerdown', releaseEnd);
  el.addEventListener('keydown', keyScroll);
  resource.cleanup = () => {
    observer.disconnect();
    el.removeEventListener('scroll', update);
    el.removeEventListener('wheel', releaseEnd);
    el.removeEventListener('pointerdown', releaseEnd);
    el.removeEventListener('keydown', keyScroll);
  };
  queueMicrotask(() => {
    if (!el.isConnected || runtime.disposed) return;
    if (horizontal) el.scrollLeft = resource.offset;
    else el.scrollTop = resource.offset;
    measure();
  });
  return resource;
}
