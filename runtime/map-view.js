import { mapProperties } from './map-values.js';
import { validateMapsPreviewConfig } from './maps-preview-config.js';

export function mountMap(el, key, props, { runtime, mode, views }) {
  Object.assign(el.style, {
    width: '100%',
    height: '100%',
    position: 'relative',
    minWidth: '0',
    minHeight: '0',
  });
  el.dataset.expandWidth = 'true';
  el.dataset.expandHeight = 'true';
  mapProperties(props);
  if (mode === 'thumbnail') {
    const note = document.createElement('span');
    note.textContent = 'Google Maps · Open preview to interact';
    el.append(note);
    return;
  }
  views.add(key);
  const view = runtime.maps.configure(key, props, el, mode);
  if (!view.bridge) {
    view.bridge = createMapFrame(runtime.maps.options, el.ownerDocument, (event) =>
      runtime.maps.event(view, event),
    );
    view.bridge.update(view.state, mode);
  }
  // PreviewDOM commits connected moves before it removes the previous tree.
  // This also supports an initial render by other hosts that append directly.
  queueMicrotask(() => {
    if (!view.disposed && view.slot.isConnected) view.bridge.attach(view.slot);
  });
}
export function createMapFrame(options, document, emit) {
  const environment = document.defaultView,
    element = document.createElement('div'),
    notice = document.createElement('div');
  element.className = 'map-view';
  element.dataset.mapState = 'setup';
  Object.assign(element.style, {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: '#eef0f2',
  });
  Object.assign(notice.style, {
    position: 'absolute',
    inset: '0',
    display: 'grid',
    placeContent: 'center',
    padding: '32px',
    font: '14px/1.5 system-ui',
    color: '#333',
    textAlign: 'center',
    background: '#eef0f2',
  });
  notice.setAttribute('role', 'status');
  element.append(notice);
  let frame,
    port,
    state,
    mode,
    disposed = false,
    connected = false,
    timer,
    config;
  const message = (text, status) => {
    notice.textContent = text;
    notice.style.display = text ? 'grid' : 'none';
    element.dataset.mapState = status;
  };
  try {
    config = options.config ? validateMapsPreviewConfig(options.config) : null;
  } catch {
    message('The Google Maps settings are invalid. Update them in Preview services.', 'error');
  }
  if (!config)
    message('Add a Google Maps JavaScript API key in Preview services to load this map.', 'setup');
  else if (typeof element.moveBefore !== 'function')
    message(
      'This map preview needs a browser with state-preserving DOM moves. Update your browser to keep maps live during edits.',
      'unsupported',
    );
  else {
    frame = document.createElement('iframe');
    frame.title = 'Google Maps preview';
    frame.src = options.frameURL ?? '/api/map-preview';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    Object.assign(frame.style, { width: '100%', height: '100%', border: '0', display: 'block' });
    element.prepend(frame);
    message('Loading Google Maps…', 'loading');
    frame.onload = () => {
      if (disposed) return;
      port?.close();
      connected = false;
      const channel = new environment.MessageChannel();
      port = channel.port1;
      port.onmessage = (event) => {
        if (disposed) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'connected') {
          connected = true;
          clearTimeout(timer);
          port.postMessage({ type: 'update', state });
        } else if (data.type === 'error') {
          message(
            typeof data.message === 'string' ? data.message : 'Google Maps could not load.',
            'error',
          );
          emit({ type: 'error' });
        } else if (data.type === 'ready') {
          message('', 'ready');
          emit(data);
        } else if (data.type === 'camera' || data.type === 'marker') emit(data);
      };
      port.start();
      frame.contentWindow.postMessage(
        { type: 'native-lab-map-connect', config, state },
        environment.location.origin,
        [channel.port2],
      );
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!disposed && !connected)
          message('The map preview could not connect. Reload the preview to try again.', 'error');
      }, 10000);
    };
  }
  return {
    element,
    update(next, nextMode) {
      state = next;
      mode = nextMode;
      if (frame) frame.style.pointerEvents = mode === 'interact' ? 'auto' : 'none';
      if (connected) port.postMessage({ type: 'update', state });
    },
    attach(slot) {
      if (disposed || element.parentNode === slot) return;
      if (element.isConnected && slot.isConnected) slot.moveBefore(element, null);
      else slot.append(element);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      if (connected) port.postMessage({ type: 'dispose' });
      port?.close();
      if (frame) frame.onload = null;
      element.remove();
    },
  };
}
