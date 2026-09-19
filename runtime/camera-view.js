import { PreviewCameraController } from './preview-camera.js';
export function mountCamera(el, key, props, { runtime, mode, views }) {
  const controller = props.controller;
  if (!(controller instanceof PreviewCameraController))
    throw Error('CameraPreview needs a CameraController.');
  if (controller.disposed) throw Error('The camera controller is disposed.');
  key = controller;
  if (views.has(key)) throw Error('One camera controller can have one preview view.');
  views.add(key);
  let view = runtime.camera.views.get(key);
  if (view && view.controller !== controller) {
    view.dispose();
    runtime.camera.views.delete(key);
    view = null;
  }
  if (!view) {
    if ([...runtime.camera.views.values()].some((v) => v.controller === controller && !v.disposed))
      throw Error('One camera controller can have one preview view.');
    view = create(controller);
    runtime.camera.views.set(key, view);
  }
  view.configure(props, mode);
  el.append(view.element);
  Object.assign(el.style, {
    width: '100%',
    height: '100%',
    position: 'relative',
    minWidth: '0',
    minHeight: '0',
  });
  el.dataset.expandWidth = 'true';
  el.dataset.expandHeight = 'true';
}
function create(controller) {
  const document = controller.environment.document,
    element = document.createElement('div'),
    notice = document.createElement('div');
  element.className = 'camera-view';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Camera preview');
  Object.assign(element.style, {
    width: '100%',
    height: '100%',
    background: '#000',
    position: 'relative',
    overflow: 'clip',
    touchAction: 'none',
  });
  notice.setAttribute('role', 'status');
  Object.assign(notice.style, {
    position: 'absolute',
    bottom: '12px',
    left: '12px',
    right: '12px',
    color: '#fff',
    background: '#0008',
    font: '12px system-ui',
    textAlign: 'center',
    padding: '6px',
    pointerEvents: 'none',
  });
  element.append(notice);
  let props = {},
    mode = 'interact',
    pointers = new Map(),
    initialDistance = 0,
    initialZoom = 1,
    dragged = false,
    noticeTimer;
  const message = (error) => {
    notice.textContent = error.message;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      notice.hidden = true;
    }, 5000);
  };
  function update() {
    if (view.disposed) return;
    const video = controller.video;
    if (video && video.parentNode !== element) {
      element.prepend(video);
      Object.assign(video.style, {
        width: '100%',
        height: '100%',
        display: 'block',
        objectFit: 'cover',
        pointerEvents: 'none',
      });
    }
    if (video)
      video.style.transform =
        controller.description.lensDirection.symbol === 'CameraLensDirection.front'
          ? 'scaleX(-1)'
          : '';
    element.dataset.cameraState = controller.isInitialized ? 'ready' : 'initializing';
    element.dataset.cameraWidth = String(video?.videoWidth ?? 0);
    element.dataset.cameraHeight = String(video?.videoHeight ?? 0);
  }
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  element.addEventListener('pointerdown', (event) => {
    if (mode !== 'interact') return;
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    });
    if (pointers.size === 1) dragged = false;
    if (pointers.size === 2) {
      initialDistance = distance();
      initialZoom = controller.track?.getSettings?.().zoom ?? 1;
      dragged = true;
    }
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', (event) => {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    if (Math.hypot(event.clientX - p.startX, event.clientY - p.startY) > 5) dragged = true;
    p.x = event.clientX;
    p.y = event.clientY;
    if (pointers.size === 2 && props.enablePinchToZoom !== false && initialDistance) {
      controller
        .zoom(Math.max(1, Math.min(8, (initialZoom * distance()) / initialDistance)))
        .catch(message);
    }
  });
  element.addEventListener('pointerup', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const tap = pointers.size === 1 && !dragged;
    pointers.delete(event.pointerId);
    if (tap && props.enableTapToFocus !== false) {
      const point = cameraFocusPoint(
        element.getBoundingClientRect(),
        controller.video,
        controller.description.lensDirection.symbol === 'CameraLensDirection.front',
        event.clientX,
        event.clientY,
      );
      controller.focus(point.x, point.y).catch(message);
    }
  });
  element.addEventListener('pointercancel', (event) => pointers.delete(event.pointerId));
  const view = {
    controller,
    element,
    disposed: false,
    configure(next, nextMode) {
      props = next;
      mode = nextMode;
      update();
    },
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      clearTimeout(noticeTimer);
      controller.observers.delete(update);
      pointers.clear();
      element.remove();
    },
  };
  controller.observers.add(update);
  notice.hidden = true;
  return view;
}
export function cameraFocusPoint(rect, video, mirrored, clientX, clientY) {
  const width = video.videoWidth,
    height = video.videoHeight,
    scale = Math.max(rect.width / width, rect.height / height),
    visibleWidth = rect.width / scale,
    visibleHeight = rect.height / scale;
  let x = ((width - visibleWidth) / 2 + (clientX - rect.left) / scale) / width;
  const y = ((height - visibleHeight) / 2 + (clientY - rect.top) / scale) / height;
  if (mirrored) x = 1 - x;
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}
