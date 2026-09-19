import { DartTypedList } from './typed-data.js';

// Each player owns its AudioContext and scheduled nodes. A flush discards all
// queued sound; a stop suspends the clock without dropping its queued buffers.
export class PreviewPcmPlayer {
  constructor(environment = globalThis, onError = () => {}) {
    this.environment = environment;
    this.onError = onError;
    this.sources = new Set();
    this.context = null;
    this.format = null;
    this.nextTime = 0;
    this.disposed = false;
  }
  active() {
    if (this.disposed) throw Error('PcmStreamPlayer was disposed.');
  }
  async unlock() {
    this.active();
    if (!this.context) {
      const Context = this.environment.AudioContext || this.environment.webkitAudioContext;
      if (!Context) throw Error('PCM playback needs Web Audio support.');
      this.context = new Context();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  configure({ sampleRate, channels = 1, bitsPerSample = 16 }) {
    this.active();
    if (
      !Number.isInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      ![1, 2].includes(channels) ||
      ![16, 32].includes(bitsPerSample)
    )
      throw Error(
        'PCM needs an 8000–192000 Hz sample rate, 1 or 2 channels, and 16-bit integer or 32-bit float samples.',
      );
    this.flush();
    this.format = { sampleRate, channels, bitsPerSample };
  }
  feed(bytes) {
    this.active();
    if (!this.format) throw Error('Configure the PCM player before feeding audio.');
    if (!(bytes instanceof DartTypedList) || bytes.valueType !== 'Uint8List')
      throw Error('PCM chunks must be Uint8List bytes.');
    const data = bytes.bytes(),
      { sampleRate, channels, bitsPerSample } = this.format,
      frameBytes = (channels * bitsPerSample) / 8;
    if (data.length % frameBytes) throw Error('PCM chunk does not contain complete sample frames.');
    if (!data.length) return;
    if (!this.context || this.context.state === 'closed')
      throw Error('Audio playback is suspended. Press Speak to enable sound.');
    if (this.context.state === 'suspended')
      this.unlock().catch((error) => {
        if (!this.disposed) this.onError(error);
      });
    const context = this.context,
      frames = data.length / frameBytes,
      start = Math.max(context.currentTime, this.nextTime);
    if (start + frames / sampleRate - context.currentTime > 300)
      throw Error('The PCM playback queue exceeds five minutes.');
    const buffer = context.createBuffer(channels, frames, sampleRate),
      view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let c = 0; c < channels; c++) {
      const out = buffer.getChannelData(c);
      for (let i = 0; i < frames; i++) {
        const offset = i * frameBytes + (c * bitsPerSample) / 8,
          v =
            bitsPerSample === 16
              ? view.getInt16(offset, true) / 32768
              : view.getFloat32(offset, true);
        out[i] = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
      }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
    };
    this.sources.add(source);
    source.start(start);
    this.nextTime = start + frames / sampleRate;
  }
  stop() {
    this.active();
    return this.context?.suspend();
  }
  flush() {
    this.active();
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } finally {
        source.disconnect();
      }
    }
    this.sources.clear();
    this.nextTime = this.context?.currentTime ?? 0;
  }
  dispose() {
    if (this.disposed) return;
    this.flush();
    this.disposed = true;
    const result = this.context?.close();
    this.context = null;
    return result;
  }
  invoke(name, args, props) {
    if (name === 'configure') {
      if (
        args.length ||
        Object.keys(props).some((key) => !['sampleRate', 'channels', 'bitsPerSample'].includes(key))
      )
        throw Error('Unsupported PCM configuration argument.');
      this.configure(props);
      return null;
    }
    if (Object.keys(props).length || args.length !== (name === 'feedChunk' ? 1 : 0))
      throw Error('Unsupported PCM player arguments.');
    if (name === 'feedChunk') {
      this.feed(args[0]);
      return null;
    }
    if (name === 'stop') return this.stop();
    if (name === 'flush') {
      this.flush();
      return null;
    }
    if (name === 'dispose') return this.dispose();
    throw Error(`Unsupported PCM player method: ${name}`);
  }
  read(name) {
    throw Error(`Unsupported PCM player property: ${name}`);
  }
}

export class PreviewAudio {
  constructor(runtime) {
    this.runtime = runtime;
    this.players = new Set();
  }
  create() {
    for (const player of this.players) if (player.disposed) this.players.delete(player);
    if (this.players.size >= 8) throw Error('The preview supports up to eight PCM players.');
    const player = new PreviewPcmPlayer(this.runtime.browserEnvironment, (error) => {
      this.runtime.actionErrors.push(error.message);
      this.runtime.onChange();
    });
    this.players.add(player);
    return player;
  }
  // Called synchronously from real preview input events, before asynchronous
  // inference has consumed the browser's transient user activation.
  unlock() {
    if (!this.runtime.browserEnvironment.navigator?.userActivation?.isActive) return;
    for (const player of this.players)
      if (!player.disposed)
        player.unlock().catch((error) => {
          if (!player.disposed) {
            this.runtime.actionErrors.push(error.message);
            this.runtime.onChange();
          }
        });
  }
  dispose() {
    for (const player of this.players) Promise.resolve(player.dispose()).catch(() => {});
    this.players.clear();
  }
}
