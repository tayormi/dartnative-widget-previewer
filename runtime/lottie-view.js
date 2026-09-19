import { PreviewLottieController } from './lottie-controller.js';
let playerModule;
const player = () =>
  (playerModule ??= import('lottie-web/build/player/lottie_light.js').then((module) => {
    const value = module.default;
    value.useWebWorker(false);
    return value;
  }));
const symbol = (value) => value?.symbol?.split('.').at(-1);
export function mountLottie(
  el,
  key,
  source,
  p,
  { runtime, render, views, imageViews, local = false, json = false, onFault },
) {
  views.add(key);
  const signature = JSON.stringify([
    source,
    local,
    json,
    symbol(p.cachePolicy) || 'disk',
    p.loop ?? false,
    p.autoplay ?? true,
    p.speed ?? 1,
    symbol(p.fit) || 'contain',
  ]);
  let view = runtime.lottie.views.get(key);
  if (view && (view.signature !== signature || view.controller !== p.controller)) {
    view.dispose();
    runtime.lottie.views.delete(key);
    view = null;
  }
  if (!view) {
    view = createView(source, p, { runtime, render, local, json, onFault });
    view.signature = signature;
    view.controller = p.controller;
    runtime.lottie.views.set(key, view);
  }
  Object.assign(el.style, {
    width: '100%',
    height: '100%',
    minWidth: '0',
    minHeight: '0',
    overflow: 'hidden',
  });
  el.append(view.element);
  for (const image of runtime.images.views.keys())
    if (view.element.contains(image)) imageViews?.add(image);
}
function createView(source, p, { runtime, render, local, json, onFault }) {
  const element = document.createElement('div'),
    surface = document.createElement('div');
  element.className = 'lottie-view';
  element.dataset.lottieState = 'loading';
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', 'Lottie animation');
  Object.assign(element.style, {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  });
  Object.assign(surface.style, { width: '100%', height: '100%' });
  element.append(surface);
  let placeholder,
    animation,
    disposed = false,
    ready = false,
    detachController,
    observer;
  let visible = false,
    wantsPlay = p.autoplay ?? true,
    loopMode = p.loop ? 'loop' : 'playOnce',
    speed = p.speed ?? 1,
    direction = 1,
    progress = null;
  const lease = runtime.lottie.acquire(source, {
    local,
    json,
    policy: symbol(p.cachePolicy) || 'disk',
  });
  const report = (error) => {
    if (disposed) return;
    ready = false;
    animation?.destroy();
    animation = null;
    runtime.images.releaseChildren(element);
    element.dataset.lottieState = 'error';
    element.setAttribute('aria-label', `Lottie unavailable: ${error.message}`);
    surface.textContent = 'Animation unavailable';
    placeholder?.remove();
    onFault?.(error.message);
  };
  const sync = () => {
    if (!ready || disposed) return;
    const active =
      visible &&
      !document.hidden &&
      !element.closest('[aria-hidden="true"]') &&
      wantsPlay &&
      speed > 0;
    animation[active ? 'play' : 'pause']();
    element.dataset.lottieState = active ? 'playing' : 'paused';
  };
  const seek = (value) => {
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw Error('Lottie progress must be between 0 and 1.');
    progress = value;
    wantsPlay = false;
    if (ready) animation.goToAndStop(value * Math.max(0, animation.totalFrames - 1), true);
    sync();
  };
  const configureLoop = () => {
    if (!ready) return;
    animation.loop = loopMode === 'loop' || loopMode === 'loopReverse';
    animation.setDirection(direction);
  };
  const view = {
    element,
    command(name, value) {
      if (disposed) return;
      if (name === 'play') {
        wantsPlay = true;
        if (
          ready &&
          ((direction > 0 && animation.currentFrame >= animation.totalFrames - 1) ||
            (direction < 0 && animation.currentFrame <= 0))
        )
          animation.goToAndStop(direction > 0 ? 0 : animation.totalFrames - 1, true);
      }
      if (name === 'pause') wantsPlay = false;
      if (name === 'stop') {
        wantsPlay = false;
        progress = 0;
        if (ready) animation.goToAndStop(0, true);
      }
      if (name === 'progress') {
        seek(value);
        return;
      }
      if (name === 'speed') {
        speed = value;
        if (ready) animation.setSpeed(speed);
      }
      if (name === 'loopMode') {
        loopMode = value;
        direction = value === 'loopReverse' ? -1 : 1;
        configureLoop();
        if (ready && direction < 0 && animation.currentFrame === 0)
          animation.goToAndStop(animation.totalFrames - 1, true);
      }
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      detachController?.();
      animation?.destroy();
      runtime.images.releaseChildren(element);
      lease.release();
      element.replaceChildren();
      element.dataset.lottieState = 'disposed';
    },
  };
  try {
    if (p.controller != null) {
      if (!(p.controller instanceof PreviewLottieController))
        throw Error('Lottie.controller needs a LottieController.');
      detachController = p.controller.attach(view);
    }
    if (p.placeholder) {
      placeholder = render(p.placeholder);
      Object.assign(placeholder.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
      });
      element.append(placeholder);
    }
    observer = new IntersectionObserver((entries) => {
      visible = entries.at(-1)?.isIntersecting ?? false;
      sync();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
  } catch (error) {
    view.dispose();
    throw error;
  }
  Promise.all([lease.promise, player()])
    .then(([data, lottie]) => {
      if (disposed || runtime.disposed) return;
      if (data._previewCacheWarning) onFault?.(data._previewCacheWarning);
      const copy = structuredClone(data);
      delete copy._previewCacheWarning;
      animation = lottie.loadAnimation({
        container: surface,
        renderer: 'svg',
        autoplay: false,
        loop: loopMode === 'loop',
        animationData: copy,
        rendererSettings: {
          preserveAspectRatio: { contain: 'xMidYMid meet', cover: 'xMidYMid slice', fill: 'none' }[
            symbol(p.fit) || 'contain'
          ],
          progressiveLoad: true,
        },
      });
      animation.addEventListener('enterFrame', (event) => {
        element.dataset.lottieFrame = String(Math.round(event.currentTime * 10) / 10);
      });
      animation.addEventListener('complete', () => {
        if (disposed) return;
        if (loopMode === 'autoReverse' && wantsPlay) {
          direction *= -1;
          animation.setDirection(direction);
          animation.goToAndStop(direction > 0 ? 0 : animation.totalFrames - 1, true);
          sync();
        } else {
          wantsPlay = false;
          sync();
        }
      });
      animation.addEventListener('data_failed', () =>
        report(Error('Lottie player could not load the animation.')),
      );
      animation.addEventListener('error', () =>
        report(Error('Lottie player could not render this animation.')),
      );
      const loaded = () => {
        if (ready || disposed) return;
        ready = true;
        runtime.images.releaseChildren(placeholder ?? document.createElement('div'));
        placeholder?.remove();
        placeholder = null;
        animation.setSpeed(speed);
        configureLoop();
        if (progress !== null)
          animation.goToAndStop(progress * Math.max(0, animation.totalFrames - 1), true);
        else if (direction < 0) animation.goToAndStop(animation.totalFrames - 1, true);
        element.dataset.lottieFrames = String(animation.totalFrames);
        element.dataset.lottieFrame = String(animation.currentFrame);
        sync();
      };
      animation.addEventListener('DOMLoaded', loaded);
      if (animation.isLoaded) loaded();
    })
    .catch(report);
  return view;
}
