import { PreviewVideoController } from './preview-video.js';
import { iconSvg } from './platform.js';
const symbol = (value) => value?.symbol?.split('.').at(-1);
const time = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export function mountVideo(el, key, name, p, { runtime, mode, views, resolveAsset, onFault }) {
  const controller = p.controller;
  if (!(controller instanceof PreviewVideoController))
    throw Error(`${name} needs a VideoPlayerController.`);
  if (controller.isDisposed) throw Error('The video controller is disposed.');
  views.add(key);
  let view = runtime.videos.views.get(key);
  if (view && (view.controller !== controller || view.name !== name)) {
    view.dispose();
    runtime.videos.views.delete(key);
    view = null;
  }
  if (!view) {
    view = createView(controller, name, { runtime, resolveAsset, onFault });
    runtime.videos.views.set(key, view);
  }
  const others = [...runtime.videos.views.values()].filter(
    (v) => v !== view && v.controller === controller && !v.disposed,
  );
  if (others.length) throw Error('One video controller can only have one mounted playback view.');
  view.configure(p, mode);
  el.append(view.element);
  el.dataset.expandWidth = 'true';
  el.style.width = '100%';
  el.style.minWidth = '0';
  if (name === 'VideoPlayerWithControls') {
    el.style.height = '100%';
    el.dataset.expandHeight = 'true';
  } else {
    el.style.aspectRatio = String(p.aspectRatio ?? 16 / 9);
    el.style.position = 'relative';
  }
  view.mounted();
}
function createView(controller, name, { runtime, resolveAsset, onFault }) {
  controller.initialize();
  controller.loadSource(resolveAsset);
  const element = document.createElement('div'),
    stage = document.createElement('div'),
    notice = document.createElement('div');
  element.className = 'video-view';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Video player');
  Object.assign(element.style, {
    position: 'relative',
    width: '100%',
    height: '100%',
    background: '#000',
    color: '#fff',
    minWidth: '0',
    minHeight: '0',
    overflow: 'hidden',
  });
  stage.className = 'video-stage';
  Object.assign(stage.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  element.append(stage, notice);
  if (controller.element) {
    Object.assign(controller.element.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      background: '#000',
    });
    stage.append(controller.element);
  }
  Object.assign(notice.style, {
    position: 'absolute',
    inset: 'auto 12px 12px',
    fontSize: '12px',
    textAlign: 'center',
    pointerEvents: 'none',
  });
  notice.setAttribute('role', 'status');
  let props = {},
    mode = 'interact',
    controls = null,
    playButton = null,
    slider = null,
    position = null,
    remaining = null,
    transport = null,
    shown = true,
    hideTimer,
    dragging = false,
    lastLandscape = null,
    lastPlaying = false;
  const button = (label, icon, fn, size = 40) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    Object.assign(b.style, {
      border: '0',
      color: '#fff',
      background: 'transparent',
      borderRadius: '50%',
      width: `${size}px`,
      height: `${size}px`,
      padding: '8px',
      display: 'grid',
      placeItems: 'center',
      cursor: 'pointer',
    });
    b.append(iconSvg(icon, 'ios'));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mode === 'interact') {
        fn();
        show();
      }
    });
    return b;
  };
  const toggle = () => {
    if (controller.isPlaying) controller.pause();
    else {
      if (controller.durationMs > 0 && controller.positionMs >= controller.durationMs)
        controller.seek({ props: { milliseconds: 0 } });
      controller.play();
    }
  };
  const show = () => {
    shown = true;
    if (transport) {
      transport.style.opacity = '1';
      transport.inert = false;
      transport.style.pointerEvents = 'auto';
    }
    clearTimeout(hideTimer);
    if (controller.isPlaying && mode === 'interact')
      hideTimer = setTimeout(() => {
        if (!controller.isPlaying || dragging) return;
        shown = false;
        if (transport) {
          transport.style.opacity = '0';
          transport.inert = true;
          transport.style.pointerEvents = 'none';
        }
      }, 3000);
  };
  function buildControls() {
    controls?.remove();
    playButton = slider = position = remaining = transport = null;
    if (name !== 'VideoPlayerWithControls') return;
    const landscape = runtime.viewport.landscape,
      bottom = !landscape && symbol(props.controlsMode) === 'bottomBar';
    lastLandscape = landscape;
    controls = document.createElement('div');
    Object.assign(controls.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    element.append(controls);
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'absolute',
      bottom: '0',
      left: '0',
      right: '0',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px',
      height: '64px',
      background: bottom ? '#000' : 'linear-gradient(transparent,#0008)',
      pointerEvents: 'auto',
    });
    playButton = button(
      'Play video',
      symbol(props.playIcon) || 'play_arrow',
      toggle,
      bottom ? 40 : 64,
    );
    if (bottom) bar.append(playButton);
    else {
      transport = document.createElement('div');
      Object.assign(transport.style, {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        pointerEvents: 'none',
      });
      const back = button(
          'Rewind 10 seconds',
          symbol(props.rewindIcon) || 'fast_rewind',
          () => controller.seek({ props: { milliseconds: controller.positionMs - 10000 } }),
          48,
        ),
        forward = button(
          'Forward 10 seconds',
          symbol(props.forwardIcon) || 'fast_forward',
          () => controller.seek({ props: { milliseconds: controller.positionMs + 10000 } }),
          48,
        );
      for (const b of [back, playButton, forward]) {
        b.style.background = '#0008';
        b.style.pointerEvents = 'auto';
        transport.append(b);
      }
      controls.append(transport);
    }
    position = document.createElement('span');
    remaining = document.createElement('span');
    for (const label of [position, remaining])
      Object.assign(label.style, {
        fontSize: '13px',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      });
    slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '1';
    slider.setAttribute('aria-label', 'Video progress');
    Object.assign(slider.style, {
      width: '100%',
      minWidth: '0',
      height: '44px',
      accentColor: '#fafafa',
      cursor: 'pointer',
    });
    slider.onpointerdown = () => {
      dragging = true;
      clearTimeout(hideTimer);
    };
    slider.oninput = () => {
      if (mode === 'interact') {
        controller.seek({ props: { milliseconds: Number(slider.value) } });
        show();
      }
    };
    slider.onchange = () => {
      dragging = false;
      show();
    };
    slider.onpointercancel = () => {
      dragging = false;
      show();
    };
    bar.append(position, slider, remaining);
    controls.append(bar);
    if (landscape && props.onExitFullScreen) {
      const exit = button('Exit fullscreen', symbol(props.minimizeIcon) || 'fullscreen_exit', () =>
        runtime.action(props.onExitFullScreen),
      );
      Object.assign(exit.style, {
        position: 'absolute',
        top: '12px',
        left: '12px',
        background: '#0006',
        pointerEvents: 'auto',
      });
      controls.append(exit);
    }
    if (!landscape && props.onExpandFullScreen)
      bar.append(
        button('Enter fullscreen', symbol(props.expandIcon) || 'fullscreen', () =>
          runtime.action(props.onExpandFullScreen),
        ),
      );
    show();
  }
  function sizeVideo() {
    const video = controller.element;
    if (!video) return;
    const sourceRatio =
      controller.videoWidth && controller.videoHeight
        ? controller.videoWidth / controller.videoHeight
        : 16 / 9;
    const ratio = props.aspectRatio ?? (name === 'VideoPlayerWithControls' ? sourceRatio : 16 / 9),
      w = stage.clientWidth,
      h = stage.clientHeight;
    if (w && h) {
      const width = Math.min(w, h * ratio);
      video.style.width = `${width}px`;
      video.style.height = `${width / ratio}px`;
    }
    const fit = symbol(props.fit ?? controller.fit) || 'fill';
    video.style.objectFit =
      fit === 'fitWidth'
        ? ratio > sourceRatio
          ? 'cover'
          : 'contain'
        : fit === 'fitHeight'
          ? ratio < sourceRatio
            ? 'cover'
            : 'contain'
          : fit === 'scaleDown'
            ? 'scale-down'
            : fit;
    if (name === 'VideoPlayerWithControls') video.style.objectFit = 'contain';
  }
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(sizeVideo) : null;
  resize?.observe(stage);
  function update() {
    if (view.disposed) return;
    const video = controller.element;
    if (video) {
      video.controls = name === 'VideoPlayer' && props.showControls === true && mode === 'interact';
      sizeVideo();
    }
    element.dataset.videoState = controller.error
      ? 'error'
      : controller.autoplayBlocked
        ? 'awaiting-play'
        : !controller.isInitialized
          ? 'loading'
          : controller.isPlaying
            ? 'playing'
            : 'paused';
    element.dataset.videoPosition = String(controller.positionMs);
    element.dataset.videoDuration = String(controller.durationMs);
    notice.textContent =
      controller.error ||
      (!controller.isInitialized
        ? 'Loading video…'
        : controller.autoplayBlocked
          ? 'Tap play to start video.'
          : '');
    notice.style.bottom = name === 'VideoPlayerWithControls' ? '72px' : '12px';
    if (controller.error) onFault?.(controller.error);
    if (slider) {
      slider.disabled = mode !== 'interact' || !controller.isInitialized;
      slider.max = String(controller.durationMs || 1);
      if (!dragging) slider.value = String(controller.positionMs);
      slider.setAttribute(
        'aria-valuetext',
        `${time(controller.positionMs)} of ${time(controller.durationMs)}`,
      );
      position.textContent = time(controller.positionMs);
      remaining.textContent = '−' + time(controller.durationMs - controller.positionMs);
    }
    if (playButton) {
      const label = controller.isPlaying ? 'Pause video' : 'Play video';
      if (playButton.getAttribute('aria-label') !== label) {
        playButton.setAttribute('aria-label', label);
        playButton.replaceChildren(
          iconSvg(
            symbol(controller.isPlaying ? props.pauseIcon : props.playIcon) ||
              (controller.isPlaying ? 'pause' : 'play_arrow'),
            'ios',
          ),
        );
      }
      playButton.disabled = !controller.isInitialized || mode !== 'interact';
    }
    if (controller.isPlaying !== lastPlaying) {
      lastPlaying = controller.isPlaying;
      show();
    } else if (!controller.isPlaying && !shown) show();
  }
  const view = {
    element,
    controller,
    name,
    disposed: false,
    configure(next, nextMode) {
      const changed =
        lastLandscape !== runtime.viewport.landscape ||
        symbol(props.controlsMode) !== symbol(next.controlsMode);
      props = next;
      mode = nextMode;
      if (name === 'VideoPlayer' && next.fit && symbol(next.fit) !== symbol(controller.fit))
        controller.invoke('setFit', [next.fit]);
      if (name === 'VideoPlayerWithControls') {
        stage.style.top =
          symbol(next.centeringMode) === 'relative' ? `${next.topBarHeight ?? 0}px` : '0';
        if (!controls || changed) buildControls();
      }
      update();
    },
    mounted() {
      queueMicrotask(() => {
        if (
          !view.disposed &&
          element.isConnected &&
          controller.wantsPlay &&
          controller.element?.paused
        )
          controller.play();
      });
    },
    dispose() {
      if (view.disposed) return;
      view.disposed = true;
      resize?.disconnect();
      clearTimeout(hideTimer);
      controller.observers.delete(update);
      element.remove();
      if (controller.autoDispose) controller.dispose();
    },
  };
  element.addEventListener('click', () => {
    if (mode === 'interact' && name === 'VideoPlayerWithControls') show();
  });
  controller.observers.add(update);
  return view;
}
