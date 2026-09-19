#!/usr/bin/env node
import { parseArgs, resolveToolchain, saveConfig, run, cliError } from '../lib/toolchain.mjs';
try {
  const options = parseArgs(process.argv.slice(2), ['--dn'], ['--help']);
  if (options.help)
    console.log(
      'Usage: npm run setup -- [--dn /path/to/dn]\nInstalls the analysis dependencies and builds the browser runtime using your DartNative SDK.',
    );
  else {
    if (options.positionals.length)
      throw new Error('Unexpected argument. Use --dn to specify the SDK.');
    const toolchain = await resolveToolchain(options);
    console.log(`Using ${toolchain.dn}\n${toolchain.version}`);
    await saveConfig(toolchain);
    await run(toolchain.dart, ['pub', 'get', '--enforce-lockfile']);
    await run(process.execPath, ['scripts/build.mjs']);
    console.log(
      '\nSetup complete. Create a sample app with npm run demo -- ./demo, then run npm start -- --project ./demo.',
    );
  }
} catch (error) {
  cliError(error);
}
