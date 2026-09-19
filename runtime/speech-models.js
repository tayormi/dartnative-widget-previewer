import { speechModelFiles } from './speech-model-manifest.js';

export const speechCachePrefix = 'speech:supertonic3:int8:v1:';
export class SpeechModels {
  constructor(backend, environment = globalThis, files = speechModelFiles) {
    this.backend = backend;
    this.environment = environment;
    this.files = files;
    this.present = new Set();
    this.controller = null;
    this.disposed = false;
    this.engines = new Set();
    this.deletion = Promise.resolve();
    this.ready = this.backend.lock(speechCachePrefix, () => this.refresh());
  }
  async refresh() {
    const keys = await this.backend.keys(speechCachePrefix);
    if (!this.disposed)
      this.present = new Set(
        this.files
          .filter((file) => keys.includes(speechCachePrefix + file.path))
          .map((file) => file.path),
      );
  }
  check() {
    if (this.disposed) throw Error('The speech preview was disposed.');
  }
  isReady() {
    this.check();
    return this.files.every((file) => this.present.has(file.path));
  }
  size({ pending = false } = {}) {
    return this.files.reduce(
      (sum, file) => sum + (pending && this.present.has(file.path) ? 0 : file.bytes),
      0,
    );
  }
  async verify(file, bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== file.bytes)
      throw Error(`Incomplete speech model file: ${file.path}.`);
    const digest = await this.environment.crypto.subtle.digest('SHA-256', bytes),
      hex = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
    if (hex !== file.sha256) throw Error(`Speech model checksum failed: ${file.path}.`);
  }
  async read(path, { locked = false } = {}) {
    this.check();
    if (!locked) await this.deletion;
    const file = this.files.find((f) => f.path === path);
    if (!file) throw Error('Unknown speech model file.');
    const bytes = await this.backend.get(speechCachePrefix + path);
    this.check();
    try {
      await this.verify(file, bytes);
    } catch (error) {
      this.present.delete(path);
      await this.backend.delete(speechCachePrefix + path);
      throw error;
    }
    return bytes;
  }
  async download(onProgress = () => {}) {
    this.check();
    if (this.controller) throw Error('A speech download is already running.');
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    let loaded = 0;
    const total = this.size();
    const report = (bytes, status) => {
      if (!signal.aborted && !this.disposed)
        onProgress(Math.min(1, (loaded + bytes) / total), status);
    };
    try {
      await this.ready;
      await this.deletion;
      signal.throwIfAborted();
      this.check();
      await this.backend.lock(speechCachePrefix, async () => {
        await this.refresh();
        signal.throwIfAborted();
        for (const file of this.files) {
          let bytes = null;
          if (this.present.has(file.path)) {
            try {
              bytes = await this.read(file.path, { locked: true });
            } catch {
              bytes = null;
            }
          }
          signal.throwIfAborted();
          if (!bytes) {
            report(0, `Downloading ${file.path}`);
            const timeout = setTimeout(
              () =>
                controller.abort(
                  Error('Speech model download timed out. Try Download again to resume.'),
                ),
              120000,
            );
            try {
              const response = await this.environment.fetch(file.url, {
                signal,
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
              });
              if (!response.ok || !response.body)
                throw Error(`Speech download failed (HTTP ${response.status}): ${file.path}.`);
              bytes = new Uint8Array(file.bytes);
              const reader = response.body.getReader();
              let offset = 0,
                lastReport = 0;
              try {
                while (true) {
                  signal.throwIfAborted();
                  const { value, done } = await reader.read();
                  if (done) break;
                  if (offset + value.length > file.bytes)
                    throw Error('Speech model exceeds its declared size.');
                  bytes.set(value, offset);
                  offset += value.length;
                  if (Date.now() - lastReport > 100) {
                    report(offset, `Downloading ${file.path}`);
                    lastReport = Date.now();
                  }
                }
                if (offset !== file.bytes)
                  throw Error(`Incomplete speech model download: ${file.path}.`);
              } catch (error) {
                await reader.cancel().catch(() => {});
                throw error;
              } finally {
                reader.releaseLock();
              }
              await this.verify(file, bytes);
              signal.throwIfAborted();
              this.check();
              await this.backend.put(speechCachePrefix + file.path, bytes);
              // A file that completes during cancellation must not resurrect a
              // deleted model or appear as a successful unfinished download.
              if (signal.aborted || this.disposed) {
                await this.backend.delete(speechCachePrefix + file.path);
                signal.throwIfAborted();
                this.check();
              }
              this.present.add(file.path);
            } finally {
              clearTimeout(timeout);
            }
          }
          loaded += file.bytes;
          report(0, `Ready: ${file.path}`);
        }
      });
      signal.throwIfAborted();
      this.check();
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }
  cancel() {
    this.controller?.abort(Error('Speech model download cancelled.'));
  }
  delete() {
    this.check();
    if ([...this.engines].some((engine) => !engine.disposed))
      throw Error('Dispose the speech engine before deleting its models.');
    this.cancel();
    this.present.clear();
    this.deletion = this.backend.lock(speechCachePrefix, async () => {
      for (const key of await this.backend.keys(speechCachePrefix)) await this.backend.delete(key);
      this.present.clear();
    });
    return this.deletion;
  }
  dispose() {
    this.disposed = true;
    this.cancel();
  }
}
