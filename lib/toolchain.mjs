import { access, readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);
export const configPath = path.join(root, '.dart_tool/previewer-config.json');
export function parseArgs(args, values = [], flags = []) {
  const result = { positionals: [] };
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (flags.includes(token)) result[token.slice(2)] = true;
    else if (values.includes(token)) {
      if (!args[i + 1] || args[i + 1].startsWith('--'))
        throw new Error(`${token} requires a value.`);
      result[token.slice(2)] = args[++i];
    } else if (token.startsWith('-'))
      throw new Error(`Unknown option: ${token}. Use --help for available options.`);
    else result.positionals.push(token);
  }
  return result;
}
export function checkNode(version = process.versions.node) {
  if (Number(version.split('.')[0]) < 22)
    throw new Error(
      `Node.js 22 or later is required; found ${version}. Install a current Node.js release and retry.`,
    );
}
async function executable(file) {
  try {
    await access(file, constants.X_OK);
    return await realpath(file);
  } catch {
    return null;
  }
}
export async function findOnPath(name, env = process.env) {
  for (const directory of (env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const found = await executable(path.join(directory, name));
    if (found) return found;
  }
  return null;
}
export async function readConfig() {
  try {
    return JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(
      'Previewer configuration is invalid. Run npm run setup -- --dn /path/to/dn again.',
    );
  }
}
export async function resolveToolchain({ dn, env = process.env, saved, project } = {}) {
  checkNode();
  const explicit = dn || env.DN_PATH;
  const configured = saved === undefined ? await readConfig() : saved;
  const candidates = explicit ? [explicit] : [configured.dn, await findOnPath('dn', env)];
  if (!explicit && project) {
    try {
      const file = path.join(project, '.dart_tool/package_config.json');
      const pkg = JSON.parse(await readFile(file, 'utf8')).packages.find(
        (p) => p.name === 'dartnative',
      );
      const pkgPath = fileURLToPath(new URL(pkg.rootUri, pathToFileURL(file)));
      if (pkgPath.includes('/bin/cache/pkg/dartnative'))
        candidates.push(path.resolve(pkgPath, '../../../dn'));
    } catch {
      /* A new or unresolved app need not have package metadata yet. */
    }
  }
  for (const candidate of candidates.filter(Boolean)) {
    const command =
      path.isAbsolute(candidate) || candidate.includes(path.sep)
        ? await executable(path.resolve(candidate))
        : await findOnPath(candidate, env);
    if (!command) continue;
    const sdk = path.join(path.dirname(command), 'cache/dart-sdk');
    const dart = await executable(path.join(sdk, 'bin/dart'));
    if (!dart) continue;
    try {
      await access(path.join(path.dirname(command), 'cache/pkg/dartnative/pubspec.yaml'));
    } catch {
      continue;
    }
    const { stdout, stderr } = await exec(dart, ['--version'], { timeout: 10000 });
    const version = (stdout || stderr).trim();
    const match = version.match(/Dart SDK version: (\d+)\.(\d+)/);
    if (!match || Number(match[1]) !== 3 || Number(match[2]) < 9)
      throw new Error(`Dart 3.9 or later is required. Found ${version}.`);
    return { dn: command, dart, sdk, version };
  }
  const detail = explicit
    ? `The supplied SDK path (${explicit}) does not contain a usable DartNative SDK.`
    : 'DartNative SDK was not found.';
  throw new Error(
    `${detail}\nRun npm run setup -- --dn /absolute/path/to/your-sdk/bin/dn. You can also put dn on PATH or set DN_PATH. Initialize the SDK with dn doctor if its cache is missing.`,
  );
}
export async function saveConfig(toolchain) {
  await mkdir(path.dirname(configPath), { recursive: true });
  // Machine-local paths only. SDK credentials remain in the SDK's own store.
  await writeFile(
    configPath,
    JSON.stringify({ version: 1, dn: toolchain.dn, node: process.execPath }, null, 2) + '\n',
    { mode: 0o600 },
  );
}
export async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    child.once('error', (error) =>
      reject(new Error(`Could not run ${path.basename(command)}: ${error.message}`)),
    );
    child.once('exit', (code, signal) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${path.basename(command)} failed (${signal || `exit ${code}`}). See the output above.`,
            ),
          ),
    );
  });
}
export async function checkInstallation() {
  for (const [file, remedy] of [
    ['node_modules/serve-sim/package.json', 'Run npm ci.'],
    ['.dart_tool/package_config.json', 'Run npm run setup.'],
    ['web/parser/bridge.js', 'Run npm run build.'],
    ['web/vendor/browser-runtime.js', 'Run npm run build.'],
    ['web/fonts/MaterialSymbolsRounded.ttf', 'Run npm run build.'],
  ]) {
    try {
      await access(path.join(root, file));
    } catch {
      throw new Error(`Previewer file is missing: ${file}. ${remedy}`);
    }
  }
}
export async function checkProject(project) {
  for (const [file, remedy] of [
    ['pubspec.yaml', 'Choose the root folder of a DartNative app.'],
    ['lib', 'The application must have a lib directory.'],
    ['.dart_tool/package_config.json', 'Run dn pub get in the application folder first.'],
  ]) {
    try {
      await access(path.join(project, file));
    } catch {
      throw new Error(`Project is missing ${file}. ${remedy}`);
    }
  }
  const packages = JSON.parse(
    await readFile(path.join(project, '.dart_tool/package_config.json'), 'utf8'),
  ).packages;
  if (!packages.some((p) => p.name === 'dartnative'))
    throw new Error(
      'This project does not resolve package:dartnative. Use dn pub get with the DartNative SDK.',
    );
  if (!packages.some((p) => p.name === 'dartnative_preview'))
    throw new Error(
      'Add the dartnative_preview annotation dependency, then run dn pub get. See the README section “Use your project”.',
    );
}
export async function listDevices() {
  if (process.platform !== 'darwin')
    throw new Error('Native iOS preview requires macOS and Xcode.');
  let output;
  try {
    output = await exec('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
      timeout: 15000,
    });
  } catch {
    throw new Error(
      'Xcode simulator tools are unavailable. Install Xcode, select its developer directory, and finish its first-launch setup.',
    );
  }
  return Object.entries(JSON.parse(output.stdout).devices).flatMap(([runtime, devices]) =>
    runtime.includes('.iOS-')
      ? devices
          .filter((d) => d.isAvailable)
          .map((d) => ({
            id: d.udid,
            name: d.name,
            state: d.state,
            runtime: runtime.split('.').at(-1).replaceAll('-', ' '),
          }))
      : [],
  );
}
export async function prepareDevice(id) {
  const devices = await listDevices();
  const booted = devices.filter((d) => d.state === 'Booted');
  const device = id ? devices.find((d) => d.id === id) : booted.length === 1 ? booted[0] : null;
  if (!device)
    throw new Error(
      id
        ? 'The selected iOS simulator is not available. Choose another simulator.'
        : 'Choose an iOS simulator before starting native preview.',
    );
  if (device.state !== 'Booted') {
    await exec('xcrun', ['simctl', 'boot', device.id], { timeout: 30000 });
    await exec('xcrun', ['simctl', 'bootstatus', device.id, '-b'], { timeout: 120000 });
  }
  return device.id;
}
export function cliError(error) {
  console.error(`\nDartNative Previewer: ${error.message}`);
  process.exitCode = 1;
}
