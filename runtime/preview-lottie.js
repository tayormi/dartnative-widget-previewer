import { networkURL } from './preview-network.js';
import { decodeLottieSource, lottieLimits } from './lottie-source.js';
import { tutorialLottieRoute } from './tutorial-asset-urls.js';

function decode(bytes, signal, environment) {
  if (typeof environment.Worker !== 'function') return decodeLottieSource(bytes);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./lottie-worker.js', import.meta.url), { type: 'module' });
    const finish = (error, value) => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const cancel = () => finish(signal.reason || Error('Lottie load cancelled.'));
    const timeout = setTimeout(() => finish(Error('Lottie decoding exceeded 10 seconds.')), 10000);
    worker.onmessage = ({ data }) => finish(data.error ? Error(data.error) : null, data.result);
    worker.onerror = () => finish(Error('Lottie worker could not decode this animation.'));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    // Keep the source bytes for the persistent cache; transfer a separate copy.
    const copy = typeof bytes === 'string' ? bytes : bytes.slice();
    worker.postMessage(copy, typeof copy === 'string' ? [] : [copy.buffer]);
  });
}
export class PreviewLottie {
  constructor(
    network,
    backend,
    environment = globalThis,
    { maxBytes = 32 * 1024 * 1024, concurrency = 4, decoder = decode } = {},
  ) {
    this.network = network;
    this.backend = backend;
    this.environment = environment;
    this.maxBytes = maxBytes;
    this.concurrency = concurrency;
    this.decoder = decoder;
    this.entries = new Map();
    this.all = new Set();
    this.views = new Map();
    this.queue = [];
    this.active = 0;
    this.clock = 0;
    this.disposed = false;
  }
  acquire(source, { policy = 'disk', local = false, json = false } = {}) {
    if (this.disposed) throw Error('Lottie cache is disposed.');
    if (typeof source !== 'string' || !source)
      throw Error('Lottie needs JSON text, an asset, or a URL.');
    if (!json && !local) source = networkURL(source);
    if (!['disk', 'none'].includes(policy)) throw Error('Invalid Lottie cache policy.');
    if (json && source.length > lottieLimits.download) throw Error('Lottie JSON exceeds 8 MB.');
    const key = JSON.stringify([source, json, local, policy]);
    let entry = policy === 'none' ? null : this.entries.get(key);
    if (!entry) {
      entry = {
        key,
        source,
        json,
        local,
        policy,
        status: 'queued',
        controller: new AbortController(),
        refs: 0,
        bytes: 0,
        last: ++this.clock,
        retired: false,
      };
      entry.promise = new Promise((resolve, reject) => {
        entry.resolve = resolve;
        entry.reject = reject;
      });
      entry.promise.catch(() => {});
      if (policy !== 'none') this.entries.set(key, entry);
      this.all.add(entry);
      this.queue.push(entry);
    }
    entry.refs++;
    entry.last = ++this.clock;
    this.pump();
    let released = false;
    return {
      promise: entry.promise,
      release: () => {
        if (released) return;
        released = true;
        entry.refs--;
        entry.last = ++this.clock;
        if (!entry.refs && (entry.retired || entry.policy === 'none' || entry.status !== 'ready'))
          this.drop(entry);
        this.trim();
      },
    };
  }
  pump() {
    while (!this.disposed && this.active < this.concurrency && this.queue.length) {
      const entry = this.queue.shift();
      if (entry.retired) continue;
      entry.status = 'loading';
      this.active++;
      this.load(entry)
        .then((result) => {
          if (this.disposed || entry.retired) throw Error('Lottie load cancelled.');
          entry.status = 'ready';
          entry.bytes = result.bytes * 2;
          entry.resolve(result.data);
          this.trim();
        })
        .catch((error) => {
          entry.status = 'error';
          entry.reject(error);
          if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
        })
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
  async load(entry) {
    const signal = entry.controller.signal,
      persistent = !entry.json && !entry.local && entry.policy === 'disk';
    const cacheKey = `lottie:v1:${encodeURIComponent(entry.source)}`;
    let bytes = entry.json ? entry.source : null,
      cached = false,
      cacheWarning;
    if (persistent) {
      try {
        const value = await this.backend.get(cacheKey);
        if (value?.bytes instanceof Uint8Array && value.bytes.length <= lottieLimits.download) {
          bytes = value.bytes;
          cached = true;
        }
      } catch {
        cacheWarning = 'Browser storage is unavailable; this animation is cached in memory only.';
      }
    }
    signal.throwIfAborted();
    if (bytes === null) {
      const route = !entry.local && tutorialLottieRoute(entry.source),
        source =
          route && this.environment.location?.origin
            ? new URL(route, this.environment.location.origin).href
            : entry.source;
      const response = await this.network.read(source, {
        limit: lottieLimits.download,
        cache: entry.policy === 'none' ? 'no-store' : 'default',
        credentials: entry.local ? 'same-origin' : 'omit',
        signal,
      });
      if (response.status < 200 || response.status >= 300)
        throw Error(`Lottie request returned HTTP ${response.status}.`);
      bytes = response.bytes;
    }
    let result;
    try {
      result = await this.decoder(bytes, signal, this.environment);
    } catch (error) {
      if (cached) await this.backend.delete(cacheKey).catch(() => {});
      throw error;
    }
    signal.throwIfAborted();
    if (persistent && !cached && !cacheWarning) {
      try {
        await this.backend.lock('lottie-cache', async () => {
          signal.throwIfAborted();
          await this.backend.put(cacheKey, { bytes, created: Date.now() });
          const keys = await this.backend.keys('lottie:v1:'),
            records = await Promise.all(
              keys.map(async (key) => ({ key, ...(await this.backend.get(key)) })),
            );
          let total = records.reduce((sum, r) => sum + (r.bytes?.length || 0), 0),
            count = records.length;
          for (const record of records.sort((a, b) => a.created - b.created)) {
            if (total <= 32 * 1024 * 1024 && count <= 64) break;
            await this.backend.delete(record.key);
            total -= record.bytes?.length || 0;
            count--;
          }
        });
      } catch (error) {
        signal.throwIfAborted();
        cacheWarning = 'Browser storage is unavailable; this animation is cached in memory only.';
      }
    }
    if (cacheWarning) result.data = { ...result.data, _previewCacheWarning: cacheWarning };
    return result;
  }
  drop(entry) {
    entry.retired = true;
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    if (!entry.refs) {
      entry.controller.abort(Error('Lottie animation is no longer displayed.'));
      this.all.delete(entry);
      entry.bytes = 0;
      if (entry.status === 'queued') entry.reject(Error('Lottie load cancelled.'));
    }
  }
  trim() {
    let bytes = [...this.entries.values()].reduce((sum, e) => sum + e.bytes, 0);
    for (const entry of [...this.entries.values()]
      .filter((e) => e.status === 'ready' && !e.refs)
      .sort((a, b) => a.last - b.last)) {
      if (bytes <= this.maxBytes) break;
      bytes -= entry.bytes;
      this.drop(entry);
    }
  }
  finishFrame(keys) {
    for (const [key, view] of this.views)
      if (!keys.has(key)) {
        view.dispose();
        this.views.delete(key);
      }
  }
  releaseChildren(root) {
    for (const [key, view] of this.views)
      if (root.contains(view.element)) {
        view.dispose();
        this.views.delete(key);
      }
  }
  dispose() {
    this.disposed = true;
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
    for (const entry of [...this.all]) {
      entry.refs = 0;
      this.drop(entry);
    }
    this.queue = [];
  }
}
