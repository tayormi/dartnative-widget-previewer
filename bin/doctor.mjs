#!/usr/bin/env node
import {
  parseArgs,
  checkNode,
  resolveToolchain,
  checkInstallation,
  checkProject,
  listDevices,
} from '../lib/toolchain.mjs';
import path from 'node:path';
const checks = [];
async function check(name, fn) {
  try {
    checks.push({ name, ok: true, detail: (await fn()) || 'Ready' });
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
  }
}
let options;
try {
  options = parseArgs(
    process.argv.slice(2),
    ['--dn', '--project'],
    ['--native', '--json', '--help'],
  );
} catch (error) {
  console.error(error.message);
  process.exit(64);
}
if (options.help) {
  console.log('Usage: npm run doctor -- [--dn PATH] [--project PATH] [--native] [--json]');
} else {
  await check('Node.js', () => {
    checkNode();
    return process.versions.node;
  });
  await check('DartNative SDK', async () => {
    const t = await resolveToolchain(options);
    return `${t.dn} (${t.version})`;
  });
  await check('Previewer installation', checkInstallation);
  if (options.project)
    await check('Application dependencies', () => checkProject(path.resolve(options.project)));
  if (options.native) {
    await check('iOS simulators', async () => {
      const devices = await listDevices();
      if (!devices.length)
        throw new Error(
          'No iOS simulators are installed. Add an iOS runtime and simulator in Xcode.',
        );
      return devices.map((d) => `${d.name} (${d.runtime}, ${d.state})`).join(', ');
    });
  }
  if (options.json) console.log(JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2));
  else for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}
