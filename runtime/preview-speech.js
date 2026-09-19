import { SpeechModels } from './speech-models.js';
import { SpeechEngine } from './speech-engine.js';
import { speechVoices } from './speech-model-manifest.js';
import { speechLanguages, speechSample } from './speech-languages.js';
import { splitSpeechText } from './speech-chunks.js';
import { DartTypedList } from './typed-data.js';

export const speechCalls = new Set([
  'ModelManager',
  'SuperTonicTTS',
  'SuperTonicTTS.withManager',
  'SuperTonicTTS.fromName',
  'TTSLanguage.fromCode',
  'TTSTestStrings.shortForLanguage',
  'TTSTestStrings.forLanguage',
]);
const argumentsOnly = (args, props, count, keys = []) => {
  if (args.length !== count || Object.keys(props).some((key) => !keys.includes(key)))
    throw Error('Unsupported speech API arguments.');
};
export class SpeechValue {
  constructor(owner, kind, value) {
    this.owner = owner;
    this.kind = kind;
    this.value = value;
    this.valueType = kind;
  }
  read(name) {
    const value = this.value;
    if (this.kind === 'SuperTonicTTS') {
      if (name === 'isInitialized') return value.initialized;
      if (['sampleRate', 'baseChunkSize', 'chunkCompressFactor', 'ldim'].includes(name))
        return value[name];
      if (name === 'availableVoices') return [...speechVoices];
      if (name === 'availableLanguages') return speechLanguages.map((l) => l.code);
      if (name === 'modelManager') return this.owner.manager;
    }
    if (this.kind === 'ModelManager' && name === 'bundledDir') return null;
    throw Error(`Unsupported ${this.kind} property: ${name}`);
  }
  invoke(name, args, props) {
    const value = this.value,
      owner = this.owner;
    if (this.kind === 'ModelManager') {
      if (name === 'download') {
        argumentsOnly(args, props, 0, ['onProgress']);
        return value.download(owner.progress(props.onProgress));
      }
      argumentsOnly(args, props, 0);
      if (name === 'isReady') return value.isReady();
      if (
        [
          'pendingDownloadBytes',
          'pendingDownloadMB',
          'downloadSizeBytes',
          'downloadSizeMB',
        ].includes(name)
      ) {
        const bytes = value.size({ pending: name.startsWith('pending') });
        return name.endsWith('MB') ? Math.round(bytes / 1_000_000) : bytes;
      }
      if (name === 'cancelDownload') {
        value.cancel();
        return null;
      }
      if (name === 'delete') return value.delete();
    } else {
      if (name === 'initialize') {
        argumentsOnly(args, props, 0, ['onProgress', 'intraOpNumThreads']);
        return value.initialize({ ...props, onProgress: owner.progress(props.onProgress) });
      }
      if (name === 'dispose') {
        argumentsOnly(args, props, 0);
        value.dispose();
        return null;
      }
      if (name === 'splitText') {
        argumentsOnly(args, props, 1, ['maxLen']);
        return splitSpeechText(args[0], props.maxLen ?? 300, { first: props.maxLen ?? 300 });
      }
      if (['generateStream', 'generate', 'generateChunk'].includes(name)) {
        argumentsOnly(args, props, 1, [
          'voice',
          'lang',
          'speed',
          'steps',
          'voiceStylePath',
          ...(name === 'generate'
            ? ['silenceDuration']
            : name === 'generateStream'
              ? ['maxLen']
              : []),
        ]);
        if (name === 'generateChunk') return value.generateChunk(args[0], props);
        const stream = value.generateStream(args[0], props);
        if (name === 'generateStream') return stream;
        return (async () => {
          const chunks = [];
          let size = 0;
          const seconds = props.silenceDuration ?? 0.3;
          if (!Number.isFinite(seconds) || seconds < 0 || seconds > 2)
            throw Error('Speech silence must be between 0 and 2 seconds.');
          const gap = Math.floor(seconds * value.sampleRate);
          for await (const chunk of stream) {
            if (chunks.length) size += gap;
            size += chunk.length;
            if (size > 16_000_000) throw Error('Combined speech exceeds the preview buffer limit.');
            chunks.push(chunk);
          }
          const audio = new Float32Array(size);
          let offset = 0;
          for (let i = 0; i < chunks.length; i++) {
            if (i) offset += gap;
            chunks[i].copyTo(audio, offset);
            offset += chunks[i].length;
          }
          return new DartTypedList('Float32List', audio);
        })();
      }
    }
    throw Error(`Unsupported ${this.kind} method: ${name}`);
  }
}

export class PreviewSpeech {
  constructor(runtime) {
    this.runtime = runtime;
    this.models = null;
    this.manager = null;
    this.verbose = false;
    this.disposed = false;
    this.pending = false;
    const usesSpeech = runtime.model.calls?.some(
      (call) => speechCalls.has(call.name) || call.name?.startsWith('SuperTonicTTS.'),
    );
    if (usesSpeech) {
      this.pending = runtime.storageOptions.backend.kind !== 'memory';
      this.ensureModels();
      this.ready = this.models.ready
        .catch(() => {})
        .finally(() => {
          if (!this.disposed) {
            this.pending = false;
            runtime.scheduleChange();
          }
        });
    } else this.ready = Promise.resolve();
  }
  ensureModels() {
    if (this.disposed) throw Error('The speech preview was disposed.');
    if (!this.models) {
      this.models = new SpeechModels(
        this.runtime.storageOptions.backend,
        this.runtime.browserEnvironment,
      );
      this.models.ready.catch(() => {});
      this.manager = new SpeechValue(this, 'ModelManager', this.models);
    }
    return this.models;
  }
  progress(callback) {
    if (callback != null && typeof callback !== 'function')
      throw Error('Speech progress needs a callback.');
    const epoch = this.runtime.epoch;
    return (p, status) => {
      if (callback && !this.disposed && this.runtime.epoch === epoch)
        this.runtime.runAction(callback, [p, status], false);
    };
  }
  read(key) {
    if (key === 'TTSLanguage.all') return speechLanguages.map((l) => ({ ...l }));
    if (key === 'supertonicVoices' || key === 'kSuperTonicVoiceFiles') return [...speechVoices];
    if (key === 'SuperTonicTTS.verboseLogging') return this.verbose;
    return undefined;
  }
  invoke(name, args, props) {
    if (name === 'TTSLanguage.fromCode') {
      argumentsOnly(args, props, 1);
      const language = speechLanguages.find((l) => l.code === args[0]);
      if (!language) throw Error('Unknown speech language.');
      return { ...language };
    }
    if (name.startsWith('TTSTestStrings.')) {
      argumentsOnly(args, props, 1);
      return speechSample(args[0]);
    }
    const models = this.ensureModels();
    if (name === 'ModelManager') {
      argumentsOnly(args, props, 0, ['variant', 'bundledDir', 'r2BaseUrl']);
      if (
        (props.variant && props.variant.symbol !== 'SuperTonicVariant.mobile') ||
        props.bundledDir != null ||
        props.r2BaseUrl != null
      )
        throw Error(
          'Browser speech uses its pinned mobile model cache; custom model directories need another adapter.',
        );
      return this.manager;
    }
    if (name === 'SuperTonicTTS.withManager') {
      argumentsOnly(args, props, 1);
      if (
        !(args[0] instanceof SpeechValue) ||
        args[0].owner !== this ||
        args[0].kind !== 'ModelManager'
      )
        throw Error('Use a ModelManager from this preview.');
    } else if (name === 'SuperTonicTTS.fromName') {
      argumentsOnly(args, props, 1);
      if (String(args[0]).toLowerCase() !== 'mobile') throw Error('Unknown SuperTonic variant.');
    } else {
      argumentsOnly(args, props, 0, ['variant']);
      if (props.variant && props.variant.symbol !== 'SuperTonicVariant.mobile')
        throw Error('Unknown SuperTonic variant.');
    }
    if (models.engines.size >= 2) throw Error('A preview can run at most two speech engines.');
    return new SpeechValue(
      this,
      'SuperTonicTTS',
      new SpeechEngine(models, this.runtime.browserEnvironment),
    );
  }
  dispose() {
    this.disposed = true;
    this.models?.dispose();
    for (const engine of [...(this.models?.engines ?? [])]) engine.dispose();
  }
}
