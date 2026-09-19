import { MapValue, cameraPosition, mapProperties } from './map-values.js';

export class PreviewMaps {
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.options = options;
    this.views = new Map();
    this.disposed = false;
  }
  configure(key, props, slot, mode) {
    const state = mapProperties(props);
    let view = this.views.get(key);
    if (!view) {
      view = { key, props, slot, state, ready: false, bridge: null, disposed: false };
      this.views.set(key, view);
    }
    view.props = props;
    view.slot = slot;
    view.state = state;
    view.mode = mode;
    if (view.bridge) view.bridge.update(state, mode);
    return view;
  }
  event(view, event) {
    if (this.disposed || view.disposed || this.views.get(view.key) !== view) return;
    if (event.type === 'error') {
      view.ready = false;
      return;
    }
    if (event.type === 'ready') {
      if (view.ready) return;
      view.ready = true;
      if (view.props.onMapReady) this.runtime.runAction(view.props.onMapReady, [], false);
    } else if (
      event.type === 'marker' &&
      view.mode === 'interact' &&
      view.state.markers.some((m) => m.id === event.id)
    ) {
      if (view.props.onMarkerTap) this.runtime.runAction(view.props.onMarkerTap, [event.id], false);
    } else if (event.type === 'camera') {
      const camera = new MapValue('CameraPosition', cameraPosition(event.camera));
      if (view.props.onCameraMove) this.runtime.runAction(view.props.onCameraMove, [camera], false);
    }
  }
  commit(root) {
    for (const view of this.views.values())
      if (root.contains(view.slot)) view.bridge?.attach(view.slot);
  }
  remove(key, view) {
    view.disposed = true;
    view.bridge?.dispose();
    this.views.delete(key);
  }
  finishFrame(keys) {
    for (const [key, view] of this.views) if (!keys.has(key)) this.remove(key, view);
  }
  dispose() {
    this.disposed = true;
    for (const [key, view] of this.views) this.remove(key, view);
  }
}
