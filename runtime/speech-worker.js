import * as ort from 'onnxruntime-web/wasm';
import { UnicodeProcessor } from './speech-tokenizer.js';

// The pinned int8 models use CPU execution, matching the SDK's recommended
// provider. A dedicated worker keeps inference off the editor's event loop.
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL('/onnx/', self.location.href).href;
const sessions = new Map(),
  styles = new Map();
let config, tokenizer;
const tensor = (data, dims, type = 'float32') => new ort.Tensor(type, data, dims);

async function generate({ text, lang, voice, steps, speed, allowSplit }) {
  if (sessions.size !== 4 || !tokenizer || !styles.has(voice))
    throw Error('Initialize the speech models and voice first.');
  if (
    typeof text !== 'string' ||
    text.length > 1000 ||
    !Number.isInteger(steps) ||
    steps < 2 ||
    steps > 16 ||
    !Number.isFinite(speed) ||
    speed < 0.5 ||
    speed > 2
  )
    throw Error('Invalid speech generation settings.');
  const owned = new Set(),
    keep = (t) => {
      owned.add(t);
      return t;
    },
    drop = (t) => {
      if (owned.delete(t)) t.dispose();
    };
  try {
    const style = styles.get(voice),
      tokens = tokenizer.call([text], [lang]).textIds[0],
      ids = keep(tensor(BigInt64Array.from(tokens, BigInt), [1, tokens.length], 'int64')),
      mask = keep(tensor(new Float32Array(tokens.length).fill(1), [1, 1, tokens.length]));
    const dp = await sessions
      .get('duration_predictor')
      .run({ text_ids: ids, text_mask: mask, style_dp: style.dp });
    Object.values(dp).forEach(keep);
    const duration = dp.duration.data[0] / speed,
      sampleRate = config.ae.sample_rate;
    if (!Number.isFinite(duration) || duration <= 0)
      throw Error('The model returned an invalid speech duration.');
    if (duration > 22) {
      if (allowSplit) return { split: true };
      throw Error(
        'This speech chunk exceeds the preview audio limit. Use generateStream for longer text.',
      );
    }
    const samples = Math.floor(duration * sampleRate),
      chunkSize = config.ae.base_chunk_size * config.ttl.chunk_compress_factor,
      latentLength = Math.ceil(samples / chunkSize),
      latentDims = config.ttl.latent_dim * config.ttl.chunk_compress_factor;
    const encoded = await sessions
      .get('text_encoder')
      .run({ text_ids: ids, text_mask: mask, style_ttl: style.ttl });
    Object.values(encoded).forEach(keep);
    const noise = new Float32Array(latentDims * latentLength);
    for (let i = 0; i < noise.length; i++)
      noise[i] =
        Math.sqrt(-2 * Math.log(Math.max(0.0001, Math.random()))) *
        Math.cos(2 * Math.PI * Math.random());
    let latent = keep(tensor(noise, [1, latentDims, latentLength]));
    const latentMask = keep(tensor(new Float32Array(latentLength).fill(1), [1, 1, latentLength])),
      total = keep(tensor(new Float32Array([steps]), [1]));
    for (let step = 0; step < steps; step++) {
      const current = keep(tensor(new Float32Array([step]), [1]));
      const output = await sessions.get('vector_estimator').run({
        noisy_latent: latent,
        text_emb: encoded.text_emb,
        style_ttl: style.ttl,
        latent_mask: latentMask,
        text_mask: mask,
        current_step: current,
        total_step: total,
      });
      Object.values(output).forEach(keep);
      drop(latent);
      drop(current);
      latent = output.denoised_latent;
    }
    const output = await sessions.get('vocoder').run({ latent });
    Object.values(output).forEach(keep);
    const audio = output.wav_tts.data.slice(0, samples);
    if (audio.length !== samples || audio.some((v) => !Number.isFinite(v)))
      throw Error('The speech model returned invalid audio.');
    return { audio, sampleRate, duration };
  } finally {
    for (const t of owned) t.dispose();
  }
}

async function handle({ operation, payload }) {
  if (operation === 'setup') {
    config = payload.config;
    tokenizer = new UnicodeProcessor(payload.indexer);
    if (config?.ae?.sample_rate !== 44100 || !Array.isArray(payload.indexer))
      throw Error('Invalid SuperTonic configuration.');
    for (const [voice, data] of Object.entries(payload.voices)) {
      const ttl = tensor(new Float32Array(data.style_ttl.data.flat(Infinity)), data.style_ttl.dims),
        dp = tensor(new Float32Array(data.style_dp.data.flat(Infinity)), data.style_dp.dims);
      styles.set(voice, { ttl, dp });
    }
    return {
      sampleRate: config.ae.sample_rate,
      baseChunkSize: config.ae.base_chunk_size,
      chunkCompressFactor: config.ttl.chunk_compress_factor,
      ldim: config.ttl.latent_dim,
    };
  }
  if (operation === 'model') {
    if (
      !['duration_predictor', 'text_encoder', 'vector_estimator', 'vocoder'].includes(
        payload.name,
      ) ||
      sessions.has(payload.name)
    )
      throw Error('Unknown or duplicate speech model.');
    sessions.set(
      payload.name,
      await ort.InferenceSession.create(payload.bytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }),
    );
    return null;
  }
  if (operation === 'generate') return generate(payload);
  throw Error('Unknown speech worker operation.');
}
let pending = Promise.resolve();
self.onmessage = ({ data }) => {
  pending = pending.then(async () => {
    try {
      const result = await handle(data);
      self.postMessage({ id: data.id, result }, result?.audio ? [result.audio.buffer] : []);
    } catch (error) {
      self.postMessage({ id: data.id, error: error.message || String(error) });
    }
  });
};
