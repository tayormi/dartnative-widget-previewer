#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, copyFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, resolveToolchain, cliError } from '../lib/toolchain.mjs';
const exec = promisify(execFile);
async function main() {
  const options = parseArgs(process.argv.slice(2), ['--dn'], ['--help']);
  if (options.help || options.positionals.length === 0) {
    console.log('Usage: npm run demo -- /new/demo/path [--dn /path/to/dn]');
    if (!options.help) process.exitCode = 64;
    return;
  }
  if (options.positionals.length > 2) throw new Error('Supply one new demo directory.');
  // Keep the original two-positional CLI usable for existing installations.
  const destinationArg = options.positionals.at(-1);
  const { dn, sdk } = await resolveToolchain({
    ...options,
    dn: options.dn || (options.positionals.length === 2 ? options.positionals[0] : undefined),
  });
  const destination = path.resolve(destinationArg);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (await stat(destination).catch(() => null))
    throw new Error('Demo destination must not already exist');
  console.log('Creating an iOS DartNative demo…');
  await exec(
    dn,
    [
      '--suppress-analytics',
      'create',
      '--platforms=ios',
      '--org',
      'dev.nativelab',
      '--project-name',
      'dn_preview_demo',
      destination,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const pubspec = path.join(destination, 'pubspec.yaml');
  const annotation = path
    .relative(destination, path.join(root, 'packages/dartnative_preview'))
    .replaceAll(path.sep, '/');
  await writeFile(
    pubspec,
    (await readFile(pubspec, 'utf8')).replace(
      'dependencies:\n',
      `dependencies:\n  dartnative_preview:\n    path: ${JSON.stringify(annotation)}\n`,
    ),
  );
  for (const file of ['a_components.dart', 'previews.dart', 'library.dart']) {
    await copyFile(path.join(root, 'examples', file), path.join(destination, 'lib', file));
  }
  await writeFile(
    path.join(destination, 'lib/main.dart'),
    `import 'package:dartnative/dartnative.dart';
import 'dartnative_plugin_registrant.dart';
import 'library.dart';

void main() {
  DartNativePluginRegistrant.registerAll();
  runApp(const LibraryScreen());
}
`,
  );
  // Only this freshly generated demo is adjusted. Existing app projects are untouched.
  const podfile = path.join(destination, 'ios/Podfile');
  let pods = await readFile(podfile, 'utf8');
  pods = pods.replace("platform :ios, '14.0'", "platform :ios, '15.0'");
  pods = pods.replace(
    '    dartnative_additional_ios_build_settings(target)',
    `    dartnative_additional_ios_build_settings(target)
    target.build_configurations.each do |config|
      current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0' if current < 15.0
    end`,
  );
  await writeFile(podfile, pods);
  const pbx = path.join(destination, 'ios/Runner.xcodeproj/project.pbxproj');
  await writeFile(
    pbx,
    (await readFile(pbx, 'utf8')).replaceAll(
      'IPHONEOS_DEPLOYMENT_TARGET = 14.0;',
      'IPHONEOS_DEPLOYMENT_TARGET = 15.0;',
    ),
  );
  await exec(dn, ['--suppress-analytics', 'pub', 'get'], {
    cwd: destination,
    maxBuffer: 4 * 1024 * 1024,
  });
  await mkdir(path.join(destination, '.vscode'), { recursive: true });
  await writeFile(
    path.join(destination, '.vscode/settings.json'),
    JSON.stringify(
      {
        'dartnativePreview.toolPath': root,
        'dartnativePreview.nodePath': process.execPath,
        'dart.sdkPath': sdk,
        'dart.runPubGetOnPubspecChanges': 'never',
      },
      null,
      2,
    ) + '\n',
  );
  const ignore = path.join(destination, '.gitignore');
  await writeFile(
    ignore,
    (await readFile(ignore, 'utf8').catch(() => '')) +
      '\n# Widget preview host and local IDE settings\nlib/dn_preview_generated.dart\n.vscode/settings.json\n',
  );
  console.log(
    `Demo created at ${destination}\nStart browser previews with npm start -- --project ${JSON.stringify(destination)}.\nThe demo also includes its VS Code previewer settings.`,
  );
}
await main().catch(cliError);
