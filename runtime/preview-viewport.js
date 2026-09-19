import { PreviewNotifier } from './notifiers.js';
const orientations = ['portraitUp', 'portraitDown', 'landscapeLeft', 'landscapeRight'];
const value = (name) => ({ symbol: `DeviceOrientation.${name}` });
export class PreviewViewport {
  constructor(runtime) {
    this.runtime = runtime;
    this.physical = 'portraitUp';
    this.preferred = [...orientations];
    this.current = 'portraitUp';
    this.currentNotifier = new PreviewNotifier(value(this.physical));
    this.metricsNotifier = new PreviewNotifier(0);
  }
  get landscape() {
    return this.current.startsWith('landscape');
  }
  get size() {
    if (this.fixtureMetrics) return this.fixtureMetrics.size;
    return this.landscape ? { width: 874, height: 402 } : { width: 402, height: 874 };
  }
  get padding() {
    if (this.fixtureMetrics) return this.fixtureMetrics.padding;
    return this.landscape
      ? { top: 0, bottom: 21, left: 62, right: 62 }
      : { top: 62, bottom: 34, left: 0, right: 0 };
  }
  // An isolated widget's MediaQuery must describe its preview surface.
  // Browser zoom scales that surface visually without changing logical points.
  setFixtureMetrics({ width, height, fullScreen = false }) {
    if (![width, height].every((n) => Number.isFinite(n) && n > 0))
      throw Error('Preview dimensions must be positive finite numbers.');
    this.fixtureMetrics = {
      size: { width, height },
      padding: { top: fullScreen ? 62 : 0, bottom: fullScreen ? 34 : 0, left: 0, right: 0 },
    };
    this.physical = width > height ? 'landscapeLeft' : 'portraitUp';
    this.current = this.physical;
    this.metricsNotifier.set(this.metricsNotifier.value + 1);
    this.currentNotifier.set(value(this.physical));
  }
  rotate() {
    this.setPhysical(this.physical.startsWith('portrait') ? 'landscapeLeft' : 'portraitUp');
  }
  setPhysical(name) {
    if (!orientations.includes(name)) throw Error('Unknown device orientation.');
    this.physical = name;
    this.update();
    this.currentNotifier.set(value(name));
  }
  setPreferred(values) {
    if (
      !Array.isArray(values) ||
      values.some((v) => !orientations.includes(v?.symbol?.split('.').at(-1)))
    )
      throw Error('Expected a list of DeviceOrientation values.');
    this.preferred = values.length
      ? [...new Set(values.map((v) => v.symbol.split('.').at(-1)))]
      : [...orientations];
    this.update();
  }
  update() {
    const next = this.preferred.includes(this.physical)
      ? this.physical
      : this.preferred.includes(this.current)
        ? this.current
        : this.preferred[0];
    if (next !== this.current) {
      this.current = next;
      this.metricsNotifier.set(this.metricsNotifier.value + 1);
      this.runtime.scheduleChange();
    }
  }
  read(name) {
    if (name === 'DeviceOrientation.values') return orientations.map(value);
    if (name === 'DeviceOrientationListener.current') return value(this.physical);
    if (name === 'DeviceOrientationListener.currentNotifier') return this.currentNotifier;
    return undefined;
  }
  dispose() {
    this.currentNotifier.dispose();
    this.metricsNotifier.dispose();
  }
}
