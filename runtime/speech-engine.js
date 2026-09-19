import { speechVoices } from './speech-model-manifest.js';
import { splitSpeechText } from './speech-chunks.js';
import { DartTypedList } from './typed-data.js';
const decode = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

export class SpeechEngine {
  constructor(models, environment = globalThis) {
    this.models = models;
    this.environment = environment;
    this.worker = null;
    this.requests = new Map();
    this.nextId = 0;
    this.disposed = false;
    this.initialized = false;
    this.busy = false;
    this.sampleRate = 44100;
    models.engines.add(this);
  }
  check() {
    if (this.disposed) throw Error('The speech engine was disposed.');
  }
  request(operation, payload, transfer = []) {
    this.check();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(id);
        reject(
          Error('Speech processing timed out. Try a shorter utterance or fewer quality steps.'),
        );
        this.dispose();
      }, 180000);
      this.requests.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage({ id, operation, payload }, transfer);
      } catch (error) {
        clearTimeout(timer);
        this.requests.delete(id);
        reject(error);
      }
    });
  }
  async initialize({ onProgress = () => {}, intraOpNumThreads } = {}) {
    this.check();
    if (this.initialized) return;
    if (this.busy) throw Error('The speech engine is busy.');
    if (
      intraOpNumThreads != null &&
      (!Number.isInteger(intraOpNumThreads) || intraOpNumThreads < 1 || intraOpNumThreads > 16)
    )
      throw Error('Invalid speech thread count.');
    if (typeof this.environment.Worker !== 'function')
      throw Error('Speech inference needs browser Web Workers.');
    this.busy = true;
    try {
      await this.models.download((p, s) => onProgress(p * 0.85, s));
      this.check();
      this.worker =
        this.environment.createSpeechWorker?.() ??
        new Worker(new URL('./speech-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        const request = this.requests.get(data.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.requests.delete(data.id);
        data.error ? request.reject(Error(data.error)) : request.resolve(data.result);
      };
      this.worker.onerror = () => {
        const error = Error('The speech inference worker failed.');
        for (const request of this.requests.values()) {
          clearTimeout(request.timer);
          request.reject(error);
        }
        this.requests.clear();
        this.dispose();
      };
      const config = decode(await this.models.read('tts.json')),
        indexer = decode(await this.models.read('unicode_indexer.json')),
        voices = {};
      for (const voice of speechVoices)
        voices[voice] = decode(await this.models.read(`voice_styles/${voice}.json`));
      this.check();
      Object.assign(this, await this.request('setup', { config, indexer, voices }));
      const names = ['duration_predictor', 'text_encoder', 'vector_estimator', 'vocoder'];
      for (let i = 0; i < names.length; i++) {
        onProgress(0.85 + (i * 0.15) / 4, `Loading ${names[i]}`);
        const bytes = await this.models.read(`${names[i]}.onnx`);
        this.check();
        await this.request('model', { name: names[i], bytes }, [bytes.buffer]);
      }
      this.initialized = true;
      onProgress(1, 'Model ready.');
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      this.busy = false;
    }
  }
  settings({ voice = 'F1', lang = 'en', steps = 5, speed = 1, voiceStylePath } = {}) {
    this.check();
    if (!this.initialized) throw Error('Initialize the speech engine before generating audio.');
    if (this.busy) throw Error('The speech engine is already generating audio.');
    if (!speechVoices.includes(voice) || voiceStylePath != null)
      throw Error(
        'Choose one of the ten bundled browser voices. Custom voice paths require another adapter.',
      );
    if (
      !Number.isInteger(steps) ||
      steps < 2 ||
      steps > 16 ||
      !Number.isFinite(speed) ||
      speed < 0.5 ||
      speed > 2
    )
      throw Error('Speech needs 2–16 steps and a speed between 0.5 and 2.0.');
    return { voice, lang, steps, speed };
  }
  async *generateStream(text, options = {}) {
    const settings = this.settings(options),
      chunks = splitSpeechText(
        text,
        options.maxLen ?? (['ko', 'ja'].includes(settings.lang) ? 120 : 300),
      );
    this.busy = true;
    try {
      while (chunks.length) {
        const chunk = chunks.shift();
        this.check();
        const result = await this.request('generate', {
          text: chunk,
          ...settings,
          allowSplit: true,
        });
        this.check();
        if (result.split) {
          if (chunk.length < 40)
            throw Error(
              'The predicted speech duration exceeds the preview limit. Use a shorter utterance.',
            );
          const maxLen = Math.floor(chunk.length / 2);
          chunks.unshift(...splitSpeechText(chunk, maxLen, { first: maxLen }));
          continue;
        }
        yield new DartTypedList('Float32List', result.audio);
      }
    } finally {
      this.busy = false;
    }
  }
  async generateChunk(text, options = {}) {
    const settings = this.settings(options);
    this.busy = true;
    try {
      const result = await this.request('generate', { text, ...settings, allowSplit: false });
      this.check();
      return new DartTypedList('Float32List', result.audio);
    } finally {
      this.busy = false;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.initialized = false;
    this.models.engines.delete(this);
    this.worker?.terminate();
    this.worker = null;
    for (const request of this.requests.values()) {
      clearTimeout(request.timer);
      request.reject(Error('Speech inference was cancelled.'));
    }
    this.requests.clear();
  }
}
