import { durationMilliseconds } from './preview-controllers.js';
const options = new WeakMap();
const properties = [
  'width',
  'height',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'backgroundColor',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'boxShadow',
];
const curves = {
  linear: 'linear',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
  easeInCubic: 'cubic-bezier(.32,0,.67,0)',
  easeOutCubic: 'cubic-bezier(.33,1,.68,1)',
  easeInOutCubic: 'cubic-bezier(.65,0,.35,1)',
  easeOutBack: 'cubic-bezier(.34,1.56,.64,1)',
  fastOutSlowIn: 'ease-in-out',
  decelerate: 'ease-out',
};
export function implicitTiming(props) {
  const duration = durationMilliseconds(props.duration),
    curve = props.curve?.symbol?.split('.').at(-1) || 'linear';
  if (!Number.isFinite(duration) || duration < 0 || duration > 60000)
    throw Error('AnimatedContainer duration must be between zero and 60 seconds.');
  if (!curves[curve])
    throw Error(`AnimatedContainer curve ${curve} needs another browser adapter.`);
  return { duration, easing: curves[curve] };
}
export function markImplicit(el, key, props) {
  el.dataset.implicitKey = key;
  options.set(el, { ...implicitTiming(props), onEnd: props.onEnd });
}
const paint = (el) => {
  const style = getComputedStyle(el);
  return Object.fromEntries(properties.map((p) => [p, style[p]]));
};
const signature = (el) => JSON.stringify(properties.map((p) => el.style[p]));
export class PreviewImplicitAnimations {
  constructor() {
    this.runtime = null;
    this.epoch = null;
    this.route = null;
    this.records = new Map();
    this.cleanup = null;
  }
  dispose() {
    for (const record of this.records.values()) record.animation?.cancel();
    this.records.clear();
    if (this.cleanup) this.runtime?.cleanups.delete(this.cleanup);
    this.cleanup = null;
  }
  before(root, runtime, route) {
    const same = this.runtime === runtime && this.epoch === runtime.epoch && this.route === route,
      old = new Map();
    if (same)
      for (const el of root.querySelectorAll('[data-implicit-key]')) {
        const record = this.records.get(el.dataset.implicitKey);
        old.set(el.dataset.implicitKey, {
          signature: signature(el),
          current: paint(el),
          record,
          time: record?.animation?.currentTime ?? 0,
        });
      }
    this.dispose();
    this.runtime = runtime;
    this.epoch = runtime.epoch;
    this.route = route;
    return () => {
      for (const el of root.querySelectorAll('[data-implicit-key]')) {
        const key = el.dataset.implicitKey,
          props = options.get(el),
          previous = old.get(key);
        if (!props || !previous) continue;
        const unchanged = signature(el) === previous.signature,
          continuing = unchanged && previous.record?.animation;
        if (unchanged && !continuing) continue;
        const target = paint(el),
          frames = continuing ? previous.record.frames : [previous.current, target];
        const timing = continuing
          ? previous.record.timing
          : { duration: props.duration, easing: props.easing };
        const record = { el, frames, timing, onEnd: props.onEnd, animation: null };
        this.records.set(key, record);
        const complete = () => {
          if (this.records.get(key) !== record || runtime.disposed) return;
          record.animation?.cancel();
          record.animation = null;
          this.records.delete(key);
          el.dataset.implicitState = 'finished';
          if (!this.records.size && this.cleanup) {
            runtime.cleanups.delete(this.cleanup);
            this.cleanup = null;
          }
          if (record.onEnd) runtime.action(record.onEnd);
        };
        if (
          timing.duration === 0 ||
          runtime.browserEnvironment.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ) {
          queueMicrotask(complete);
          continue;
        }
        record.animation = el.animate(frames, { ...timing, fill: 'both' });
        el.dataset.implicitState = 'running';
        if (continuing) record.animation.currentTime = previous.time;
        record.animation.finished.then(complete, () => {});
      }
      if (this.records.size) {
        const cleanup = () => this.dispose();
        this.cleanup = cleanup;
        runtime.cleanups.add(cleanup);
      }
    };
  }
}
