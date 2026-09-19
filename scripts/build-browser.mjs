import { build } from 'esbuild';
import { readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function inlineStyles(file, visited = new Set()) {
  if (visited.has(file)) return '';
  visited.add(file);
  let source = await readFile(file, 'utf8');
  for (const match of [...source.matchAll(/@import\s+['"]([^'"]+)['"];?/g)]) {
    source = source.replace(
      match[0],
      await inlineStyles(path.resolve(path.dirname(file), match[1]), visited),
    );
  }
  return source.replace(/@import\s+url\([^;]+\);?/g, '');
}
const vendor = path.join(root, 'web/vendor');
await mkdir(vendor, { recursive: true });
await build({
  entryPoints: [path.join(root, 'web/browser-entry.js')],
  outfile: path.join(vendor, 'browser-runtime.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  plugins: [
    {
      name: 'inline-css',
      setup(build) {
        build.onResolve({ filter: /\?inline$/ }, (args) => ({
          path: path.resolve(args.resolveDir, args.path.replace('?inline', '')),
          namespace: 'inline-css',
        }));
        build.onLoad({ filter: /.*/, namespace: 'inline-css' }, async (args) => ({
          contents: await inlineStyles(args.path),
          loader: 'text',
        }));
      },
    },
  ],
});
// These workers are constructed with new URL(..., import.meta.url). Bundle
// them beside browser-runtime.js at the same URLs.
await build({
  entryPoints: ['lottie-worker.js', 'speech-worker.js'].map((name) =>
    path.join(root, 'runtime', name),
  ),
  outdir: vendor,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
});
await mkdir(path.join(root, 'web/onnx'), { recursive: true });
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await cp(
    path.join(root, 'node_modules/onnxruntime-web/dist', name),
    path.join(root, 'web/onnx', name),
  );
}
for (const name of ['fonts', 'licenses'])
  await cp(path.join(root, 'assets', name), path.join(root, 'web', name), { recursive: true });
for (const [source, name] of [
  ['node_modules/lottie-web/LICENSE.md', 'lottie-web.txt'],
  ['node_modules/jszip/LICENSE.markdown', 'jszip.txt'],
])
  await cp(path.join(root, source), path.join(root, 'web/licenses', name));
await writeFile(
  path.join(vendor, 'preview.css'),
  await readFile(path.join(root, 'runtime/preview-fonts.css')),
);
console.log('Built the browser runtime and workers from local source.');
