import { PreviewNotifier } from './notifiers.js';
export class PreviewLottieController {
  constructor() {
    this.progress = new PreviewNotifier(0, 'double');
    this.view = null;
    this.disposed = false;
    this.listener = () => this.command('progress', this.progress.value);
    this.progress.addListener(this.listener);
  }
  read(name) {
    if (name === 'progress') return this.progress;
    throw Error(`Unsupported LottieController property: ${name}`);
  }
  attach(view) {
    if (this.disposed) throw Error('LottieController is disposed.');
    if (this.view && this.view !== view)
      throw Error('LottieController can only be attached to one animation.');
    this.view = view;
    if (this.progress.value !== 0) this.command('progress', this.progress.value);
    return () => {
      if (this.view === view) this.view = null;
    };
  }
  command(name, value) {
    if (!this.disposed) this.view?.command(name, value);
  }
  invoke(name, args, props = {}) {
    if (Object.keys(props).length)
      throw Error(`LottieController.${name} takes no named arguments.`);
    const counts = {
      play: 0,
      pause: 0,
      stop: 0,
      setProgress: 1,
      setSpeed: 1,
      setLoopMode: 1,
      dispose: 0,
    };
    if (!Object.hasOwn(counts, name) || args.length !== counts[name])
      throw Error(`Unsupported LottieController call: ${name}.`);
    if (name === 'dispose') {
      this.dispose();
      return null;
    }
    if (this.disposed) throw Error('LottieController is disposed.');
    if (name === 'setProgress') {
      const value = args[0];
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw Error('Lottie progress must be between 0 and 1.');
      this.progress.set(value);
      this.command('progress', value);
    } else if (name === 'setSpeed') {
      if (!Number.isFinite(args[0]) || args[0] < 0 || args[0] > 32)
        throw Error('Lottie speed must be between 0 and 32.');
      this.command('speed', args[0]);
    } else if (name === 'setLoopMode') {
      const mode = args[0]?.symbol?.split('.').at(-1);
      if (!['playOnce', 'loop', 'autoReverse', 'loopReverse'].includes(mode))
        throw Error('Invalid Lottie loop mode.');
      this.command('loopMode', mode);
    } else this.command(name);
    return null;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.view = null;
    this.progress.dispose();
  }
}
