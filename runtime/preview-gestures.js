// Gesture sessions outlive an individual DOM render. Controller notifications
// can rebuild a Dart widget during a drag without losing its pointer stream.
export function gesturePosition(element, event, rect = element.getBoundingClientRect()) {
  const sx = rect.width ? element.offsetWidth / rect.width : 1,
    sy = rect.height ? element.offsetHeight / rect.height : sx;
  const phone = element.getRootNode().querySelector?.('.phone')?.getBoundingClientRect() || {
    left: 0,
    top: 0,
  };
  return {
    localPosition: { dx: (event.clientX - rect.left) * sx, dy: (event.clientY - rect.top) * sy },
    globalPosition: { dx: (event.clientX - phone.left) * sx, dy: (event.clientY - phone.top) * sy },
    scaleX: sx,
    scaleY: sy,
  };
}
export class PreviewGestures {
  constructor(runtime) {
    this.runtime = runtime;
    this.records = new Map();
    this.active = null;
  }
  mount(element, key, props, mode) {
    let record = this.records.get(key);
    if (!record) {
      record = { key, timer: null };
      this.records.set(key, record);
    }
    Object.assign(record, { element, props, mode });
    if (mode !== 'interact') return;
    const pans = props.onPanStart || props.onPanUpdate || props.onPanEnd || props.onPanCancel;
    if (!pans && !props.onTap && !props.onDoubleTap && !props.onTapDown && !props.onTapUp) return;
    element.style.pointerEvents = 'auto';
    if (pans) element.style.touchAction = 'none';
    if (props.onTap || props.onDoubleTap) {
      element.style.cursor = 'pointer';
      element.tabIndex = 0;
      element.setAttribute('role', 'button');
      element.addEventListener('keydown', (event) => {
        if (event.target === element && ['Enter', ' '].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          this.tap(record);
        }
      });
    }
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.isPrimary === false || this.active) return;
      event.stopPropagation();
      if (pans) event.preventDefault();
      const rect = element.getBoundingClientRect(),
        position = gesturePosition(element, event, rect),
        session = {
          record,
          pointer: event.pointerId,
          rect,
          last: position,
          start: position,
          lastTime: event.timeStamp,
          pan: false,
          velocity: { dx: 0, dy: 0 },
        };
      this.active = session;
      const target = element.ownerDocument;
      const move = (e) => {
        if (e.pointerId !== session.pointer || this.active !== session) return;
        e.preventDefault();
        const current = gesturePosition(
            record.element,
            e,
            record.element.isConnected ? undefined : rect,
          ),
          delta = {
            dx: current.globalPosition.dx - session.last.globalPosition.dx,
            dy: current.globalPosition.dy - session.last.globalPosition.dy,
          };
        if (
          pans &&
          !session.pan &&
          Math.hypot(
            current.globalPosition.dx - session.start.globalPosition.dx,
            current.globalPosition.dy - session.start.globalPosition.dy,
          ) >= 6
        ) {
          session.pan = true;
          clearTimeout(record.timer);
          this.dispatch(record, 'onTapCancel');
          this.dispatch(record, 'onPanStart', { ...current, pointerCount: 1 });
        }
        const elapsed = Math.max(1, e.timeStamp - session.lastTime);
        session.velocity = { dx: (delta.dx * 1000) / elapsed, dy: (delta.dy * 1000) / elapsed };
        session.last = current;
        session.lastTime = e.timeStamp;
        if (session.pan && this.active === session)
          this.dispatch(record, 'onPanUpdate', {
            ...current,
            delta,
            primaryDelta: null,
            pointerCount: 1,
          });
      };
      const end = (e, cancelled = false) => {
        if (e.pointerId !== session.pointer || this.active !== session) return;
        cleanup();
        this.active = null;
        if (session.pan)
          this.dispatch(
            record,
            cancelled ? 'onPanCancel' : 'onPanEnd',
            cancelled
              ? undefined
              : { velocity: { pixelsPerSecond: session.velocity }, primaryVelocity: null },
          );
        else if (cancelled) this.dispatch(record, 'onTapCancel');
        else {
          this.dispatch(
            record,
            'onTapUp',
            gesturePosition(record.element, e, record.element.isConnected ? undefined : rect),
          );
          this.tap(record);
        }
      };
      const up = (e) => end(e),
        cancel = (e) => end(e, true),
        cleanup = () => {
          target.removeEventListener('pointermove', move, { capture: true });
          target.removeEventListener('pointerup', up, { capture: true });
          target.removeEventListener('pointercancel', cancel, { capture: true });
        };
      session.cleanup = cleanup;
      target.addEventListener('pointermove', move, { capture: true, passive: false });
      target.addEventListener('pointerup', up, true);
      target.addEventListener('pointercancel', cancel, true);
      this.dispatch(record, 'onTapDown', position);
    });
    // Prevent a gesture's synthesized click from triggering a parent action.
    element.addEventListener('click', (e) => e.stopPropagation());
  }
  dispatch(record, name, details) {
    const fn = record.props[name];
    if (fn) this.runtime.action(fn, ...(details === undefined ? [] : [details]));
  }
  tap(record) {
    if (record.props.onDoubleTap) {
      if (record.timer) {
        clearTimeout(record.timer);
        record.timer = null;
        this.dispatch(record, 'onDoubleTap');
      } else
        record.timer = setTimeout(() => {
          record.timer = null;
          this.dispatch(record, 'onTap');
        }, 280);
    } else this.dispatch(record, 'onTap');
  }
  drop(key, record) {
    clearTimeout(record.timer);
    if (this.active?.record === record) {
      this.active.cleanup?.();
      this.active = null;
    }
    this.records.delete(key);
  }
  finishFrame(keys) {
    for (const [key, record] of this.records) if (!keys.has(key)) this.drop(key, record);
  }
  dispose() {
    for (const [key, record] of this.records) this.drop(key, record);
  }
}
