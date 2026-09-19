import { networkURL } from './preview-network.js';
import { durationMilliseconds } from './preview-controllers.js';
import { dartInvocation } from './dart-environment.js';
import { tutorialVideoRoute } from './tutorial-asset-urls.js';

export const videoValues = new Set([
  'VideoDataSource',
  'VideoDataSource.network',
  'VideoDataSource.file',
  'VideoCacheConfig',
]);
const symbol = (value) => value?.symbol?.split('.').at(-1);
const duration = (ms) => ({ valueType: 'Duration', args: [], props: { milliseconds: ms } });
export class PreviewVideoController {
  constructor(runtime, props) {
    this.runtime = runtime;
    this.environment = runtime.browserEnvironment;
    this.dataSource = props.dataSource;
    this.autoPlay = props.autoPlay ?? false;
    this.autoDispose = props.autoDispose ?? true;
    if (typeof this.autoPlay !== 'boolean' || typeof this.autoDispose !== 'boolean')
      throw Error('Video controller autoplay and disposal settings must be booleans.');
    this.volume = 1;
    this.speed = 1;
    this.looping = false;
    this.fit = { symbol: 'BoxFit.fill' };
    this.isInitialized = false;
    this.isPlaying = false;
    this.durationMs = 0;
    this.positionMs = 0;
    this.videoWidth = 0;
    this.videoHeight = 0;
    this.isDisposed = false;
    this.listeners = new Set();
    this.observers = new Set();
    this.eventListeners = new Set();
    this.cleanups = [];
    this.element = null;
    this.error = null;
    this.autoplayBlocked = false;
    this.started = false;
    this.playVersion = 0;
    this.wantsPlay = false;
    const listen = ([fn], options) => {
      if (typeof fn !== 'function') throw Error('Video events.listen needs a callback.');
      if (Object.keys(options).some((k) => !['onError', 'onDone', 'cancelOnError'].includes(k)))
        throw Error('Unsupported video subscription option.');
      const record = { fn, ...options, paused: false };
      this.eventListeners.add(record);
      return {
        cancel: () => {
          this.eventListeners.delete(record);
          return Promise.resolve();
        },
        pause: () => {
          record.paused = true;
        },
        resume: () => {
          record.paused = false;
        },
        get isPaused() {
          return record.paused;
        },
      };
    };
    this.events = {
      listen: Object.assign((...args) => listen(args, {}), { [dartInvocation]: listen }),
    };
    this.validateSource();
  }
  validateSource() {
    const source = this.dataSource;
    if (!videoValues.has(source?.valueType) || !source.valueType.startsWith('VideoDataSource'))
      throw Error('VideoPlayerController needs a VideoDataSource.');
    this.sourceType =
      source.valueType === 'VideoDataSource'
        ? symbol(source.args[0])
        : source.valueType.endsWith('.file')
          ? 'file'
          : 'network';
    this.source = source.args[source.valueType === 'VideoDataSource' ? 1 : 0];
    if (!['network', 'file', 'asset'].includes(this.sourceType) || typeof this.source !== 'string')
      throw Error('Unsupported video data source.');
    if (this.sourceType === 'network') networkURL(this.source);
    if (Object.keys(source.props.headers || {}).length)
      throw Error('Custom video request headers need another browser adapter.');
    const cache = source.props.cacheConfig;
    if (cache && cache.valueType !== 'VideoCacheConfig')
      throw Error('Video source needs a VideoCacheConfig.');
    // Native byte-range caches expose disk paths and eviction controls that an
    // HTML media element cannot implement. Never claim that HTTP caching is it.
    if ((cache?.props.useCache ?? this.sourceType === 'network') !== false)
      throw Error(
        'Native video caching is not implemented. Use VideoCacheConfig(useCache: false) for browser playback.',
      );
  }
  initialize() {
    if (this.isDisposed) throw Error('Video controller is disposed.');
    if (this.started) return;
    this.started = true;
    const document = this.environment.document;
    if (!document) return; // Structural validation has no decoder.
    const video = document.createElement('video');
    this.element = video;
    video.playsInline = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    video.setAttribute('aria-label', 'Video');
    video.disableRemotePlayback = true;
    video.volume = this.volume;
    video.playbackRate = this.speed;
    const on = (event, fn) => {
      video.addEventListener(event, fn);
      this.cleanups.push(() => video.removeEventListener(event, fn));
    };
    const metadata = () => {
      if (!Number.isFinite(video.duration) || video.duration < 0) {
        this.fail('This preview requires a video with a finite duration.');
        return;
      }
      const first = !this.isInitialized;
      this.isInitialized = true;
      this.durationMs = Math.round(video.duration * 1000);
      this.videoWidth = video.videoWidth;
      this.videoHeight = video.videoHeight;
      clearTimeout(this.timeout);
      if (first)
        this.emit('initialized', {
          durationMs: this.durationMs,
          width: this.videoWidth,
          height: this.videoHeight,
        });
      else this.notify();
      if (first && this.autoPlay) this.play();
    };
    on('loadedmetadata', metadata);
    on('durationchange', () => {
      if (video.readyState >= 1) metadata();
    });
    on('playing', () => {
      this.isPlaying = true;
      this.autoplayBlocked = false;
      this.error = null;
      this.emit('play');
    });
    on('pause', () => {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.emit('pause');
      }
    });
    on('ended', () => {
      this.isPlaying = false;
      this.wantsPlay = false;
      this.positionMs = this.durationMs;
      this.emit('completed');
    });
    on('timeupdate', () => {
      const next = Math.round(video.currentTime * 1000);
      if (next !== this.positionMs) {
        this.positionMs = next;
        this.notify();
      }
    });
    on('seeked', () => {
      this.positionMs = Math.round(video.currentTime * 1000);
      this.emit('seekComplete');
    });
    on('waiting', () => this.emit('bufferingStart'));
    on('canplay', () => this.emit('bufferingEnd'));
    on('progress', () => {
      const ranges = Array.from({ length: video.buffered.length }, (_, i) => ({
        record: [
          Math.round(video.buffered.start(i) * 1000),
          Math.round(video.buffered.end(i) * 1000),
        ],
        named: {},
      }));
      this.emit('bufferingUpdate', { bufferedRanges: ranges });
    });
    on('error', () =>
      this.fail(
        {
          1: 'Video loading was aborted.',
          2: 'Video download failed. The source must allow browser requests.',
          3: 'The browser could not decode this video.',
          4: 'The browser does not support this video source.',
        }[video.error?.code] || 'Video playback failed.',
      ),
    );
    this.timeout = setTimeout(
      () => this.fail('Video metadata did not load within 20 seconds.'),
      20000,
    );
    if (this.sourceType !== 'asset') this.loadSource();
  }
  loadSource(resolveAsset) {
    if (!this.element || this.loaded) return;
    let url =
      this.sourceType === 'asset'
        ? resolveAsset?.(this.source)
        : this.sourceType === 'file'
          ? this.runtime.services.fileURL({ path: this.source })
          : this.source;
    if (!url) {
      if (this.sourceType === 'asset' && !resolveAsset) return;
      this.fail('The video asset or selected file is missing.');
      return;
    }
    const route = this.sourceType === 'network' && tutorialVideoRoute(url);
    if (route && this.environment.location?.origin)
      url = new URL(route + '?cache=none', this.environment.location.origin).href;
    this.loaded = true;
    this.element.src = url;
    this.element.load();
  }
  notify() {
    if (this.isDisposed) return;
    for (const observer of [...this.observers]) observer();
    for (const listener of [...this.listeners])
      if (this.listeners.has(listener)) this.runtime.runAction(listener, [], false);
  }
  emit(type, fields = {}) {
    if (this.isDisposed) return;
    const event = {
      type: { symbol: `VideoEventType.${type}` },
      durationMs: null,
      width: null,
      height: null,
      bufferedRanges: null,
      errorMessage: null,
      ...fields,
    };
    for (const record of [...this.eventListeners])
      if (!record.paused && this.eventListeners.has(record)) {
        this.runtime.runAction(record.fn, [event], false);
        if (type === 'error' && record.cancelOnError) this.eventListeners.delete(record);
      }
    this.notify();
  }
  fail(message) {
    if (this.isDisposed) return;
    clearTimeout(this.timeout);
    this.error = message;
    this.wantsPlay = false;
    this.element?.pause();
    this.isPlaying = false;
    this.emit('error', { errorMessage: message });
  }
  play() {
    if (this.isDisposed) throw Error('Video controller is disposed.');
    if (!this.isInitialized || this.positionMs >= this.durationMs) return null;
    this.wantsPlay = true;
    const version = ++this.playVersion;
    Promise.resolve(this.element?.play()).catch((error) => {
      if (this.isDisposed || version !== this.playVersion) return;
      if (error.name === 'AbortError') return;
      this.isPlaying = false;
      this.wantsPlay = false;
      if (error.name === 'NotAllowedError') {
        this.autoplayBlocked = true;
        this.notify();
      } else this.fail(error.message);
    });
    return null;
  }
  pause() {
    this.playVersion++;
    this.wantsPlay = false;
    if (this.isInitialized) this.element?.pause();
    return null;
  }
  seek(position) {
    if (!this.isInitialized) return;
    const ms = durationMilliseconds(position);
    if (!Number.isFinite(ms)) throw Error('Video seek position must be finite.');
    this.element.currentTime = Math.max(0, Math.min(this.durationMs, ms)) / 1000;
    this.positionMs = Math.round(this.element.currentTime * 1000);
    this.notify();
  }
  read(name) {
    if (name === 'duration' || name === 'position') return duration(this[`${name}Ms`]);
    if (
      [
        'dataSource',
        'autoPlay',
        'autoDispose',
        'volume',
        'speed',
        'looping',
        'fit',
        'isInitialized',
        'isPlaying',
        'durationMs',
        'positionMs',
        'videoWidth',
        'videoHeight',
        'events',
        'isDisposed',
      ].includes(name)
    )
      return this[name];
    throw Error(`VideoPlayerController.${name} requires another browser adapter.`);
  }
  invoke(name, args, props = {}) {
    if (Object.keys(props).length)
      throw Error(`VideoPlayerController.${name} has no named arguments.`);
    if (name === 'dispose') {
      this.dispose();
      return null;
    }
    if (this.isDisposed) throw Error('Video controller is disposed.');
    if (name === 'initialize') {
      this.initialize();
      return null;
    }
    if (name === 'play') return this.play();
    if (name === 'pause') return this.pause();
    if (name === 'seekTo') {
      this.seek(args[0]);
      return null;
    }
    if (name === 'addListener') {
      if (typeof args[0] !== 'function') throw Error('Video listener must be a callback.');
      this.listeners.add(args[0]);
      return null;
    }
    if (name === 'removeListener') {
      this.listeners.delete(args[0]);
      return null;
    }
    if (name === 'setVolume') {
      if (!Number.isFinite(args[0])) throw Error('Video volume must be finite.');
      this.volume = Math.max(0, Math.min(1, args[0]));
      if (this.element) this.element.volume = this.volume;
      this.notify();
      return null;
    }
    if (name === 'setSpeed') {
      if (!Number.isFinite(args[0]) || args[0] < 0.25 || args[0] > 4)
        throw Error('Browser video speed must be between 0.25 and 4.');
      this.speed = args[0];
      if (this.element) this.element.playbackRate = this.speed;
      this.notify();
      return null;
    }
    if (name === 'setLooping') {
      if (typeof args[0] !== 'boolean') throw Error('Video looping needs a boolean.');
      this.looping = args[0];
      if (this.isInitialized) this.element.loop = this.looping;
      this.notify();
      return null;
    }
    if (name === 'setFit') {
      if (
        !['fill', 'contain', 'cover', 'fitWidth', 'fitHeight', 'none', 'scaleDown'].includes(
          symbol(args[0]),
        )
      )
        throw Error('Invalid video fit.');
      this.fit = args[0];
      this.notify();
      return null;
    }
    if (name === 'setHintAspectRatio') {
      if (!Number.isFinite(args[0]) || args[0] <= 0)
        throw Error('Video aspect ratio must be positive.');
      this.hintAspectRatio = args[0];
      return null;
    }
    throw Error(`VideoPlayerController.${name} requires another browser adapter.`);
  }
  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.playVersion++;
    this.wantsPlay = false;
    this.isPlaying = false;
    clearTimeout(this.timeout);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.element?.pause();
    this.element?.removeAttribute('src');
    this.element?.load();
    this.element = null;
    for (const record of this.eventListeners)
      if (record.onDone) this.runtime.runAction(record.onDone, [], false);
    this.listeners.clear();
    this.observers.clear();
    this.eventListeners.clear();
  }
}
export class PreviewVideos {
  constructor(runtime) {
    this.runtime = runtime;
    this.controllers = new Set();
    this.views = new Map();
  }
  create(props) {
    const controller = new PreviewVideoController(this.runtime, props);
    this.controllers.add(controller);
    return controller;
  }
  finishFrame(keys) {
    for (const [key, view] of this.views)
      if (!keys.has(key)) {
        view.dispose();
        this.views.delete(key);
      }
    for (const controller of this.controllers)
      if (controller.isDisposed) this.controllers.delete(controller);
  }
  dispose() {
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
    for (const c of this.controllers) c.dispose();
    this.controllers.clear();
  }
}
