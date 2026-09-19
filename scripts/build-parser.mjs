import { mkdir, rm } from 'node:fs/promises';
import { resolveToolchain, run, cliError, root } from '../lib/toolchain.mjs';
import path from 'node:path';
try {
  const { dart } = await resolveToolchain();
  await mkdir(path.join(root, 'web/parser'), { recursive: true });
  await run(dart, [
    'compile',
    'js',
    'bin/browser-bridge.dart',
    '-O2',
    '--no-source-maps',
    '-o',
    'web/parser/bridge.js',
  ]);
  // Dart's dependency sidecar includes machine-local cache paths and is not a runtime asset.
  await rm(path.join(root, 'web/parser/bridge.js.deps'), { force: true });
  await rm(path.join(root, 'web/parser/bridge.js.map'), { force: true });
} catch (error) {
  cliError(error);
}
