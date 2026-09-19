import { PreviewEventStream } from './preview-events.js';
import { durationMilliseconds } from './preview-controllers.js';

const duration = (milliseconds) => ({ valueType: 'Duration', args: [], props: { milliseconds } });
export class PreviewFileAudioPlayer {
  constructor(owner) {
    this.owner = owner;
    this.runtime = owner.runtime;
    this.environment = this.runtime.browserEnvironment;
    this.disposed = false;
    this.element = null;
    this.source = null;
    this.loaded = false;
    this.durationMs = 0;
    this.positionMs = 0;
    this.isPlaying = false;
    this.volume = 1;
    this.looping = false;
    this.playVersion = 0;
    this.cleanups = [];
    this.positionUpdateInterval = duration(200);
    this.events = new PreviewEventStream(this.runtime);
    this.positionStream = new PreviewEventStream(this.runtime, {
      onListen: () => {
        const ms = durationMilliseconds(this.positionUpdateInterval);
        if (!Number.isFinite(ms) || ms < 16 || ms > 60000)
          throw Error('Audio position sampling must be between 16 ms and one minute.');
        this.positionTimer = setInterval(() => {
          this.positionMs = Math.round((this.element?.currentTime ?? 0) * 1000);
          this.positionStream.emit(duration(this.positionMs));
        }, ms);
      },
      onIdle: () => {
        clearInterval(this.positionTimer);
        this.positionTimer = null;
      },
    });
  }
  check() {
    if (this.disposed) throw Error('The audio player was disposed.');
  }
  ensureElement() {
    this.check();
    if (this.element) return;
    const audio =
      this.environment.createAudio?.() ?? this.environment.document?.createElement('audio');
    if (!audio) return;
    this.element = audio;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.volume = this.volume;
    audio.loop = this.looping;
    const on = (name, fn) => {
      audio.addEventListener(name, fn);
      this.cleanups.push(() => audio.removeEventListener(name, fn));
    };
    on('loadedmetadata', () => {
      if (!Number.isFinite(audio.duration)) {
        this.fail('Audio requires a finite duration.');
        return;
      }
      this.durationMs = Math.round(audio.duration * 1000);
      clearTimeout(this.loadTimer);
      this.emit('initialized', { durationMs: this.durationMs });
    });
    on('playing', () => {
      this.isPlaying = true;
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
      this.positionMs = this.durationMs;
      this.emit('completed');
    });
    on('timeupdate', () => {
      this.positionMs = Math.round(audio.currentTime * 1000);
    });
    on('error', () => this.fail('The browser could not load or decode this audio source.'));
  }
  emit(name, fields = {}) {
    if (!this.disposed)
      this.events.emit({
        type: { symbol: `AudioPlayerEvent.${name}` },
        durationMs: null,
        ...fields,
      });
  }
  fail(message) {
    if (this.disposed) return;
    clearTimeout(this.loadTimer);
    this.isPlaying = false;
    this.element?.pause();
    this.emit('error');
    this.runtime.logs.push(message);
    this.runtime.scheduleChange();
  }
  setSource(kind, path) {
    this.check();
    if (typeof path !== 'string' || !path)
      throw Error('Audio needs an asset key or an owned preview file.');
    if (
      kind === 'asset' &&
      (!path.startsWith('assets/') ||
        path.split('/').some((p) => p === '..' || p === '.') ||
        /[?#\\]/.test(path))
    )
      throw Error('Invalid audio asset key.');
    if (kind === 'file' && !this.runtime.services.fileURL({ browserFile: true, path }))
      throw Error('Audio can only read files owned by this preview.');
    this.stop();
    clearTimeout(this.loadTimer);
    this.element?.removeAttribute('src');
    this.element?.load();
    this.source = { kind, path };
    this.loaded = false;
    this.durationMs = 0;
    this.load();
  }
  load() {
    if (this.disposed || this.loaded || !this.source) return;
    this.ensureElement();
    if (!this.element) return;
    const { kind, path } = this.source,
      url = kind === 'file' ? path : this.owner.resolveAsset?.(path);
    if (!url) {
      if (this.owner.resolveAsset) this.fail('The audio asset is not declared in this project.');
      return;
    }
    this.loaded = true;
    this.element.src = url;
    this.element.load();
    this.loadTimer = setTimeout(() => this.fail('Audio did not load within 20 seconds.'), 20000);
  }
  play() {
    this.check();
    this.load();
    if (!this.element || !this.loaded) throw Error('Load an available audio file before playing.');
    const version = ++this.playVersion;
    Promise.resolve(this.element.play()).catch((error) => {
      if (!this.disposed && version === this.playVersion && error.name !== 'AbortError')
        this.fail(
          error.name === 'NotAllowedError'
            ? 'Audio playback needs a browser input gesture.'
            : error.message,
        );
    });
    return null;
  }
  pause() {
    this.check();
    this.playVersion++;
    this.element?.pause();
    return null;
  }
  stop() {
    this.pause();
    this.positionMs = 0;
    if (this.element) {
      try {
        this.element.currentTime = 0;
      } catch {}
    }
    return null;
  }
  read(name) {
    if (name === 'duration') return duration(this.durationMs);
    if (name === 'position') return duration(this.positionMs);
    if (
      [
        'durationMs',
        'positionMs',
        'isPlaying',
        'events',
        'positionStream',
        'positionUpdateInterval',
      ].includes(name)
    )
      return this[name];
    throw Error(`Unsupported AudioPlayer property: ${name}`);
  }
  invoke(name, args, props = {}) {
    if (Object.keys(props).length) throw Error('AudioPlayer methods take positional arguments.');
    const arity = ['setAsset', 'setPath', 'seek', 'setVolume', 'setLooping'].includes(name) ? 1 : 0;
    if (args.length !== arity) throw Error(`Invalid AudioPlayer.${name} arguments.`);
    if (name === 'dispose') {
      this.dispose();
      return null;
    }
    this.check();
    if (name === 'setAsset' || name === 'setPath') {
      this.setSource(name === 'setAsset' ? 'asset' : 'file', args[0]);
      return null;
    }
    if (['play', 'pause', 'stop'].includes(name)) return this[name]();
    if (name === 'seek') {
      const ms = durationMilliseconds(args[0]);
      if (!Number.isFinite(ms)) throw Error('Audio seek position must be finite.');
      this.positionMs = Math.max(0, Math.min(this.durationMs, ms));
      if (this.element) this.element.currentTime = this.positionMs / 1000;
      return null;
    }
    if (name === 'setVolume') {
      if (!Number.isFinite(args[0])) throw Error('Audio volume must be finite.');
      this.volume = Math.max(0, Math.min(1, args[0]));
      if (this.element) this.element.volume = this.volume;
      return null;
    }
    if (name === 'setLooping') {
      if (typeof args[0] !== 'boolean') throw Error('Audio looping needs a boolean.');
      this.looping = args[0];
      if (this.element) this.element.loop = this.looping;
      return null;
    }
    throw Error(`Unsupported AudioPlayer method: ${name}`);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.playVersion++;
    clearTimeout(this.loadTimer);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.element?.pause();
    this.element?.removeAttribute('src');
    this.element?.load();
    this.element = null;
    this.events.close();
    this.positionStream.close();
    this.owner.players.delete(this);
  }
}
export class PreviewFileAudio {
  constructor(runtime) {
    this.runtime = runtime;
    this.players = new Set();
    this.resolveAsset = null;
  }
  create() {
    if (this.players.size >= 8) throw Error('A preview can have at most eight file audio players.');
    const player = new PreviewFileAudioPlayer(this);
    this.players.add(player);
    return player;
  }
  bindAssets(resolver) {
    this.resolveAsset = resolver;
    for (const player of this.players) player.load();
  }
  dispose() {
    for (const player of [...this.players]) player.dispose();
  }
}
