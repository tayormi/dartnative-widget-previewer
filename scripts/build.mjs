import { run, cliError } from '../lib/toolchain.mjs';
try {
  await run(process.execPath, ['scripts/build-parser.mjs']);
  await run(process.execPath, ['scripts/build-browser.mjs']);
} catch (error) {
  cliError(error);
}
