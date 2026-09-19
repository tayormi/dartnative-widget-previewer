import { durationMilliseconds, frameClock } from './preview-controllers.js';

// A request outlives the DOM view that renders it. Keep elapsed time and the
// original offset when a scroll listener causes that view to be rebuilt.
const timelines = new WeakMap();
const progress = (curve, t) =>
  curve === 'easeIn'
    ? t * t
    : curve === 'easeOut'
      ? 1 - (1 - t) ** 2
      : curve === 'easeInOut'
        ? t * t * (3 - 2 * t)
        : t;
export function startScrollMotion(request, { from, to, apply, finish, clock = frameClock }) {
  let timeline = timelines.get(request);
  if (!timeline) {
    timeline = { start: clock.now(), from };
    timelines.set(request, timeline);
  }
  const duration = durationMilliseconds(request.duration);
  let frame = null,
    cancelled = false;
  const tick = (now) => {
    frame = null;
    if (cancelled) return;
    const t = duration > 0 ? Math.max(0, Math.min(1, (now - timeline.start) / duration)) : 1;
    apply(timeline.from + (to - timeline.from) * progress(request.curve, t));
    if (cancelled) return;
    if (t >= 1) finish();
    else frame = clock.request(tick);
  };
  frame = clock.request(tick);
  return () => {
    cancelled = true;
    if (frame !== null) clock.cancel(frame);
    frame = null;
  };
}
