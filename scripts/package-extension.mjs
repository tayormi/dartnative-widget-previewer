import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { root, run, cliError } from '../lib/toolchain.mjs';
try {
  const { version } = JSON.parse(await readFile(path.join(root, 'vscode/package.json'), 'utf8'));
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await run(
    process.execPath,
    [
      path.join(root, 'node_modules/@vscode/vsce/vsce'),
      'package',
      '--allow-missing-repository',
      '--out',
      `../dist/dartnative-widget-previewer-${version}.vsix`,
    ],
    { cwd: path.join(root, 'vscode') },
  );
} catch (error) {
  cliError(error);
}
