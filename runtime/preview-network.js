import { dartInvocation } from './dart-environment.js';
import { DartTypedList } from './typed-data.js';
import { tutorialAvatarSource, tutorialAvatarRoute } from './tutorial-asset-urls.js';

export const networkCalls = new Set(['HttpClient', 'Uri.parse', 'Utf8Decoder', 'jsonDecode']);
const named = (fn) => Object.assign((...args) => fn(args, {}), { [dartInvocation]: fn });
export function networkURL(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw Error('Preview requests need an HTTP(S) URL without embedded credentials.');
  return url.href;
}
export async function responseBytes(response, limit, signal) {
  const length = Number(response.headers.get('content-length'));
  if (length > limit) {
    await response.body?.cancel();
    throw Error('Preview response exceeds the size limit.');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw Error('Preview response exceeds the size limit.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export class PreviewNetwork {
  constructor(environment = globalThis) {
    this.environment = environment;
    this.pending = new Set();
    this.disposed = false;
  }
  async read(
    url,
    {
      limit = 8 * 1024 * 1024,
      cache = 'default',
      credentials = 'omit',
      signal: outerSignal,
      client = null,
      headers,
    } = {},
  ) {
    if (this.disposed || client?.closed) throw Error('HTTP client is closed.');
    if (typeof this.environment.fetch !== 'function')
      throw Error('HTTP requests need a browser network connection.');
    const controller = new AbortController(),
      cancel = () => controller.abort(outerSignal?.reason || Error('Preview request cancelled.'));
    if (outerSignal?.aborted) cancel();
    else outerSignal?.addEventListener('abort', cancel, { once: true });
    this.pending.add(controller);
    client?.pending.add(controller);
    const timeout = setTimeout(
      () => controller.abort(Error('Preview request timed out after 15 seconds.')),
      15000,
    );
    try {
      const requestURL =
        url === tutorialAvatarSource && this.environment.location?.origin
          ? new URL(tutorialAvatarRoute, this.environment.location.origin).href
          : url;
      const response = await this.environment.fetch(requestURL, {
        method: 'GET',
        credentials,
        cache,
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
        ...(headers ? { headers } : {}),
      });
      const bytes = await responseBytes(response, limit, controller.signal);
      controller.signal.throwIfAborted();
      return {
        bytes,
        status: response.status,
        type: response.headers.get('content-type') || 'application/octet-stream',
      };
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw Error(
        `Preview request failed. The server must allow browser requests (CORS). ${error.message}`,
      );
    } finally {
      clearTimeout(timeout);
      outerSignal?.removeEventListener('abort', cancel);
      this.pending.delete(controller);
      client?.pending.delete(controller);
    }
  }
  invoke(name, args, props) {
    if (name === 'Uri.parse') {
      const text = String(args[0]);
      return { uri: text, toString: () => text };
    }
    if (name === 'Utf8Decoder')
      return { utf8Decoder: true, allowMalformed: props.allowMalformed ?? false };
    if (name === 'jsonDecode') {
      if (typeof args[0] !== 'string' || args[0].length > 8 * 1024 * 1024)
        throw Error('JSON input must be text under 8 MB.');
      return JSON.parse(args[0], (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.assign(Object.create(null), value)
          : value,
      );
    }
    const client = { closed: false, aborted: false, pending: new Set() };
    return {
      getUrl: async (uri) => {
        if (client.closed || this.disposed) throw Error('HTTP client is closed.');
        const url = networkURL(uri?.uri),
          headers = Object.create(null);
        let sent = false;
        const headerAPI = {
          set: (name, value) => {
            if (sent) throw Error('HTTP request has already been sent.');
            if (
              typeof name !== 'string' ||
              !['accept', 'accept-language'].includes(name.toLowerCase()) ||
              typeof value !== 'string' ||
              value.length > 1024 ||
              /[\r\n\0]/.test(value)
            )
              throw Error('Preview HTTP headers support bounded Accept and Accept-Language text.');
            headers[name.toLowerCase()] = value;
            return null;
          },
        };
        return {
          headers: headerAPI,
          close: async () => {
            if (sent) throw Error('HTTP request has already been sent.');
            sent = true;
            const response = await this.read(url, { client, headers });
            let consumed = false;
            const owner = this;
            const consume = () => {
              if (owner.disposed || client.aborted) throw Error('HTTP client is closed.');
              if (consumed) throw Error('HTTP response has already been consumed.');
              consumed = true;
            };
            return {
              statusCode: response.status,
              contentLength: response.bytes.length,
              async *[Symbol.asyncIterator]() {
                consume();
                for (let offset = 0; offset < response.bytes.length; offset += 65536) {
                  if (owner.disposed || client.aborted) throw Error('HTTP client is closed.');
                  yield new DartTypedList(
                    'Uint8List',
                    response.bytes.slice(offset, offset + 65536),
                  );
                }
              },
              transform: (decoder) => {
                if (!decoder?.utf8Decoder)
                  throw Error('Preview HTTP responses support Utf8Decoder.');
                return {
                  join: async () => {
                    consume();
                    return new TextDecoder('utf-8', { fatal: !decoder.allowMalformed }).decode(
                      response.bytes,
                    );
                  },
                };
              },
            };
          },
        };
      },
      close: named((_args, { force = false }) => {
        client.closed = true;
        client.aborted ||= force;
        if (force)
          for (const controller of client.pending)
            controller.abort(Error('HTTP client was closed.'));
        return null;
      }),
    };
  }
  dispose() {
    this.disposed = true;
    for (const controller of this.pending)
      controller.abort(Error('Preview request cancelled after reset.'));
    this.pending.clear();
  }
}
