import { color } from './style-values.js';
import { durationMilliseconds } from './preview-controllers.js';

const symbol = (value) => value?.symbol?.split('.').at(-1);
export function mountImage(
  el,
  url,
  p,
  { runtime, render, views, local = false, bounded = true, intrinsic = false },
) {
  const duration = (value) => {
    const ms = durationMilliseconds(value);
    if (!Number.isFinite(ms) || ms < 0 || ms > 2147483647)
      throw Error('Image durations must be nonnegative and within the browser timer range.');
    return ms;
  };
  const minimum = duration(p.placeholderMinDuration),
    fadeDuration = duration(p.fadeInDuration);
  const lease = runtime.images.acquire(url, { ...p, local }),
    started = performance.now();
  let disposed = false,
    timer;
  el.classList.add('asset-image');
  el.dataset.imageState = lease.hit ? 'cached' : 'loading';
  Object.assign(el.style, {
    position: 'relative',
    width: p.width != null ? `${p.width}px` : intrinsic ? 'auto' : '100%',
    height: p.height != null ? `${p.height}px` : bounded && !intrinsic ? '100%' : 'auto',
    overflow: 'hidden',
  });
  let placeholder;
  try {
    placeholder = p.placeholder ? render(p.placeholder) : null;
    if (placeholder) el.append(placeholder);
  } catch (error) {
    lease.release();
    throw error;
  }
  const finish = (bitmap, error) => {
    if (disposed || runtime.disposed) return;
    const min = lease.hit ? 0 : minimum;
    const delay = placeholder ? Math.max(0, min - (performance.now() - started)) : 0;
    const display = () => {
      if (disposed || runtime.disposed) return;
      runtime.images.releaseChildren(el);
      el.replaceChildren();
      el.dataset.imageState = error ? 'error' : 'ready';
      if (error) {
        if (p.errorWidget) el.append(render(p.errorWidget));
        else {
          el.classList.add('image-placeholder');
          el.textContent = 'Image unavailable';
          el.setAttribute('aria-label', error.message);
        }
        return;
      }
      if (intrinsic) {
        if (p.width == null) el.style.width = `${bitmap.width}px`;
        if (p.height == null) el.style.height = `${bitmap.height}px`;
      }
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'App image');
      canvas.dataset.decodeWidth = String(bitmap.width);
      canvas.dataset.decodeHeight = String(bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      if (p.color != null) {
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = color(p.color);
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'source-over';
      }
      const fit = symbol(p.fit) || 'contain';
      Object.assign(canvas.style, {
        display: 'block',
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        objectFit: { scaleDown: 'scale-down', fitWidth: 'cover', fitHeight: 'contain' }[fit] || fit,
        objectPosition:
          {
            topLeft: 'left top',
            topCenter: 'center top',
            topRight: 'right top',
            centerLeft: 'left center',
            center: 'center',
            centerRight: 'right center',
            bottomLeft: 'left bottom',
            bottomCenter: 'center bottom',
            bottomRight: 'right bottom',
          }[symbol(p.alignment)] || 'center',
      });
      el.append(canvas);
      const fade = lease.hit ? 0 : fadeDuration;
      if (fade > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches)
        canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade });
    };
    const guardedDisplay = () => {
      try {
        display();
      } catch (error) {
        if (!disposed) {
          el.dataset.imageState = 'error';
          el.textContent = `Image unavailable: ${error.message}`;
        }
      }
    };
    if (delay) timer = setTimeout(guardedDisplay, delay);
    else guardedDisplay();
  };
  views.add(el);
  runtime.images.views.set(el, () => {
    disposed = true;
    clearTimeout(timer);
    lease.release();
  });
  lease.promise.then(
    (bitmap) => finish(bitmap),
    (error) => finish(null, error),
  );
}
