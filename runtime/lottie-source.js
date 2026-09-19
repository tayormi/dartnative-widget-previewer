import JSZip from 'jszip';

export const lottieLimits = {
  download: 8 * 1024 * 1024,
  json: 16 * 1024 * 1024,
  entries: 128,
  nodes: 500000,
  depth: 100,
};
const textDecoder = new TextDecoder('utf-8', { fatal: true });
function parseJSON(bytes) {
  try {
    return JSON.parse(textDecoder.decode(bytes));
  } catch {
    throw Error('Lottie animation contains invalid JSON.');
  }
}
const safePath = (name) =>
  typeof name === 'string' &&
  !name.startsWith('/') &&
  !name.includes('\\') &&
  !name.includes('\0') &&
  !name.split('/').some((part) => part === '..' || part === '.') &&
  !name.includes(':');
async function unzip(file, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0,
      failed = false;
    const stream = file.internalStream('uint8array');
    stream.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        stream.pause();
        reject(Error('Lottie archive expands beyond the size limit.'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (failed) return;
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(bytes);
    });
    stream.resume();
  });
}
// The light SVG player has no expression evaluator. Validate before handing
// data to it, including its resource-loading and precomposition entry points.
export function validateLottie(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.layers))
    throw Error('Lottie JSON needs an animation with layers.');
  for (const key of ['w', 'h', 'fr', 'ip', 'op'])
    if (!Number.isFinite(data[key])) throw Error(`Lottie ${key} must be finite.`);
  if (
    data.w <= 0 ||
    data.h <= 0 ||
    data.w > 8192 ||
    data.h > 8192 ||
    data.fr <= 0 ||
    data.fr > 240 ||
    data.op <= data.ip ||
    (data.op - data.ip) / data.fr > 3600
  )
    throw Error('Lottie dimensions or duration exceed the preview limits.');
  if (data.segments?.length)
    throw Error('Lottie animations with external segments need another browser adapter.');
  if (data.fonts?.list?.length || data.chars?.length)
    throw Error('Lottie text and external fonts need another browser adapter.');
  let count = 0;
  function visit(value, path = [], depth = 0) {
    if (++count > lottieLimits.nodes || depth > lottieLimits.depth)
      throw Error('Lottie animation exceeds the complexity limit.');
    if (!value || typeof value !== 'object') return;
    if (value.ef?.length) throw Error('Lottie effects are not supported by this browser player.');
    if (value.ddd) throw Error('Lottie 3D layers need another browser adapter.');
    if (typeof value.x === 'string') {
      // Older exporters sometimes emit this exact identity expression on
      // scale. Its result is the existing scale keyframes; no JS is executed.
      if (
        path.at(-2) === 'ks' &&
        path.at(-1) === 's' &&
        value.k != null &&
        /^\s*var \$bm_rt;\s*\$bm_rt\s*=\s*transform\.scale;?\s*$/.test(value.x)
      )
        delete value.x;
      else throw Error('Lottie expressions cannot execute in the browser preview.');
    }
    if (typeof value.ty === 'number' && ![0, 1, 2, 3, 4].includes(value.ty))
      throw Error(`Lottie layer type ${value.ty} needs another browser adapter.`);
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw Error('Invalid Lottie object key.');
      visit(child, [...path, key], depth + 1);
    }
  }
  visit(data);
  const assets = new Map();
  for (const asset of data.assets || []) {
    if (asset.p != null) {
      if (asset.u || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(asset.p))
        throw Error(
          'Lottie raster images must be embedded PNG, JPEG or WebP data. External images need another browser adapter.',
        );
      asset.e = 1;
    }
    if (asset.layers) {
      if (assets.has(asset.id)) throw Error('Duplicate Lottie composition.');
      assets.set(asset.id, asset.layers);
    }
  }
  const costs = new Map(),
    visiting = new Set();
  function composition(layers) {
    let expanded = 0;
    for (const layer of layers) {
      expanded++;
      if (layer.ty === 0) {
        const id = layer.refId;
        if (!assets.has(id)) throw Error('Lottie composition reference is missing.');
        if (visiting.has(id)) throw Error('Lottie composition contains a cycle.');
        if (!costs.has(id)) {
          visiting.add(id);
          costs.set(id, composition(assets.get(id)));
          visiting.delete(id);
        }
        expanded += costs.get(id);
      }
      if (expanded > 10000) throw Error('Lottie composition exceeds the layer limit.');
    }
    return expanded;
  }
  composition(data.layers);
  for (const layers of assets.values()) composition(layers);
  return data;
}
export async function decodeLottieSource(input) {
  let bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  if (bytes.length > lottieLimits.download) throw Error('Lottie download exceeds 8 MB.');
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const archive = await JSZip.loadAsync(bytes);
    const entries = Object.values(archive.files);
    if (entries.length > lottieLimits.entries) throw Error('Lottie archive has too many entries.');
    for (const file of entries)
      if (!safePath(file.unsafeOriginalName ?? file.name))
        throw Error('Lottie archive contains an unsafe path.');
    const files = entries.filter(
      (file) =>
        !file.dir &&
        !file.name
          .split('/')
          .some((part) => part === '__MACOSX' || part.startsWith('._') || part.startsWith('.')),
    );
    const manifest = files.find((file) => file.name === 'manifest.json');
    let selected;
    if (manifest) {
      const value = parseJSON(await unzip(manifest, 64 * 1024)),
        id = value.activeAnimationId ?? value.animations?.[0]?.id;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id))
        throw Error('DotLottie manifest has no valid animation.');
      selected = files.find(
        (file) => file.name === `animations/${id}.json` || file.name === `a/${id}.json`,
      );
      if (!selected) throw Error('DotLottie manifest references a missing animation.');
    } else {
      const animations = files.filter((file) => file.name.endsWith('.json'));
      if (animations.length !== 1)
        throw Error('Lottie ZIP needs one animation JSON or a DotLottie manifest.');
      selected = animations[0];
    }
    bytes = await unzip(selected, lottieLimits.json);
  }
  const data = validateLottie(parseJSON(bytes));
  return { data, bytes: bytes.length };
}
