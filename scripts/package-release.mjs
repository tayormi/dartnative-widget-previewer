import path from 'node:path';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { root, run, cliError } from '../lib/toolchain.mjs';

// Ship source and the extension. Each consumer resolves their own SDK and builds
// browser assets; caches, project data and machine-specific configuration stay local.
const directories = [
  'assets',
  'bin',
  'examples',
  'lib',
  'packages',
  'runtime',
  'scripts',
  'test',
  'vscode',
  'web',
  'docs',
];
const rootFiles = [
  '.editorconfig',
  '.gitignore',
  '.prettierrc.json',
  'package.json',
  'package-lock.json',
  'pubspec.yaml',
  'pubspec.lock',
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'THIRD_PARTY_NOTICES.md',
];
const excluded = new Set(['node_modules', '.dart_tool', '.local', '.git', '.DS_Store', 'dist']);
const generated = [
  'web/vendor/',
  'web/fonts/',
  'web/onnx/',
  'web/licenses/',
  'web/parser/bridge.js',
];
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

try {
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const extension = JSON.parse(await readFile(path.join(root, 'vscode/package.json'), 'utf8'));
  await run(process.execPath, ['scripts/build.mjs']);
  await run(process.execPath, ['scripts/package-extension.mjs']);
  const archive = new JSZip();
  const folder = archive.folder('dartnative-previewer');
  const files = [];
  async function add(relative) {
    const portable = relative.split(path.sep).join('/');
    if (
      portable.split('/').some((part) => excluded.has(part)) ||
      generated.some((prefix) => portable.startsWith(prefix)) ||
      /(?:^|\/)\.env(?:\.|$)|\.(?:log|vsix)$/.test(portable)
    )
      return;
    const absolute = path.join(root, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw Error(`Archive source must not be a symlink: ${portable}`);
    if (info.isDirectory()) {
      for (const entry of (await readdir(absolute)).sort()) await add(path.join(relative, entry));
      return;
    }
    const data = await readFile(absolute);
    folder.file(portable, data, {
      unixPermissions: info.mode,
      date: new Date('2026-01-01T00:00:00Z'),
    });
    files.push({ path: portable, bytes: data.length, sha256: sha256(data) });
  }
  for (const file of rootFiles) {
    if (await lstat(path.join(root, file)).catch(() => null)) await add(file);
  }
  for (const directory of directories) await add(directory);
  const vsixName = `dartnative-widget-previewer-${extension.version}.vsix`;
  const vsix = await readFile(path.join(root, 'dist', vsixName));
  folder.file(`dist/${vsixName}`, vsix);
  files.push({ path: `dist/${vsixName}`, bytes: vsix.length, sha256: sha256(vsix) });
  folder.file(
    'RELEASE-MANIFEST.json',
    JSON.stringify({ version, extensionVersion: extension.version, files }, null, 2) + '\n',
  );
  const zipName = `dartnative-previewer-${version}.zip`;
  const zip = await archive.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist', zipName), zip);
  await writeFile(
    path.join(root, 'dist', 'SHA256SUMS.txt'),
    `${sha256(zip)}  ${zipName}\n${sha256(vsix)}  ${vsixName}\n`,
  );
  console.log(
    `Packaged ${files.length} files: dist/${zipName}\nExtension: dist/${vsixName}\nChecksums: dist/SHA256SUMS.txt`,
  );
} catch (error) {
  cliError(error);
}
