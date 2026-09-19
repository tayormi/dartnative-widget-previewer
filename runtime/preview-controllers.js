import { PreviewChangeNotifier } from './reactive-state.js';
export function durationMilliseconds(duration) {
  const p = duration?.props || {};
  return (
    (p.days || 0) * 86400000 +
    (p.hours || 0) * 3600000 +
    (p.minutes || 0) * 60000 +
    (p.seconds || 0) * 1000 +
    (p.milliseconds || 0) +
    (p.microseconds || 0) / 1000
  );
}
export const frameClock = {
  now: () => performance.now(),
  request: (fn) =>
    globalThis.requestAnimationFrame
      ? requestAnimationFrame(fn)
      : setTimeout(() => fn(performance.now()), 16),
  cancel: (id) => (globalThis.cancelAnimationFrame ? cancelAnimationFrame(id) : clearTimeout(id)),
};
export function createStopwatch(clock = () => performance.now()) {
  let elapsed = 0,
    started = null;
  const micros = () =>
    Math.max(0, Math.floor((elapsed + (started === null ? 0 : clock() - started)) * 1000));
  return {
    start: () => {
      started ??= clock();
      return null;
    },
    stop: () => {
      if (started !== null) {
        elapsed += clock() - started;
        started = null;
      }
      return null;
    },
    reset: () => {
      elapsed = 0;
      if (started !== null) started = clock();
      return null;
    },
    get isRunning() {
      return started !== null;
    },
    get elapsedMilliseconds() {
      return Math.floor(micros() / 1000);
    },
    get elapsedMicroseconds() {
      return micros();
    },
    get elapsedTicks() {
      return micros();
    },
    get frequency() {
      return 1000000;
    },
    get elapsed() {
      return { valueType: 'Duration', args: [], props: { microseconds: micros() } };
    },
  };
}

export class PreviewScrollController extends PreviewChangeNotifier {
  constructor(graph, kind, props = {}) {
    super(graph);
    this.kind = kind;
    this.offset = props.initialScrollOffset ?? 0;
    this.contentHeight = 0;
    this.viewportHeight = 0;
    this.adapter = null;
    this.pendingCommand = null;
    this.position = {
      pixels: this.offset,
      maxScrollExtent: 0,
      viewportDimension: 0,
      isDragging: false,
    };
  }
  get hasClients() {
    return this.adapter !== null;
  }
  get remainingScroll() {
    return this.position.maxScrollExtent - this.offset;
  }
  read(name) {
    if (
      [
        'offset',
        'contentHeight',
        'viewportHeight',
        'remainingScroll',
        'hasClients',
        'position',
      ].includes(name)
    )
      return this[name];
    throw Error(`Unsupported ${this.kind} property: ${name}`);
  }
  attach(adapter) {
    if (this.disposed) throw Error('Scroll controller was disposed.');
    this.adapter = adapter;
    const command = this.activeCommand || this.pendingCommand;
    this.pendingCommand = null;
    if (command) adapter(command);
    return () => {
      if (this.adapter === adapter) this.adapter = null;
    };
  }
  update(offset, content, viewport, dragging = false) {
    const changed =
      offset !== this.offset || content !== this.contentHeight || viewport !== this.viewportHeight;
    this.offset = offset;
    this.contentHeight = content;
    this.viewportHeight = viewport;
    Object.assign(this.position, {
      pixels: offset,
      maxScrollExtent: Math.max(0, content - viewport),
      viewportDimension: viewport,
      isDragging: dragging,
    });
    if (changed) this.notifyListeners();
  }
  invoke(name, args, props) {
    const timing = () => {
      const fast = this.kind === 'FastListController',
        duration = props.duration ?? { props: { milliseconds: fast ? 400 : 300 } };
      let curve = props.curve?.symbol?.split('.').at(-1) || (fast ? 'easeInOut' : 'linear');
      const ms = durationMilliseconds(duration);
      if (!Number.isFinite(ms) || ms < 0 || ms > 60000)
        throw Error('Scroll animation duration must be between zero and 60 seconds.');
      if (!['linear', 'easeIn', 'easeOut', 'easeInOut'].includes(curve)) {
        if (fast) curve = 'easeInOut';
        else throw Error(`Scroll curve ${curve} needs another browser adapter.`);
      }
      return { duration, curve, timed: true };
    };
    if (['jumpTo', 'animateTo'].includes(name))
      return this.command({
        kind: 'offset',
        offset: args[0],
        animated: name === 'animateTo',
        ...(name === 'animateTo' ? timing() : {}),
      });
    if (['jumpToItem', 'scrollToItem', 'animateToItem'].includes(name)) {
      if (!Number.isInteger(args[0]) || args[0] < 0)
        throw Error('Item index must be a nonnegative integer.');
      return this.command({
        kind: 'item',
        index: args[0],
        alignment: props.alignment ?? 0,
        animated: name !== 'jumpToItem' && props.animated !== false,
        ...(name === 'animateToItem' ? timing() : { duration: props.duration }),
      });
    }
    if (name === 'scrollToBottom')
      return this.command({ kind: 'bottom', animated: props.animated !== false });
    throw Error(`Unsupported ${this.kind} method: ${name}`);
  }
  command(command) {
    if (this.disposed) throw Error('Scroll controller was disposed.');
    this.activeCommand = command;
    if (this.adapter) this.adapter(command);
    else this.pendingCommand = command;
    return null;
  }
  finish(command) {
    if (this.activeCommand === command) this.activeCommand = null;
  }
  cancelScroll() {
    this.activeCommand = null;
    this.pendingCommand = null;
  }
  dispose() {
    this.viewCleanup?.();
    this.viewCleanup = null;
    this.adapter = null;
    this.cancelScroll();
    super.dispose();
  }
}

export class PreviewAnimationController extends PreviewChangeNotifier {
  constructor(graph, props = {}, dispatch = (fn) => fn(), clock = frameClock) {
    super(graph);
    this.lowerBound = props.lowerBound ?? 0;
    this.upperBound = props.upperBound ?? 1;
    this._value = props.value ?? this.lowerBound;
    this.duration = props.duration;
    this.reverseDuration = props.reverseDuration;
    this.clock = clock;
    this.dispatch = dispatch;
    this.status = 'dismissed';
    this.isAnimating = false;
    this.statusListeners = new Set();
    this.frame = null;
    this.resolve = null;
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this.stop();
    this.setValue(value);
    this.setStatus(
      value <= this.lowerBound ? 'dismissed' : value >= this.upperBound ? 'completed' : this.status,
    );
  }
  setValue(value) {
    if (this.disposed) throw Error('Animation controller was disposed.');
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw Error('Animation value must be finite.');
    value = Math.max(this.lowerBound, Math.min(this.upperBound, value));
    if (value !== this._value) {
      this._value = value;
      this.notifyListeners();
    }
  }
  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    for (const fn of this.statusListeners) fn({ symbol: `AnimationStatus.${status}` });
  }
  read(name) {
    if (name === 'status') return { symbol: `AnimationStatus.${this.status}` };
    if (['value', 'isAnimating', 'lowerBound', 'upperBound', 'duration'].includes(name))
      return this[name];
    throw Error(`Unsupported animation property: ${name}`);
  }
  invoke(name, args, props) {
    if (name === 'addStatusListener') {
      this.statusListeners.add(args[0]);
      return null;
    }
    if (name === 'removeStatusListener') {
      this.statusListeners.delete(args[0]);
      return null;
    }
    if (name === 'stop') {
      this.stop();
      return null;
    }
    if (name === 'reset') {
      this.value = this.lowerBound;
      return null;
    }
    if (name === 'forward' || name === 'reverse') {
      if (props.from != null) this.value = props.from;
      return this.animate(
        name === 'forward' ? this.upperBound : this.lowerBound,
        name === 'reverse' ? this.reverseDuration || this.duration : this.duration,
      );
    }
    if (name === 'animateTo' || name === 'animateBack')
      return this.animate(args[0], props.duration, props.curve);
    if (name === 'repeat')
      return this.animate(props.max ?? this.upperBound, this.duration, null, {
        min: props.min ?? this.lowerBound,
        max: props.max ?? this.upperBound,
        reverse: !!props.reverse,
      });
    throw Error(`Unsupported animation method: ${name}`);
  }
  animate(target, duration, curve, repeat = null) {
    this.stop();
    const ms = durationMilliseconds(duration);
    let from = this.value,
      start = this.clock.now();
    if (ms <= 0) {
      if (repeat) throw Error('Repeating animations require a positive duration.');
      this.value = target;
      return Promise.resolve();
    }
    this.isAnimating = true;
    this.setStatus(target >= from ? 'forward' : 'reverse');
    const promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
    const frame = (now) => {
      if (this.disposed || !this.isAnimating) return;
      this.dispatch(() => {
        const t = Math.max(0, Math.min(1, (now - start) / ms)),
          curveName = curve?.symbol?.split('.').at(-1),
          progress =
            curveName === 'easeIn'
              ? t * t
              : curveName === 'easeOut'
                ? 1 - (1 - t) ** 2
                : curveName === 'easeInOut'
                  ? t * t * (3 - 2 * t)
                  : t;
        this.setValue(from + (target - from) * progress);
        if (t >= 1) {
          if (repeat) {
            if (repeat.reverse) {
              from = target;
              target = target === repeat.max ? repeat.min : repeat.max;
            } else {
              from = repeat.min;
              target = repeat.max;
              this.setValue(from);
            }
            start = now;
            this.setStatus(target >= from ? 'forward' : 'reverse');
          } else {
            this.isAnimating = false;
            this.setStatus(target <= this.lowerBound ? 'dismissed' : 'completed');
            this.resolve?.();
            this.resolve = null;
          }
        }
      });
      if (this.isAnimating) this.frame = this.clock.request(frame);
    };
    this.frame = this.clock.request(frame);
    return promise;
  }
  stop() {
    if (this.frame !== null) this.clock.cancel(this.frame);
    this.frame = null;
    this.isAnimating = false;
    this.resolve?.();
    this.resolve = null;
  }
  dispose() {
    this.stop();
    this.statusListeners.clear();
    super.dispose();
  }
}
