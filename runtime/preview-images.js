import { networkURL } from './preview-network.js';

export const imageCalls = new Set(['ImageCache.clearMemory', 'ImageCache.isCached']);
const decodeSize = (value) => {
  if (value == null) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 8192)
    throw Error('Image decode dimensions must be from 1 to 8192 pixels.');
  return value;
};

// Cache decoded bitmaps, independently of the browser's HTTP cache. Leases
// keep displayed images alive while unreferenced entries are evicted by size.
export class PreviewImages {
  constructor(
    network,
    environment = globalThis,
    { maxBytes = 100 * 1024 * 1024, concurrency = 6 } = {},
  ) {
    this.network = network;
    this.environment = environment;
    this.maxBytes = maxBytes;
    this.concurrency = concurrency;
    this.entries = new Map();
    this.allEntries = new Set();
    this.queue = [];
    this.active = 0;
    this.clock = 0;
    this.views = new Map();
    this.disposed = false;
  }
  invoke(name, args) {
    if (name === 'ImageCache.clearMemory') {
      this.clear();
      return null;
    }
    return [...this.entries.values()].some(
      (entry) => entry.url === args[0] && entry.status === 'ready',
    );
  }
  acquire(url, { cacheWidth, cacheHeight, cachePolicy, local = false } = {}) {
    if (this.disposed) throw Error('Image cache is disposed.');
    if (!local) url = networkURL(url);
    const width = decodeSize(cacheWidth),
      height = decodeSize(cacheHeight),
      policy = cachePolicy?.symbol?.split('.').at(-1) || 'standard';
    if (!['standard', 'memoryOnly', 'none'].includes(policy))
      throw Error('Unknown image cache policy.');
    const key = JSON.stringify([url, width, height, policy]);
    let entry = policy === 'none' ? null : this.entries.get(key),
      hit = entry?.status === 'ready';
    if (!entry) {
      entry = {
        key,
        url,
        width,
        height,
        policy,
        local,
        refs: 0,
        status: 'queued',
        controller: new AbortController(),
        last: ++this.clock,
        bytes: 0,
        bitmap: null,
        retired: false,
      };
      entry.promise = new Promise((resolve, reject) => {
        entry.resolve = resolve;
        entry.reject = reject;
      });
      entry.promise.catch(() => {});
      if (policy !== 'none') this.entries.set(key, entry);
      this.allEntries.add(entry);
      this.queue.push(entry);
    }
    entry.refs++;
    entry.last = ++this.clock;
    this.pump();
    let released = false;
    return {
      promise: entry.promise,
      hit,
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
      if (entry.retired && !entry.refs) continue;
      this.active++;
      entry.status = 'loading';
      this.load(entry)
        .then((bitmap) => {
          if ((entry.retired && !entry.refs) || this.disposed) {
            bitmap.close();
            throw Error('Image load cancelled.');
          }
          entry.bitmap = bitmap;
          entry.bytes = bitmap.width * bitmap.height * 4;
          entry.status = 'ready';
          entry.last = ++this.clock;
          entry.resolve(bitmap);
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
    const response = await this.network.read(entry.url, {
      limit: 20 * 1024 * 1024,
      cache: entry.policy === 'standard' ? 'default' : 'no-store',
      credentials: entry.local ? 'same-origin' : 'omit',
      signal: entry.controller.signal,
    });
    if (response.status < 200 || response.status >= 300)
      throw Error(`Image request returned HTTP ${response.status}.`);
    if (!response.type.startsWith('image/'))
      throw Error('The image URL returned a non-image response.');
    if (typeof this.environment.createImageBitmap !== 'function')
      throw Error('This browser cannot decode preview image bitmaps.');
    return this.environment.createImageBitmap(new Blob([response.bytes], { type: response.type }), {
      ...(entry.width ? { resizeWidth: entry.width } : {}),
      ...(entry.height ? { resizeHeight: entry.height } : {}),
      resizeQuality: 'high',
    });
  }
  drop(entry) {
    entry.retired = true;
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    if (!entry.refs) {
      entry.controller.abort(Error('Image is no longer displayed.'));
      entry.bitmap?.close();
      entry.bitmap = null;
      entry.bytes = 0;
      this.allEntries.delete(entry);
      if (entry.status === 'queued') entry.reject(Error('Image load cancelled.'));
    }
  }
  trim() {
    let bytes = [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    for (const entry of [...this.entries.values()]
      .filter((entry) => entry.status === 'ready' && !entry.refs)
      .sort((a, b) => a.last - b.last)) {
      if (bytes <= this.maxBytes) break;
      bytes -= entry.bytes;
      this.drop(entry);
    }
  }
  clear() {
    for (const entry of [...this.entries.values()]) this.drop(entry);
  }
  releaseChildren(root) {
    for (const [element, dispose] of this.views)
      if (element !== root && root.contains(element)) {
        dispose();
        this.views.delete(element);
      }
  }
  finishFrame(views) {
    for (const [element, dispose] of this.views)
      if (!views.has(element)) {
        dispose();
        this.views.delete(element);
      }
  }
  dispose() {
    this.disposed = true;
    for (const dispose of this.views.values()) dispose();
    this.views.clear();
    for (const entry of [...this.allEntries]) {
      entry.refs = 0;
      this.drop(entry);
    }
    this.queue = [];
  }
}
